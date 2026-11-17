-- Every fixture and operation is rolled back inside this subtransaction.
do $qa$
declare a uuid;c uuid;b uuid;b2 uuid;pr uuid;s uuid;ids uuid[]:='{}';target uuid;n int;args jsonb;
 notes text;originals jsonb;item_ids uuid[];result jsonb;rejected boolean;branch_label text:='QA-BRANCH-'||gen_random_uuid();
begin
 begin
 select user_id into a from public.erp_user_profiles where active and role='admin_gerencial' limit 1;
 select cb.customer_id,cb.id into c,b from public.customer_branches cb join public.customers cu on cu.id=cb.customer_id where cb.active and cu.active limit 1;
 if a is null or c is null then raise exception 'QA requires an active administrator and customer';end if;
 perform set_config('request.jwt.claim.sub',a::text,true);
 insert into public.customer_branches(customer_id,name,active) values(c,branch_label,true) returning id into b2;
 insert into public.products(code,sku,name,type,current_cost,sale_price,controls_inventory,current_inventory,stock_verified)
 values('QA-ADJUST-'||gen_random_uuid(),'QA-ADJUST-'||gen_random_uuid(),'QA adjustment rolled back','fisico',5,25,false,0,true) returning id into pr;
 for n in 1..2 loop
  s:=public.pamda_iniciar_venda(c,case when n=1 then b else b2 end,gen_random_uuid());ids:=array_append(ids,s);
  insert into public.erp_sale_items(sale_id,product_id,product_code_snapshot,product_sku_snapshot,description_snapshot,quantity,negotiated_unit_price,customization)
   values(s,pr,'QA','QA','QA adjustment rolled back',1,25,'{}');
  update public.erp_sales set subtotal=25,discount_amount=n,discount_reason='Original',notes='Observação original '||n,
   shipping_confirmed=true,shipping_charged=5,shipping_actual_cost=0 where id=s;
 end loop;
 target:=public.pamda_merge_pending_sales(ids,gen_random_uuid());
 select s.notes into notes from public.erp_sales s where id=target;
 if notes like '%'||branch_label||'%' then raise exception 'QA branch leaked into observations';end if;
 for s in select unnest(ids) loop
  if position('Pedido '||(select order_number from public.erp_sales where id=s) in notes)=0 then raise exception 'QA missing source number';end if;
 end loop;
 if position('Observação original 1' in notes)=0 or position('Observação original 2' in notes)=0 then raise exception 'QA source notes lost';end if;
 select jsonb_agg(to_jsonb(v) order by v.id) into originals from public.erp_sales v where id=any(ids);
 select array_agg(id order by id),jsonb_agg(jsonb_build_object('product_id',product_id,'quantity',quantity,'unit_price',negotiated_unit_price,'customization',coalesce(customization,'{}')))
 into item_ids,args from public.erp_sale_items where sale_id=target;

 perform public.pamda_salvar_rascunho_venda(c,b,args,0,1,'Redução de desconto',notes,target,null,null);
 if (select sum(total) from pamda_private.reporting_sales where id=any(ids)) is distinct from 49 then raise exception 'QA reduction allocation failed';end if;
 perform public.pamda_salvar_rascunho_venda(c,b,args,12.34,3.21,'Ajuste aprovado',notes,target,null,null);
 if not exists(select 1 from public.erp_sales where id=target and total=59.13 and shipping_charged=12.34 and discount_amount=3.21 and shipping_confirmed) then raise exception 'QA adjustments not saved';end if;
 if (select sum(total) from pamda_private.reporting_sales where id=any(ids)) is distinct from 59.13
 or (select sum(shipping_charged) from pamda_private.reporting_sales where id=any(ids)) is distinct from 12.34
 or (select sum(discount_amount) from pamda_private.reporting_sales where id=any(ids)) is distinct from 3.21 then raise exception 'QA cent allocation failed';end if;
 if originals is distinct from (select jsonb_agg(to_jsonb(v) order by v.id) from public.erp_sales v where id=any(ids)) then raise exception 'QA originals changed';end if;
 if item_ids is distinct from (select array_agg(id order by id) from public.erp_sale_items where sale_id=target)
 or exists(select 1 from public.erp_sale_items where sale_id=target and source_sale_item_id is null) then raise exception 'QA item links changed';end if;

 if current_setting('qa.permission_fixture',true)='enabled' then
  perform set_config('qa.denied_permission','sales.shipping.override',true);
  rejected:=false;begin perform public.pamda_salvar_rascunho_venda(c,b,args,1,3.21,'Ajuste aprovado',notes,target,null,null);exception when insufficient_privilege then rejected:=true;end;
  if not rejected then raise exception 'QA freight permission bypass';end if;
  -- Unchanged inherited freight remains saveable without granting freight editing.
  perform public.pamda_salvar_rascunho_venda(c,b,args,12.34,3.21,'Ajuste aprovado',notes,target,null,null);
  perform set_config('qa.denied_permission','sales.discount',true);
  rejected:=false;begin perform public.pamda_salvar_rascunho_venda(c,b,args,12.34,0,'Ajuste aprovado',notes,target,null,null);exception when insufficient_privilege then rejected:=true;end;
  if not rejected then raise exception 'QA discount permission bypass';end if;
  perform set_config('qa.denied_permission','',true);
 end if;

 perform public.pamda_salvar_rascunho_venda(c,b,args,0,50,'Desconto integral',notes,target,null,null);
 if exists(select 1 from pamda_private.reporting_sales where id=any(ids) and (total<0 or discount_amount>subtotal))
 or (select sum(total) from pamda_private.reporting_sales where id=any(ids)) is distinct from 0 then raise exception 'QA full discount allocation failed';end if;
 perform public.pamda_salvar_rascunho_venda(c,b,args,12.34,3.21,'Ajuste aprovado',notes,target,null,null);

 rejected:=false;begin perform public.pamda_salvar_rascunho_venda(c,b2,args,12.34,3.21,'Ajuste aprovado',notes,target,null,null);exception when raise_exception then rejected:=true;end;
 if not rejected then raise exception 'QA branch editable';end if;
 rejected:=false;begin perform public.pamda_salvar_rascunho_venda(c,b,jsonb_set(args,'{0,quantity}','2'),12.34,3.21,'Ajuste aprovado',notes,target,null,null);exception when raise_exception then rejected:=true;end;
 if not rejected then raise exception 'QA source item editable';end if;
 rejected:=false;begin perform public.pamda_salvar_rascunho_venda(c,b,args,12.34,50.01,'Ajuste aprovado',notes,target,null,null);exception when raise_exception then rejected:=true;end;
 if not rejected then raise exception 'QA excessive discount';end if;
 rejected:=false;begin perform public.pamda_salvar_rascunho_venda(c,b,args,-1,3.21,'Ajuste aprovado',notes,target,null,null);exception when raise_exception then rejected:=true;end;
 if not rejected then raise exception 'QA negative freight';end if;
 rejected:=false;begin perform public.pamda_salvar_rascunho_venda(c,b,args,12.34,3.21,'',notes,target,null,null);exception when raise_exception then rejected:=true;end;
 if not rejected then raise exception 'QA missing discount reason';end if;

 perform public.pamda_finalize_sale(target,jsonb_build_array(jsonb_build_object('method_code',(select code from public.erp_payment_methods where active and code<>'credito_cliente' limit 1),'amount',59.13,'status','paid','channel','erp')),gen_random_uuid());
 result:=public.pamda_operation_read('reports',null,null);
 if exists(select 1 from jsonb_array_elements(result->'rows')j where (j->>'id')::uuid=target)
 or (select sum((j->>'total')::numeric) from jsonb_array_elements(result->'rows')j where (j->>'id')::uuid=any(ids)) is distinct from 59.13 then raise exception 'QA report duplicated or lost adjustments';end if;
 result:=public.pamda_sale_movement_read(target);
 if jsonb_array_length(result->'merge'->'sources')<>2 then raise exception 'QA original links lost after closing';end if;
 result:=public.pamda_sale_movement_read(ids[2]);
 if (result->'sale'->>'branch_id')::uuid is distinct from b2 or result->'sale'->'branch_snapshot'->>'name' is distinct from branch_label then raise exception 'QA original branch inaccessible';end if;
 rejected:=false;begin perform public.pamda_salvar_rascunho_venda(c,b,args,1,0,'',notes,target,null,null);exception when insufficient_privilege then rejected:=true;end;
 if not rejected then raise exception 'QA confirmed closing editable';end if;
 raise exception using errcode='ZX001',message='merge adjustment QA passed; rolling fixtures back';
 exception when sqlstate 'ZX001' then null;
 end;
end $qa$;
