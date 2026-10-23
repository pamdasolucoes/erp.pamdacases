-- Executar dentro de BEGIN/ROLLBACK. Validação descartável, sem pedidos de teste persistidos.
do $$
declare actor uuid; c uuid; b uuid; base uuid; print uuid; kit uuid; sale uuid; report jsonb;
begin
 select user_id into actor from public.erp_user_profiles where active and role='admin_gerencial' limit 1;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 select cb.customer_id,cb.id into c,b from public.customer_branches cb join public.customers cu on cu.id=cb.customer_id where cb.active and cu.active limit 1;
 if exists(select 1 from public.products where name like 'Capa TPU transparente - %' and current_cost is distinct from 2.75) then raise exception 'Custo TPU incorreto';end if;
 if exists(select 1 from public.products where name like 'Capa personalizada TPU transparente - %' and (current_cost is distinct from 4 or managerial_cost is distinct from 5)) then raise exception 'Custo do kit TPU incorreto';end if;
 insert into public.products(code,sku,name,type,current_cost,sale_price,controls_inventory,current_inventory,stock_verified) values('QA-'||gen_random_uuid(),'QA-'||gen_random_uuid(),'Base transacional','fisico',2.75,10,true,10,true) returning id into base;
 insert into public.products(code,sku,name,type,current_cost,sale_price,controls_inventory) values('QA-'||gen_random_uuid(),'QA-'||gen_random_uuid(),'Impressão transacional','servico',1.25,10,false) returning id into print;
 insert into public.products(code,sku,name,type,current_cost,managerial_cost,sale_price,controls_inventory) values('QA-'||gen_random_uuid(),'QA-'||gen_random_uuid(),'Kit transacional','kit',4,5,25,false) returning id into kit;
 insert into public.kit_components(kit_product_id,component_product_id,quantity,sort_order) values(kit,base,1,0),(kit,print,1,1);
 sale:=public.pamda_iniciar_venda(c,b,gen_random_uuid());
 insert into public.erp_sale_items(sale_id,product_id,product_code_snapshot,product_sku_snapshot,description_snapshot,quantity,negotiated_unit_price) values(sale,kit,'QA','QA','Kit transacional',1,25);
 update public.erp_sales set subtotal=25,shipping_charged=10,shipping_confirmed=true where id=sale;
 perform public.pamda_finalize_sale(sale,'[{"method_code":"pix","amount":35,"status":"paid","channel":"erp"}]',gen_random_uuid());
 if not exists(select 1 from public.erp_sale_items where sale_id=sale and direct_unit_cost_snapshot=4 and unit_cost_snapshot=5 and cost_verified) then raise exception 'Finalização não usou custo gerencial';end if;
 if (select current_inventory from public.products where id=base)<>9 then raise exception 'Consumo do componente divergente';end if;
 update public.products set managerial_cost=99 where id=kit;
 if (select unit_cost_snapshot from public.erp_sale_items where sale_id=sale)<>5 then raise exception 'Alteração de catálogo reescreveu histórico';end if;
 report:=public.pamda_operation_read('profitability');
 if not exists(select 1 from jsonb_array_elements(report->'rows') r where r->>'id'=sale::text and (r->>'product_cost')::numeric=5 and (r->>'subtotal')::numeric=25 and (r->>'shipping_charged')::numeric=10) then raise exception 'Relatório não contém os custos corretos';end if;
 perform set_config('request.jwt.claim.sub','',true);
 begin perform public.pamda_operation_read('profitability');raise exception 'Anônimo acessou custos' using errcode='XX001';exception when insufficient_privilege then null;end;
end $$;
