-- Closing permission includes opening another operator's draft and receiving its payment.
do $$ declare d text; begin
 select pg_get_functiondef('public.pamda_finalize_sale(uuid,jsonb,uuid)'::regprocedure) into d;
 if position('Finalize apenas suas próprias vendas' in d)=0 or position('Estoque não conferido ou insuficiente para finalizar' in d)=0 then raise exception 'Unexpected finalization definition'; end if;
 d:=replace(d,'if not public.pamda_is_admin() and s.created_by<>auth.uid() then raise exception ''Finalize apenas suas próprias vendas'' using errcode=''42501''; end if;','');
 d:=replace(d,'perform pamda_private.require_permission(''finance.manage'');','-- sales.confirm authorizes receiving this sale only.');
 d:=replace(d,'if not exists(select 1 from public.products where id=c.product_id and stock_verified and current_inventory>=c.qty) then raise exception ''Estoque não conferido ou insuficiente para finalizar''; end if;', $r$
 if exists(select 1 from public.products where id=c.product_id and (not stock_verified or current_inventory<c.qty)) then
 perform pamda_private.audit('sale.stock_shortage',s.id,jsonb_build_object('product_id',c.product_id,'quantity',c.qty,'inventory',(select current_inventory from public.products where id=c.product_id)));
 end if;
 $r$);
 execute d;
 select pg_get_functiondef('public.pamda_salvar_rascunho_venda(uuid,uuid,jsonb,numeric,numeric,text,text,uuid,uuid,uuid)'::regprocedure) into d;
 if position('v_owner<>v_user AND NOT public.pamda_is_admin()' in d)=0 then raise exception 'Unexpected draft definition'; end if;
 d:=replace(d,'v_owner<>v_user AND NOT public.pamda_is_admin()','v_owner<>v_user AND NOT public.pamda_has_permission(''sales.confirm'')');
 execute d;
 select pg_get_functiondef('public.pamda_stock_write(jsonb,uuid)'::regprocedure) into d;
 if position('if v_product.current_inventory+v_qty<0 then raise exception ''Saldo insuficiente''; end if;' in d)=0 then raise exception 'Unexpected stock definition'; end if;
 -- Incoming stock can reduce a shortage progressively; physical counts remain nonnegative.
 d:=replace(d,'if v_product.current_inventory+v_qty<0 then raise exception ''Saldo insuficiente''; end if;','');
 execute d;
end $$;
-- A negative balance is a recorded shortage, never fabricated incoming stock.
alter table public.products drop constraint products_current_inventory_check;
alter table public.erp_stock_movements drop constraint erp_stock_movements_balance_after_check;

create table public.erp_sale_merges(
 request_key uuid primary key,actor_user_id uuid not null references auth.users(id),
 sale_id uuid not null references public.erp_sales(id),source_ids uuid[] not null,created_at timestamptz not null default now()
);
alter table public.erp_sale_merges enable row level security;
revoke all on public.erp_sale_merges from anon,authenticated;
grant select on public.erp_sale_merges to authenticated;
create policy sale_merges_read on public.erp_sale_merges for select to authenticated using(public.pamda_has_permission('sales.confirm'));

create function public.pamda_merge_pending_sales(p_sale_ids uuid[],p_request_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_ids uuid[]; v_old public.erp_sale_merges%rowtype; s public.erp_sales%rowtype; v_id uuid; v_count integer;
begin
 perform pamda_private.require_permission('sales.confirm');
 if p_request_key is null or p_sale_ids is null or cardinality(p_sale_ids) not between 2 and 50 then raise exception 'Selecione entre 2 e 50 pendências'; end if;
 select array_agg(distinct x order by x) into v_ids from unnest(p_sale_ids) x;
 if cardinality(v_ids)<>cardinality(p_sale_ids) or array_position(v_ids,null) is not null then raise exception 'Seleção inválida'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_key::text,0));
 select * into v_old from public.erp_sale_merges where request_key=p_request_key;
 if found then
 if v_old.actor_user_id<>auth.uid() or v_old.source_ids<>v_ids then raise exception 'Chave já utilizada'; end if;
 return v_old.sale_id;
 end if;
 perform 1 from public.erp_sales where id=any(v_ids) order by id for update;
 select count(*) into v_count from public.erp_sales where id=any(v_ids) and status='draft' and not is_test;
 if v_count<>cardinality(v_ids) then raise exception 'Somente pendências reais abertas podem ser mescladas'; end if;
 if (select count(distinct customer_id) from public.erp_sales where id=any(v_ids))<>1 then raise exception 'Mescle somente pedidos do mesmo cliente'; end if;
 if exists(select 1 from public.erp_sales where id=any(v_ids) and first_product_at is null) then raise exception 'Todas as pendências precisam ter produtos'; end if;
 if (select count(*) from public.erp_sale_items where sale_id=any(v_ids))>200 then raise exception 'O pedido mesclado excede 200 itens'; end if;
 select * into s from public.erp_sales where id=p_sale_ids[1];
 -- New target avoids overwriting either source through an already-open editor.
 v_id:=public.pamda_iniciar_venda(s.customer_id,s.branch_id,p_request_key);
 insert into public.erp_sale_items(sale_id,product_id,product_code_snapshot,product_sku_snapshot,description_snapshot,quantity,negotiated_unit_price,customization)
 select v_id,product_id,product_code_snapshot,product_sku_snapshot,description_snapshot,quantity,negotiated_unit_price,customization from public.erp_sale_items where sale_id=any(v_ids) order by created_at,id;
 update public.erp_sales set
 subtotal=(select sum(subtotal) from public.erp_sales where id=any(v_ids)),
 discount_amount=(select sum(discount_amount) from public.erp_sales where id=any(v_ids)),
 discount_reason='Descontos preservados dos pedidos mesclados',
 shipping_charged=(select sum(shipping_charged) from public.erp_sales where id=any(v_ids)),
 shipping_confirmed=false,
 shipping_actual_cost=(select case when bool_and(shipping_actual_cost is not null) then sum(shipping_actual_cost) end from public.erp_sales where id=any(v_ids)),
 payment_method_id=s.payment_method_id,payment_term_id=s.payment_term_id,
 notes=(select string_agg('Pedido '||order_number||' · '||coalesce(branch_snapshot->>'name','')||E'\n'||coalesce(notes,''),E'\n\n' order by created_at,id) from public.erp_sales where id=any(v_ids)),updated_at=now()
 where id=v_id;
 insert into public.erp_sale_events(sale_id,actor_user_id,event_type,details)
 select id,auth.uid(),'sale_merged',jsonb_build_object('target_sale_id',v_id) from public.erp_sales where id=any(v_ids);
 update public.erp_sales set status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),cancellation_reason='Mesclada no pedido '||(select order_number from public.erp_sales where id=v_id),updated_at=now() where id=any(v_ids);
 insert into public.erp_sale_merges(request_key,actor_user_id,sale_id,source_ids) values(p_request_key,auth.uid(),v_id,v_ids);
 insert into public.erp_sale_events(sale_id,actor_user_id,event_type,details) values(v_id,auth.uid(),'sale_merge_created',jsonb_build_object('source_sale_ids',v_ids));
 perform pamda_private.audit('sale.merged',v_id,jsonb_build_object('source_sale_ids',v_ids));
 return v_id;
end $$;
revoke all on function public.pamda_merge_pending_sales(uuid[],uuid) from public,anon;
grant execute on function public.pamda_merge_pending_sales(uuid[],uuid) to authenticated;
