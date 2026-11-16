import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';

const read=(path:string)=>readFile(new URL(path,import.meta.url),'utf8');
test('mesclagem mantém originais, soma fretes, bloqueia clientes diferentes e contabiliza sem duplicidade',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create schema pamda_private;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   set check_function_bodies=off;`);
  await db.exec(await read('./fixtures/merge-closing-schema.sql'));
  await db.exec(`create function public.pamda_has_permission(text) returns boolean language sql stable as $$select auth.uid() is not null$$;
   create function pamda_private.require_permission(text) returns void language plpgsql as $$begin if auth.uid() is null then raise exception 'Sem permissão' using errcode='42501';end if;end$$;
   create function pamda_private.audit(text,uuid,jsonb) returns void language sql as $$select$$;
   create function pamda_private.check_production_items(uuid,jsonb) returns void language sql as $$select$$;
   create function pamda_private.production_item_managed(uuid,jsonb,uuid,numeric) returns boolean language sql as $$select false$$;
   create table public.erp_expenses(amount numeric,expense_date date);
   create sequence public.qa_order_number start 10000;
   create function public.pamda_iniciar_venda(p_cliente_id uuid,p_filial_id uuid,p_draft_key uuid) returns uuid language plpgsql as $$declare v uuid;begin
    insert into public.erp_sales(customer_id,branch_id,created_by,customer_snapshot,branch_snapshot,seller_snapshot,draft_key,order_number,is_test)
    values(p_cliente_id,p_filial_id,auth.uid(),jsonb_build_object('name','QA','code','QA'),jsonb_build_object('name','QA'),'QA',p_draft_key,nextval('public.qa_order_number'),false) returning id into v;return v;end$$;
   create function public.qa_first_product() returns trigger language plpgsql as $$begin update public.erp_sales set first_product_at=coalesce(first_product_at,now()) where id=new.sale_id;return new;end$$;
   create trigger qa_first_product after insert on public.erp_sale_items for each row execute function public.qa_first_product();
   insert into public.erp_user_profiles(user_id,username,role,active) values(gen_random_uuid(),'QA','admin_gerencial',true);
   insert into public.customers(customer_code,name) values('QA1','QA1'),('QA2','QA2');
   insert into public.customer_branches(customer_id,name) select id,'QA' from public.customers;
   insert into public.erp_payment_methods(code,name,active) values('pix','Pix',true);
   insert into public.erp_operational_settings(singleton,production_after_payment) values(true,false) on conflict do nothing;`);
  await db.exec(`select set_config('request.jwt.claim.sub',(select user_id::text from public.erp_user_profiles limit 1),false);
   do $legacy$ declare c uuid;b uuid;pr uuid;s uuid;ids uuid[]:='{}';n int;begin
    select customer_id,id into c,b from public.customer_branches limit 1;
    insert into public.products(code,sku,name,type,current_cost,sale_price,controls_inventory) values('LEGACY','LEGACY','Legacy', 'fisico',5,25,false) returning id into pr;
    for n in 1..2 loop
     s:=public.pamda_iniciar_venda(c,b,gen_random_uuid());ids:=array_append(ids,s);
     insert into public.erp_sale_items(sale_id,product_id,product_code_snapshot,product_sku_snapshot,description_snapshot,quantity,negotiated_unit_price,customization) values(s,pr,'LEGACY','LEGACY','Legacy',1,25,'{}');
     update public.erp_sales set subtotal=25,shipping_charged=5,shipping_confirmed=true where id=s;
    end loop;
    perform public.pamda_merge_pending_sales(ids,gen_random_uuid());
   end $legacy$;`);
  await db.exec(await read('../supabase/migrations/20261116183156_merge_closing_preserve_originals_and_freight.sql'));
  assert.equal((await db.query<{n:number}>('select count(*)::int n from public.erp_sale_items where source_sale_item_id is not null')).rows[0].n,2,'vínculos antigos recuperados');
  assert.equal((await db.query<{n:number}>("select count(*)::int n from public.erp_sales s join public.erp_sale_merges m on m.sale_id=s.id where s.shipping_charged=10 and s.shipping_confirmed")).rows[0].n,1,'frete do fechamento antigo reparado');
  await db.exec(await read('./merge-closing-preservation-homologation.sql'));
  assert.equal((await db.query<{n:number}>('select count(*)::int n from public.erp_sales')).rows[0].n,3,'QA não deixa pedidos, pagamentos ou contadores de teste');
  const policy=(await db.query<{qual:string}>("select qual from pg_policies where tablename='erp_sale_merges'")).rows[0].qual as string;
  assert.match(policy,/sales.read/);
 }finally{await db.close();}
});
