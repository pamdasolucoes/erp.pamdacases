-- Executar dentro de BEGIN/ROLLBACK; nenhum pedido de validação permanece.
do $$
declare actor uuid; product uuid; customer uuid; branch uuid; sale uuid; k uuid:=gen_random_uuid();
begin
 select user_id into actor from public.erp_user_profiles where active and role='admin_gerencial' limit 1;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 select cb.customer_id,cb.id into customer,branch from public.customer_branches cb join public.customers c on c.id=cb.customer_id where cb.active and c.active limit 1;
 insert into public.products(code,sku,name,type,current_cost,sale_price,controls_inventory,current_inventory,stock_verified)
 values('QA-'||gen_random_uuid(),'QA-'||gen_random_uuid(),'Validação transacional','fisico',2,10,true,10,true) returning id into product;
 sale:=public.pamda_iniciar_venda(customer,branch,gen_random_uuid());
 insert into public.erp_sale_items(sale_id,product_id,product_code_snapshot,product_sku_snapshot,description_snapshot,quantity,negotiated_unit_price)
 values(sale,product,'QA','QA','Validação',2,10);
 update public.erp_sales set subtotal=20,shipping_confirmed=true,shipping_charged=0 where id=sale;
 perform public.pamda_finalize_sale(sale,'[{"method_code":"pix","amount":20,"status":"paid","channel":"erp"}]',k);
 perform public.pamda_finalize_sale(sale,'[{"method_code":"pix","amount":20,"status":"paid","channel":"erp"}]',k);
 if not exists(select 1 from public.erp_receivables where sale_id=sale and total=20 and paid=20) then raise exception 'Recebimento integral não registrado';end if;
 if (select count(*) from public.erp_real_payments where sale_id=sale)<>1 then raise exception 'Pagamento duplicado';end if;
 if not exists(select 1 from public.erp_real_payments where sale_id=sale and status='paid' and reference is null and paid_at is not null and actor_user_id=actor) then raise exception 'Recebimento sem referência não confirmado';end if;
 if (select current_inventory from public.products where id=product)<>8 then raise exception 'Estoque incorreto';end if;
 if not exists(select 1 from public.erp_production_jobs where sale_id=sale and status='queued') then raise exception 'Produção não liberada';end if;
end $$;
