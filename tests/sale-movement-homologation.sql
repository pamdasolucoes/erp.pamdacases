-- Run with migration inside BEGIN / ROLLBACK, never persist synthetic sales.
do $$
declare a uuid; operator_id uuid; c uuid; b uuid; pr uuid; s uuid; stamp timestamptz; nextstamp timestamptz; k uuid:=gen_random_uuid(); ck uuid:=gen_random_uuid(); plan jsonb; doc jsonb; result jsonb; denied boolean:=false;
begin
 select user_id into a from public.erp_user_profiles where active and role='admin_gerencial' limit 1;
 select user_id into operator_id from public.erp_user_profiles where active and role='venda_atendimento' limit 1;
 select id into c from public.customers where active limit 1;
 select id into b from public.customer_branches where customer_id=c and active limit 1;
 perform set_config('request.jwt.claim.sub',a::text,true);
 insert into public.products(code,sku,name,type,current_cost,sale_price,controls_inventory,current_inventory,stock_verified) values('QA-'||gen_random_uuid(),'QA-'||gen_random_uuid(),'QA rollback movement','fisico',5,25,true,10,true) returning id into pr;
 s:=public.pamda_iniciar_venda(c,b,gen_random_uuid());
 insert into public.erp_sale_items(sale_id,product_id,product_code_snapshot,product_sku_snapshot,description_snapshot,quantity,negotiated_unit_price) values(s,pr,'QA','QA','QA rollback',2,25);
 update public.erp_sales set subtotal=50,shipping_confirmed=true,shipping_charged=0 where id=s;
 perform public.pamda_finalize_sale(s,jsonb_build_array(jsonb_build_object('method_code','pix','amount',20,'status','paid','channel','erp'),jsonb_build_object('method_code','dinheiro','amount',30,'status','paid','channel','erp')),gen_random_uuid());
 select updated_at into stamp from public.erp_sales where id=s;
 select jsonb_agg(jsonb_build_object('id',id,'method_code','pix')) into plan from public.erp_real_payments where sale_id=s;
 perform set_config('request.jwt.claim.sub',operator_id::text,true);
 insert into public.erp_user_permission_overrides(user_id,permission_key,allowed,reason) values(operator_id,'sales.maintain',false,'QA rollback') on conflict(user_id,permission_key) do update set allowed=false;
 begin perform public.pamda_sale_movement_write(s,'payments',plan,'QA motivo',stamp,k);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Manutenção sem autorização'; end if;
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform public.pamda_sale_movement_write(s,'payments',plan,'Correção QA dinheiro para Pix',stamp,k);
 perform public.pamda_sale_movement_write(s,'payments',plan,'Correção QA dinheiro para Pix',stamp,k);
 if (select sum(amount) from public.erp_real_payments where sale_id=s and method_code='pix' and status='paid')<>50 then raise exception 'Pagamento divergente'; end if;
 if (select paid from public.erp_receivables where sale_id=s)<>50 then raise exception 'Recebimento alterado'; end if;
 doc:=public.pamda_real_sale_document(s);
 if jsonb_array_length(doc->'payments')<>2 or (select sum((x->>'amount')::numeric) from jsonb_array_elements(doc->'payments') x)<>50 then raise exception 'Recibo sem pagamentos atuais'; end if;
 if exists(select 1 from jsonb_array_elements(doc->'payments') x where x->>'method_code'<>'pix') then raise exception 'Recibo com forma antiga'; end if;
 if (public.pamda_sale_movement_read(s)->'items'->0) ? 'unit_cost_snapshot' then raise exception 'Custo exposto à consulta'; end if;
 select updated_at into nextstamp from public.erp_sales where id=s;
 begin
 perform public.pamda_sale_movement_write(s,'cancel','[]','Cancelamento QA',stamp,gen_random_uuid());
 raise exception 'Aceitou versão desatualizada' using errcode='XX001';
 exception when sqlstate 'P0001' then null;end;
 perform public.pamda_sale_movement_write(s,'cancel','[]','Cancelamento QA',nextstamp,ck);
 perform public.pamda_sale_movement_write(s,'cancel','[]','Cancelamento QA',nextstamp,ck);
 if (select current_inventory from public.products where id=pr)<>8 or (select count(*) from public.erp_stock_movements where sale_id=s)<>1 then raise exception 'Cancelamento devolveu estoque'; end if;
 if exists(select 1 from public.erp_receivables where sale_id=s and (total<>0 or paid<>0)) then raise exception 'Cobrança permaneceu ativa'; end if;
 if exists(select 1 from public.erp_real_payments where sale_id=s and status<>'void') then raise exception 'Pagamento não anulado'; end if;
 result:=public.pamda_operation_read('reports',null,null);
 if exists(select 1 from jsonb_array_elements(result->'rows') x where x->>'id'=s::text) then raise exception 'Cancelada entrou no relatório'; end if;
 if not exists(select 1 from jsonb_array_elements(public.pamda_customer_sale_history(c)) x where x->>'id'=s::text and x->>'status'='cancelled') then raise exception 'Histórico perdeu cancelada'; end if;
 if (select count(*) from public.erp_sale_events where sale_id=s and event_type in ('sale_payment_corrected','confirmed_sale_cancelled'))<>2 then raise exception 'Auditoria ausente ou duplicada'; end if;
 perform set_config('request.jwt.claim.sub','',true);denied:=false;
 begin perform public.pamda_sale_movement_read(s);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Consulta anônima'; end if;
end $$;
