-- Executar dentro de BEGIN/ROLLBACK. Nenhum cadastro ou movimento permanece.
do $$
declare actor uuid; product uuid; customer uuid; branch uuid; sale uuid; sale2 uuid; kit uuid; other_user uuid:=gen_random_uuid(); k uuid; result jsonb; module text;
before_balance numeric; after_balance numeric; payment_key uuid:=gen_random_uuid();
begin
 select user_id into actor from public.erp_user_profiles where active and role='admin_gerencial' limit 1;
 if actor is null then raise exception 'Administrador ativo necessário'; end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 select id into customer from public.customers where active limit 1;
 select id into branch from public.customer_branches where customer_id=customer and active limit 1;
 insert into public.products(code,sku,name,type,current_cost,sale_price,controls_inventory,current_inventory,stock_verified)
 values('QA-'||gen_random_uuid(),'QA-'||gen_random_uuid(),'Validação transacional','fisico',2,10,true,10,true) returning id into product;
 k:=gen_random_uuid();
 perform public.pamda_stock_write(jsonb_build_object('kind','adjustment','reason','Conferência transacional','items',jsonb_build_array(jsonb_build_object('product_id',product,'counted',10))),k);
 perform public.pamda_stock_write(jsonb_build_object('kind','entry','date',current_date,'reason','Entrada transacional','items',jsonb_build_array(jsonb_build_object('product_id',product,'quantity',5,'unit_cost',4))),gen_random_uuid());
 select current_inventory into before_balance from public.products where id=product;
 if before_balance<>15 then raise exception 'Entrada não atualizou saldo'; end if;
 sale:=public.pamda_iniciar_venda(customer,branch,gen_random_uuid());
 insert into public.erp_sale_items(sale_id,product_id,product_code_snapshot,product_sku_snapshot,description_snapshot,quantity,negotiated_unit_price)
 values(sale,product,'QA','QA','Validação',2,10);
 update public.erp_sales set subtotal=20,shipping_confirmed=true,shipping_charged=0 where id=sale;
 k:=gen_random_uuid();
 perform public.pamda_finalize_sale(sale,jsonb_build_array(jsonb_build_object('method_code','pix','amount',20,'status','pending','channel','erp')),k);
 perform public.pamda_finalize_sale(sale,jsonb_build_array(jsonb_build_object('method_code','pix','amount',20,'status','pending','channel','erp')),k);
 select current_inventory into after_balance from public.products where id=product;
 if after_balance<>13 then raise exception 'Baixa duplicada ou incorreta'; end if;
 if not exists(select 1 from public.erp_receivables where sale_id=sale and total=20 and paid=0) then raise exception 'Contas a receber incorreto'; end if;
 perform public.pamda_operation_write('payment',jsonb_build_object('sale_id',sale,'amount',7,'method_code','pix','reference','Validação parcial'),payment_key);
 perform public.pamda_operation_write('payment',jsonb_build_object('sale_id',sale,'amount',7,'method_code','pix','reference','Validação parcial'),payment_key);
 if not exists(select 1 from public.erp_receivables where sale_id=sale and paid=7) then raise exception 'Recebimento duplicado'; end if;
 if (select sum(amount) from public.erp_real_payments where sale_id=sale and status='paid')<>7 then raise exception 'Pagamentos divergentes'; end if;
 begin
 perform public.pamda_operation_write('payment',jsonb_build_object('sale_id',sale,'amount',14,'method_code','pix','reference','Valor acima do saldo'),gen_random_uuid());
 raise exception 'Aceitou pagamento acima do saldo' using errcode='XX001';
 exception when sqlstate 'P0001' then null; end;
 perform public.pamda_operation_write('production',jsonb_build_object('sale_id',sale,'status','in_progress'),gen_random_uuid());
 perform public.pamda_operation_write('production',jsonb_build_object('sale_id',sale,'status','ready'),gen_random_uuid());
 perform public.pamda_operation_write('delivery',jsonb_build_object('sale_id',sale,'status','delivered','carrier','Validação','actual_cost',3),gen_random_uuid());
 perform public.pamda_operation_write('expense',jsonb_build_object('description','Validação transacional','category','Validação','amount',1,'date',current_date,'paid',false),gen_random_uuid());
 perform public.pamda_operation_write('closing',jsonb_build_object('customer_id',customer,'start',current_date,'end',current_date),gen_random_uuid());
 perform public.pamda_real_sale_document(sale);
 foreach module in array array['stock','purchases','expenses','receivables','closings','production','deliveries','reports','profitability','audit','settings'] loop
 result:=public.pamda_operation_read(module,null,null);
 if result is null then raise exception 'Módulo sem resposta: %',module; end if;
 end loop;
 perform public.pamda_users_read(); perform public.pamda_resumo_erp();
 -- Kits consomem os componentes e congelam o custo no momento da venda.
 insert into public.products(code,sku,name,type,current_cost,sale_price,controls_inventory,current_inventory,stock_verified)
 values('QA-'||gen_random_uuid(),'QA-'||gen_random_uuid(),'Kit transacional','kit',0,30,false,0,false) returning id into kit;
 insert into public.kit_components(kit_product_id,component_product_id,quantity,sort_order) values(kit,product,3,1);
 sale2:=public.pamda_iniciar_venda(customer,branch,gen_random_uuid());
 insert into public.erp_sale_items(sale_id,product_id,product_code_snapshot,product_sku_snapshot,description_snapshot,quantity,negotiated_unit_price)
 values(sale2,kit,'QA-KIT','QA-KIT','Validação do kit',1,30);
 update public.erp_sales set subtotal=30,shipping_charged=0,shipping_confirmed=true where id=sale2;
 perform public.pamda_finalize_sale(sale2,jsonb_build_array(jsonb_build_object('method_code','pix','amount',30,'status','pending','channel','erp')),gen_random_uuid());
 if (select current_inventory from public.products where id=product)<>10 then raise exception 'Kit não consumiu componentes'; end if;
 if not exists(select 1 from public.erp_sale_items where sale_id=sale2 and unit_cost_snapshot=(select 3*current_cost from public.products where id=product) and cost_verified) then raise exception 'Custo médio do kit divergente'; end if;
 -- Saldo insuficiente reverte também as parcelas já preparadas.
 sale2:=public.pamda_iniciar_venda(customer,branch,gen_random_uuid());
 insert into public.erp_sale_items(sale_id,product_id,product_code_snapshot,product_sku_snapshot,description_snapshot,quantity,negotiated_unit_price)
 values(sale2,product,'QA','QA','Validação de saldo',100,1);
 update public.erp_sales set subtotal=100,shipping_charged=0,shipping_confirmed=true where id=sale2;
 begin
 perform public.pamda_finalize_sale(sale2,jsonb_build_array(jsonb_build_object('method_code','pix','amount',100,'status','pending','channel','erp')),gen_random_uuid());
 raise exception 'Aceitou estoque insuficiente' using errcode='XX001'; exception when sqlstate 'P0001' then null;end;
 if exists(select 1 from public.erp_real_payments where sale_id=sale2) then raise exception 'Falha não reverteu pagamentos'; end if;
 -- Perfis e permissões são controlados no banco, sem confiar em metadata.
 insert into auth.users(id) values(other_user);
 insert into public.erp_user_profiles(user_id,username,display_name,role,active) values(other_user,'qa-'||other_user,'Validação','producao',true);
 perform public.pamda_user_save(jsonb_build_object('user_id',other_user,'display_name','Validação','role','producao','active',true,'permissions',jsonb_build_object('stock.read',true)));
 perform set_config('request.jwt.claim.sub',other_user::text,true);
 if not public.pamda_has_permission('stock.read') then raise exception 'Permissão configurada não aplicada'; end if;
 begin perform public.pamda_operation_read('receivables');raise exception 'Produção acessou financeiro' using errcode='XX001';exception when insufficient_privilege then null;end;
 begin perform public.pamda_users_read();raise exception 'Produção acessou usuários' using errcode='XX001';exception when insufficient_privilege then null;end;
 if has_function_privilege('anon','public.pamda_stock_write(jsonb,uuid)','execute') then raise exception 'Anônimo pode executar ajuste'; end if;
 if has_table_privilege('authenticated','public.erp_receivables','update') then raise exception 'Escrita direta no financeiro liberada'; end if;
 perform set_config('request.jwt.claim.sub','',true);
 perform set_config('request.jwt.claims','{}',true);
 begin perform public.pamda_operation_read('receivables');raise exception 'Anônimo leu financeiro' using errcode='XX001'; exception when insufficient_privilege then null;end;
 begin perform public.pamda_stock_write('{}',gen_random_uuid());raise exception 'Anônimo alterou estoque' using errcode='XX001'; exception when insufficient_privilege then null;end;
end $$;
