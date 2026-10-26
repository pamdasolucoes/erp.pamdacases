-- Run with pending_closing.sql inside BEGIN / ROLLBACK.
do $$
declare a uuid; operator_id uuid; c uuid; b uuid; pr uuid; s1 uuid; s2 uuid; merged uuid; k uuid:=gen_random_uuid(); fk uuid:=gen_random_uuid(); denied boolean:=false;
begin
 select user_id into a from public.erp_user_profiles where active and role='admin_gerencial' limit 1;
 select user_id into operator_id from public.erp_user_profiles where active and upper(display_name)='PAMELA';
 if operator_id is null then raise exception 'Pâmela não encontrada'; end if;
 select id into c from public.customers where active limit 1;
 select id into b from public.customer_branches where active and customer_id=c limit 1;
 perform set_config('request.jwt.claim.sub',a::text,true);
 insert into public.products(code,sku,name,type,current_cost,sale_price,controls_inventory,current_inventory,stock_verified)
 values('QA-'||gen_random_uuid(),'QA-'||gen_random_uuid(),'QA rollback closing','fisico',5,25,true,0,false) returning id into pr;
 s1:=public.pamda_iniciar_venda(c,b,gen_random_uuid());s2:=public.pamda_iniciar_venda(c,b,gen_random_uuid());
 insert into public.erp_sale_items(sale_id,product_id,product_code_snapshot,product_sku_snapshot,description_snapshot,quantity,negotiated_unit_price,customization)
 select id,pr,'QA','QA','QA rollback',1,25,jsonb_build_object('art','preserved') from public.erp_sales where id in(s1,s2);
 update public.erp_sales set subtotal=25,shipping_confirmed=true,shipping_charged=0 where id in(s1,s2);
 perform set_config('request.jwt.claim.sub',operator_id::text,true);
 if not public.pamda_has_permission('sales.confirm') or public.pamda_has_permission('finance.manage') then raise exception 'Escopo de autorização inesperado'; end if;
 merged:=public.pamda_merge_pending_sales(array[s1,s2],k);
 if public.pamda_merge_pending_sales(array[s2,s1],k)<>merged then raise exception 'Mesclagem repetida'; end if;
 if (select count(*) from public.erp_sale_items where sale_id=merged and customization->>'art'='preserved')<>2 then raise exception 'Itens perdidos'; end if;
 if (select count(*) from public.erp_sales where id in(s1,s2) and status='cancelled')<>2 then raise exception 'Originais não preservados'; end if;
 if (select order_number from public.erp_sales where id=merged) is null then raise exception 'Pedido sem número'; end if;
 update public.erp_sales set shipping_confirmed=true where id=merged;
 perform public.pamda_finalize_sale(merged,jsonb_build_array(jsonb_build_object('method_code','pix','amount',50,'status','paid','channel','erp')),fk);
 perform public.pamda_finalize_sale(merged,jsonb_build_array(jsonb_build_object('method_code','pix','amount',50,'status','paid','channel','erp')),fk);
 if (select current_inventory from public.products where id=pr)<>-2 then raise exception 'Falta de estoque incorreta ou duplicada'; end if;
 if not exists(select 1 from public.erp_receivables where sale_id=merged and paid=50 and total=50) then raise exception 'Recebimento incorreto'; end if;
 if not exists(select 1 from public.erp_stock_movements where sale_id=merged and balance_after=-2 and quantity=-2) then raise exception 'Movimento ausente'; end if;
 if (select count(*) from public.erp_production_jobs where sale_id=merged)<>1 then raise exception 'Produção duplicada'; end if;
 perform set_config('request.jwt.claim.sub','',true);
 begin perform public.pamda_merge_pending_sales(array[s1,s2],gen_random_uuid()); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Anônimo conseguiu mesclar'; end if;
end $$;
