-- Entire verification is rolled back. No customer sale is changed.
begin;
do $qa$
declare actor uuid; customer uuid; branch uuid; physical uuid; service uuid; sale uuid; stamp timestamptz; correction uuid:=gen_random_uuid(); payment uuid; document jsonb;
begin
 select user_id into actor from public.erp_user_profiles where active and role='admin_gerencial' limit 1;
 select id into customer from public.customers where active limit 1;
 select id into branch from public.customer_branches where customer_id=customer and active limit 1;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 insert into public.products(code,sku,name,type,current_cost,sale_price,controls_inventory,current_inventory,stock_verified) values('QA-'||gen_random_uuid(),'QA-'||gen_random_uuid(),'QA rollback capa','fisico',5,25,true,10,true) returning id into physical;
 insert into public.products(code,sku,name,type,current_cost,sale_price,controls_inventory,current_inventory,stock_verified) values('QA-'||gen_random_uuid(),'QA-'||gen_random_uuid(),'QA rollback impressão','servico',2,20,false,0,true) returning id into service;
 sale:=public.pamda_iniciar_venda(customer,branch,gen_random_uuid());
 insert into public.erp_sale_items(sale_id,product_id,product_code_snapshot,product_sku_snapshot,description_snapshot,quantity,negotiated_unit_price) values(sale,physical,'QA','QA-SKU','QA rollback capa',1,25);
 update public.erp_sales set subtotal=25,shipping_charged=0,shipping_confirmed=true where id=sale;
 perform public.pamda_finalize_sale(sale,'[{"method_code":"pix","amount":25,"status":"paid","channel":"erp"}]',gen_random_uuid());
 select updated_at into stamp from public.erp_sales where id=sale;
 select id into payment from public.erp_real_payments where sale_id=sale;
 document:=jsonb_build_object('items',jsonb_build_array(jsonb_build_object('product_id',service,'quantity',1,'unit_price',20,'customization','{}'::jsonb)),
  'freight',0,'discount',0,'discount_reason','','notes','QA impressão com capa cedida','due_date','2026-11-25',
  'payments',jsonb_build_array(jsonb_build_object('id',payment,'method_code','pix','amount',20,'status','paid','scheduled_for',null,'reference','')));
 perform public.pamda_sale_movement_edit(sale,document,'QA troca de capa por impressão',stamp,correction);
 perform public.pamda_sale_movement_edit(sale,document,'QA troca de capa por impressão',stamp,correction);
 if not exists(select 1 from public.erp_sales where id=sale and status='confirmed' and total=20 and confirmed_at is not null) then raise exception 'Venda não corrigida';end if;
 if not exists(select 1 from public.products where id=physical and current_inventory=10) then raise exception 'Estoque não reconciliado';end if;
 if not exists(select 1 from public.erp_receivables where sale_id=sale and total=20 and paid=20) then raise exception 'Financeiro não corrigido';end if;
 if not exists(select 1 from pamda_private.reporting_sales where id=sale and total=20) then raise exception 'Relatório não corrigido';end if;
 if not exists(select 1 from pamda_private.reporting_sale_items where sale_id=sale and unit_cost_snapshot=2) then raise exception 'Lucratividade não corrigida';end if;
 if public.pamda_real_sale_document(sale)->>'receipt_number' is null then raise exception 'Recibo indisponível';end if;
 if not (public.pamda_sale_movement_read(sale)->>'can_edit_sale')::boolean then raise exception 'Edição indisponível';end if;
 if exists(select 1 from public.erp_production_tasks where sale_id=sale and product_id=physical and stage<>'cancelled') or not exists(select 1 from public.erp_production_tasks where sale_id=sale and product_id=service and stage<>'cancelled') then raise exception 'Produção divergente';end if;
 select updated_at into stamp from public.erp_sales where id=sale;
 perform public.pamda_sale_movement_write(sale,'cancel','[]','QA cancelamento de venda corrigida',stamp,gen_random_uuid());
 if exists(select 1 from pamda_private.reporting_sales where id=sale and status='confirmed') then raise exception 'Cancelada no relatório';end if;
 if not exists(select 1 from public.erp_receivables where sale_id=sale and total=0 and paid=0) then raise exception 'Cancelamento não removeu cobrança';end if;
end $qa$;
rollback;
