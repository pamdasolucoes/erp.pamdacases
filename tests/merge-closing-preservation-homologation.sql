-- Executed in a subtransaction: every fixture, counter, payment and stock write is rolled back.
do $qa$
declare a uuid; c uuid; b uuid; c2 uuid; b2 uuid; pr uuid; ids uuid[]:='{}'; s uuid; other uuid; target uuid; target3 uuid; k uuid:=gen_random_uuid(); n int; result jsonb; args jsonb; before_items uuid[]; rejected boolean;
begin
 begin
 select user_id into a from public.erp_user_profiles where active and role='admin_gerencial' limit 1;
 if a is null then raise exception 'QA requires an active administrator'; end if;
 select cb.customer_id,cb.id into c,b from public.customer_branches cb join public.customers cu on cu.id=cb.customer_id where cb.active and cu.active limit 1;
 select cb.customer_id,cb.id into c2,b2 from public.customer_branches cb join public.customers cu on cu.id=cb.customer_id where cb.active and cu.active and cb.customer_id<>c limit 1;
 perform set_config('request.jwt.claim.sub',a::text,true);
 insert into public.products(code,sku,name,type,current_cost,sale_price,controls_inventory,current_inventory,stock_verified)
 values('QA-MERGE-'||gen_random_uuid(),'QA-MERGE-'||gen_random_uuid(),'QA merge rolled back','fisico',5,25,false,0,true) returning id into pr;
 for n in 1..6 loop
  s:=public.pamda_iniciar_venda(c,b,gen_random_uuid());ids:=array_append(ids,s);
  insert into public.erp_sale_items(sale_id,product_id,product_code_snapshot,product_sku_snapshot,description_snapshot,quantity,negotiated_unit_price,customization)
   values(s,pr,'QA','QA','QA merge rolled back',1,25,'{}');
  update public.erp_sales set subtotal=25,shipping_confirmed=true,shipping_charged=case when n in(3,6) then 0 else 5 end,shipping_actual_cost=0,created_at=now()-interval '1 hour' where id=s;
 end loop;
 other:=public.pamda_iniciar_venda(c2,b2,gen_random_uuid());
 insert into public.erp_sale_items(sale_id,product_id,product_code_snapshot,product_sku_snapshot,description_snapshot,quantity,negotiated_unit_price) values(other,pr,'QA','QA','QA merge rolled back',1,25);
 update public.erp_sales set subtotal=25,shipping_confirmed=true,shipping_charged=5 where id=other;
 rejected:=false;
 begin perform public.pamda_merge_pending_sales(array[ids[1],other],gen_random_uuid());exception when raise_exception then if sqlerrm like '%mesmo cliente%' then rejected:=true;else raise;end if;end;
 if not rejected then raise exception 'QA mixed customers accepted';end if;
 target:=public.pamda_merge_pending_sales(array[ids[1],ids[2]],k);
 if public.pamda_merge_pending_sales(array[ids[2],ids[1]],k)<>target then raise exception 'QA duplicated merge';end if;
 if not exists(select 1 from public.erp_sales where id=target and shipping_charged=10 and shipping_confirmed and total=60) then raise exception 'QA freight 5+5 failed';end if;
 select array_agg(id order by id) into before_items from public.erp_sale_items where sale_id=target;
 select jsonb_agg(jsonb_build_object('product_id',product_id,'quantity',quantity,'unit_price',negotiated_unit_price,'customization',coalesce(customization,'{}'))) into args from public.erp_sale_items where sale_id=target;
 perform public.pamda_salvar_rascunho_venda(c,b,args,10,0,'Descontos preservados dos pedidos mesclados',(select notes from public.erp_sales where id=target),target,null,null);
 if before_items<>(select array_agg(id order by id) from public.erp_sale_items where sale_id=target) or exists(select 1 from public.erp_sale_items where sale_id=target and source_sale_item_id is null) then raise exception 'QA original item links lost when saving';end if;
 rejected:=false;
 begin perform public.pamda_salvar_rascunho_venda(c,b,args,0,0,'Descontos preservados dos pedidos mesclados',(select notes from public.erp_sales where id=target),target,null,null);exception when raise_exception then rejected:=true;end;
 if not rejected then raise exception 'QA closing freight editable';end if;
 rejected:=false;
 begin perform public.pamda_merge_pending_sales(array[target,ids[3]],gen_random_uuid());exception when raise_exception then rejected:=true;end;
 if not rejected then raise exception 'QA nested closing accepted';end if;
 target3:=public.pamda_merge_pending_sales(array[ids[4],ids[5],ids[6]],gen_random_uuid());
 if not exists(select 1 from public.erp_sales where id=target3 and shipping_charged=10 and shipping_confirmed and total=85) then raise exception 'QA freight 5+5+0 failed';end if;
 result:=public.pamda_customer_sale_history(c);
 if exists(select 1 from jsonb_array_elements(result) j where (j->>'id')::uuid in(target,target3)) then raise exception 'QA aggregate in customer sales';end if;
 if (select count(*) from jsonb_array_elements(result)j where (j->>'id')::uuid=any(ids[1:2]) and j->'merge'->>'role'='source')<>2 then raise exception 'QA originals inaccessible';end if;
 result:=public.pamda_sale_movement_read(target);
 if jsonb_array_length(result->'merge'->'sources')<>2 then raise exception 'QA missing source links';end if;
 perform public.pamda_finalize_sale(target,jsonb_build_array(jsonb_build_object('method_code',(select code from public.erp_payment_methods where active and code<>'credito_cliente' limit 1),'amount',60,'status','paid','channel','erp')),gen_random_uuid());
 result:=public.pamda_operation_read('reports',null,null);
 if exists(select 1 from jsonb_array_elements(result->'rows')j where (j->>'id')::uuid=target) then raise exception 'QA closing double counted';end if;
 if (select count(*) from jsonb_array_elements(result->'rows')j where (j->>'id')::uuid=any(ids[1:2]))<>2 then raise exception 'QA originals missing from reports';end if;
 if (select sum((j->>'total')::numeric) from jsonb_array_elements(result->'rows')j where (j->>'id')::uuid=any(ids[1:2])) is distinct from 60 then raise exception 'QA incorrect revenue';end if;
 update public.erp_sales set shipping_actual_cost=8 where id=target;
 result:=public.pamda_operation_read('profitability',null,null);
 if (select sum((j->>'product_cost')::numeric) from jsonb_array_elements(result->'rows')j where (j->>'id')::uuid=any(ids[1:2])) is distinct from 10 then raise exception 'QA cost allocation incorrect';end if;
 if (select sum((j->>'delivery_cost')::numeric) from jsonb_array_elements(result->'rows')j where (j->>'id')::uuid=any(ids[1:2])) is distinct from 8 then raise exception 'QA delivery cost duplicated or lost';end if;
 update public.erp_sales set status='cancelled',cancelled_at=now(),cancelled_by=a,cancellation_reason='QA cancel' where id=target;
 result:=public.pamda_operation_read('reports',null,null);
 if exists(select 1 from jsonb_array_elements(result->'rows')j where (j->>'id')::uuid=any(ids[1:2])) then raise exception 'QA cancelled closing still counted';end if;
 if (select count(*) from public.erp_receivables where sale_id=any(array_append(ids,target)))<>1 then raise exception 'QA duplicate receivables';end if;
 perform set_config('request.jwt.claim.sub','',true);rejected:=false;
 begin perform public.pamda_merge_pending_sales(array[ids[3],other],gen_random_uuid());exception when insufficient_privilege then rejected:=true;end;
 if not rejected then raise exception 'QA anonymous merge allowed';end if;
 raise exception using errcode='ZX001',message='merge QA passed; rolling fixtures back';
 exception when sqlstate 'ZX001' then null;
 end;
end $qa$;
