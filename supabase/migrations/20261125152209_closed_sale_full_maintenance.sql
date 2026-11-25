update public.erp_permission_catalog set description='Manutenção de movimento: editar produtos, valores e pagamentos ou cancelar venda fechada' where key='sales.maintain';

create function public.pamda_sale_movement_edit(p_sale_id uuid,p_document jsonb,p_reason text,p_expected_updated_at timestamptz,p_request_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
<<maintenance>>
declare s public.erp_sales%rowtype; old_item public.erp_sale_items%rowtype; prod public.products%rowtype; pay public.erp_real_payments%rowtype;
 req pamda_private.sale_maintenance_requests%rowtype; payload jsonb; x jsonb; items jsonb:='[]'; before_items jsonb; before_payments jsonb;
 qty numeric; price numeric; direct_cost numeric; cost numeric; freight numeric; discount numeric; subtotal numeric:=0; amount numeric; paid numeric:=0; payment_total numeric:=0;
 item_id uuid; payment_id uuid; kept uuid[]:='{}'; kept_payments uuid[]:='{}'; custom jsonb; stock_changed boolean:=false; old_shape jsonb; new_shape jsonb; movement record;
begin
 perform pamda_private.require_permission('sales.maintain');
 if p_request_key is null or jsonb_typeof(p_document) is distinct from 'object' or length(btrim(coalesce(p_reason,''))) not between 3 and 2000 then raise exception 'Informe o documento e o motivo da manutenção (3 a 2000 caracteres)';end if;
 payload:=jsonb_build_object('action','edit','document',p_document,'reason',btrim(p_reason),'expected',p_expected_updated_at);
 perform pg_advisory_xact_lock(hashtextextended(p_request_key::text,0));
 select * into req from pamda_private.sale_maintenance_requests where request_key=p_request_key;
 if found then if req.actor<>auth.uid() or req.sale_id<>p_sale_id or req.payload<>payload then raise exception 'Chave já utilizada';end if;return req.sale_id;end if;
 select * into s from public.erp_sales where id=p_sale_id for update;
 if not found or s.status<>'confirmed' or s.is_test then raise exception 'Somente vendas reais fechadas podem ser editadas';end if;
 if s.updated_at is distinct from p_expected_updated_at then raise exception 'Venda alterada por outro operador. Feche e abra a consulta novamente';end if;
 if exists(select 1 from public.erp_sale_merges where preserve_originals and (sale_id=s.id or s.id=any(source_ids))) then raise exception 'O agrupamento preserva os pedidos originais. Use a manutenção de pagamentos do fechamento';end if;
 if jsonb_typeof(p_document->'items') is distinct from 'array' or jsonb_array_length(p_document->'items') not between 1 and 200 then raise exception 'Inclua de 1 a 200 itens';end if;
 if jsonb_typeof(p_document->'payments') is distinct from 'array' or jsonb_array_length(p_document->'payments')>20 then raise exception 'Pagamentos inválidos';end if;
 freight:=(p_document->>'freight')::numeric;discount:=(p_document->>'discount')::numeric;
 if freight is null or discount is null or freight<0 or discount<0 or freight>1000000 or discount>1000000 or freight<>round(freight,2) or discount<>round(discount,2) or freight='NaN'::numeric or discount='NaN'::numeric then raise exception 'Frete ou desconto inválido';end if;
 if length(coalesce(p_document->>'notes',''))>10000 or length(coalesce(p_document->>'discount_reason',''))>2000 then raise exception 'Observações muito longas';end if;
 if discount>0 and nullif(btrim(p_document->>'discount_reason'),'') is null then raise exception 'Informe o motivo do desconto';end if;
 if nullif(p_document->>'due_date','') is null then raise exception 'Informe o vencimento da venda';end if;
 perform 1 from public.erp_receivables where sale_id=s.id for update;
 if not found then raise exception 'Cobrança da venda não encontrada';end if;
 perform 1 from public.erp_real_payments where sale_id=s.id order by id for update;
 perform 1 from public.erp_sale_items where sale_id=s.id order by id for update;
 perform 1 from public.erp_production_tasks where sale_id=s.id order by id for update;
 perform pamda_private.check_production_items(s.id,p_document->'items');
 select coalesce(jsonb_agg(to_jsonb(i) order by id),'[]') into before_items from public.erp_sale_items i where sale_id=s.id;
 select coalesce(jsonb_agg(to_jsonb(p) order by id),'[]') into before_payments from public.erp_real_payments p where sale_id=s.id;
 perform 1 from public.products where id in (
 select product_id from public.erp_sale_items where sale_id=s.id union select (v->>'product_id')::uuid from jsonb_array_elements(p_document->'items') v union
 select component_product_id from public.kit_components where kit_product_id in(select (v->>'product_id')::uuid from jsonb_array_elements(p_document->'items') v) union
 select product_id from public.erp_stock_movements where sale_id=s.id) order by id for update;
 for x in select * from jsonb_array_elements(p_document->'items') loop
  old_item:=null;item_id:=nullif(x->>'id','')::uuid;
  if item_id is not null then select * into old_item from public.erp_sale_items where id=item_id and sale_id=s.id;if not found then raise exception 'Item não pertence à venda';end if;end if;
  if item_id=any(kept) then raise exception 'Item repetido';end if;
  select * into prod from public.products where id=(x->>'product_id')::uuid;
  if not found or (not prod.active and old_item.product_id is distinct from prod.id) then raise exception 'Produto inexistente ou inativo';end if;
  qty:=(x->>'quantity')::numeric;price:=(x->>'unit_price')::numeric;custom:=coalesce(x->'customization','{}');
  if qty is null or qty<=0 or qty>100000 or qty<>trunc(qty) or price is null or price<0 or price>1000000 or price<>round(price,2) or price='NaN'::numeric or jsonb_typeof(custom) is distinct from 'object' then raise exception 'Quantidade, preço ou personalização inválidos';end if;
  if custom?'production_task_id' and not pamda_private.production_item_managed(s.id,custom,prod.id,qty) then raise exception 'Vínculo de produção inválido';end if;
  if old_item.product_id=prod.id then direct_cost:=old_item.direct_unit_cost_snapshot;cost:=old_item.unit_cost_snapshot;
  else
   direct_cost:=prod.current_cost;
   if prod.type='kit' then
    if not exists(select 1 from public.kit_components where kit_product_id=prod.id) or exists(select 1 from public.kit_components k join public.products p on p.id=k.component_product_id where k.kit_product_id=prod.id and p.type='kit') then raise exception 'Kit sem componentes ou aninhado';end if;
    select case when bool_and(p.current_cost is not null) then sum(k.quantity*p.current_cost) end into direct_cost from public.kit_components k join public.products p on p.id=k.component_product_id where k.kit_product_id=prod.id;
   end if;cost:=coalesce(prod.managerial_cost,direct_cost);
  end if;
  item_id:=coalesce(item_id,gen_random_uuid());kept:=array_append(kept,item_id);
  items:=items||jsonb_build_array(jsonb_build_object('id',item_id,'product_id',prod.id,'quantity',qty,'unit_price',price,'customization',custom));
  if old_item.id is null then
   insert into public.erp_sale_items(id,sale_id,product_id,product_code_snapshot,product_sku_snapshot,description_snapshot,quantity,negotiated_unit_price,customization,direct_unit_cost_snapshot,unit_cost_snapshot,cost_verified)
    values(item_id,s.id,prod.id,prod.code,prod.sku,prod.name,qty,price,custom,direct_cost,cost,cost is not null);
  else
   update public.erp_sale_items set product_id=prod.id,product_code_snapshot=case when old_item.product_id=prod.id then old_item.product_code_snapshot else prod.code end,
    product_sku_snapshot=case when old_item.product_id=prod.id then old_item.product_sku_snapshot else prod.sku end,description_snapshot=case when old_item.product_id=prod.id then old_item.description_snapshot else prod.name end,
    quantity=qty,negotiated_unit_price=price,customization=custom,direct_unit_cost_snapshot=direct_cost,unit_cost_snapshot=cost,cost_verified=case when old_item.product_id=prod.id then old_item.cost_verified else cost is not null end where id=item_id;
  end if;subtotal:=subtotal+round(qty*price,2);
 end loop;
 if discount>subtotal then raise exception 'Desconto excede o subtotal';end if;
 select jsonb_agg(jsonb_build_object('product_id',v->'product_id','quantity',v->'quantity','production',v->'customization'->'production_task_id') order by v->>'product_id',v->>'id') into old_shape from jsonb_array_elements(before_items) v;
 select jsonb_agg(jsonb_build_object('product_id',v->'product_id','quantity',v->'quantity','production',v->'customization'->'production_task_id') order by v->>'product_id',v->>'id') into new_shape from jsonb_array_elements(items) v;
 stock_changed:=old_shape is distinct from new_shape;
 delete from public.erp_sale_items where sale_id=s.id and not(id=any(kept));
 if stock_changed then
  -- Refuse to guess historical kit composition when the current catalog no longer matches its recorded consumption.
  if exists(with expected as (
   select (v->>'product_id')::uuid product_id,sum((v->>'quantity')::numeric) qty from jsonb_array_elements(before_items) v join public.products p on p.id=(v->>'product_id')::uuid where p.controls_inventory and p.type<>'kit' and not pamda_private.production_item_managed(s.id,v->'customization',p.id,(v->>'quantity')::numeric) group by v->>'product_id'
   union all select k.component_product_id,sum((v->>'quantity')::numeric*k.quantity) from jsonb_array_elements(before_items) v join public.kit_components k on k.kit_product_id=(v->>'product_id')::uuid join public.products p on p.id=k.component_product_id where p.controls_inventory and not pamda_private.production_item_managed(s.id,v->'customization',(v->>'product_id')::uuid,(v->>'quantity')::numeric) group by k.component_product_id
  ), expected_sum as(select product_id,-sum(expected.qty) qty from expected group by product_id), actual as(select product_id,sum(quantity) qty from public.erp_stock_movements where sale_id=s.id and kind in ('sale','reversal') group by product_id)
  select 1 from expected_sum e full join actual a using(product_id) where coalesce(e.qty,0)<>coalesce(a.qty,0)) then raise exception 'A composição antiga do estoque difere do catálogo atual. Confira os movimentos antes de trocar os produtos desta venda';end if;
  for movement in with required as (
   select si.product_id,sum(si.quantity) qty from public.erp_sale_items si join public.products p on p.id=si.product_id where si.sale_id=s.id and p.controls_inventory and p.type<>'kit' and not pamda_private.production_item_managed(s.id,si.customization,si.product_id,si.quantity) group by si.product_id
   union all select k.component_product_id,sum(si.quantity*k.quantity) from public.erp_sale_items si join public.kit_components k on k.kit_product_id=si.product_id join public.products p on p.id=k.component_product_id where si.sale_id=s.id and p.controls_inventory and not pamda_private.production_item_managed(s.id,si.customization,si.product_id,si.quantity) group by k.component_product_id
  ), target as(select product_id,-sum(required.qty) qty from required group by product_id), existing as(select product_id,sum(quantity) qty from public.erp_stock_movements where sale_id=s.id and kind in ('sale','reversal') group by product_id)
  select coalesce(t.product_id,e.product_id) product_id,coalesce(t.qty,0)-coalesce(e.qty,0) delta from target t full join existing e using(product_id) where coalesce(t.qty,0)<>coalesce(e.qty,0) order by 1 loop
   update public.products set current_inventory=current_inventory+movement.delta,updated_at=now() where id=movement.product_id;
   insert into public.erp_stock_movements(product_id,sale_id,quantity,balance_after,kind,unit_cost,reason,request_key,actor_user_id)
    select id,s.id,movement.delta,current_inventory,case when movement.delta>0 then 'reversal' else 'sale' end,current_cost,'Manutenção pedido '||s.order_number||': '||btrim(p_reason),p_request_key,auth.uid() from public.products where id=movement.product_id;
  end loop;
 end if;
 for x in select * from jsonb_array_elements(p_document->'payments') loop
  payment_id:=nullif(x->>'id','')::uuid;pay:=null;
  if payment_id is not null then select * into pay from public.erp_real_payments where id=payment_id and sale_id=s.id and status<>'void';if not found then raise exception 'Pagamento não pertence à venda';end if;end if;
  if payment_id=any(kept_payments) then raise exception 'Pagamento repetido';end if;
  amount:=(x->>'amount')::numeric;
  if amount is null or amount<=0 or amount>1000000 or amount<>round(amount,2) or amount='NaN'::numeric or coalesce(x->>'status','') not in ('paid','pending','scheduled') then raise exception 'Pagamento inválido';end if;
  if pay.channel='site' then
   if pay.method_code is distinct from x->>'method_code' or pay.amount<>amount or pay.status is distinct from x->>'status' or pay.scheduled_for is distinct from nullif(x->>'scheduled_for','')::timestamptz or coalesce(pay.reference,'')<>coalesce(x->>'reference','') then raise exception 'Pagamento externo não permite alteração manual';end if;
  else
   if x->>'method_code'='credito_cliente' or not exists(select 1 from public.erp_payment_methods where code=x->>'method_code' and active) then raise exception 'Forma de pagamento inválida ou inativa';end if;
   if x->>'status'='scheduled' and nullif(x->>'scheduled_for','') is null then raise exception 'Informe a data agendada';end if;
   if length(coalesce(x->>'reference',''))>2000 then raise exception 'Referência muito longa';end if;
   if payment_id is null then
    insert into public.erp_real_payments(sale_id,method_code,amount,status,channel,scheduled_for,paid_at,reference,actor_user_id)
     values(s.id,x->>'method_code',amount,x->>'status','erp',nullif(x->>'scheduled_for','')::timestamptz,case when x->>'status'='paid' then now() end,nullif(x->>'reference',''),auth.uid()) returning id into payment_id;
   else
    update public.erp_real_payments set method_code=x->>'method_code',amount=maintenance.amount,status=x->>'status',scheduled_for=nullif(x->>'scheduled_for','')::timestamptz,
     paid_at=case when x->>'status'='paid' then coalesce(pay.paid_at,now()) end,reference=nullif(x->>'reference','') where id=payment_id;
   end if;
  end if;
  kept_payments:=array_append(kept_payments,payment_id);payment_total:=payment_total+amount;if x->>'status'='paid' then paid:=paid+amount;end if;
 end loop;
 if exists(select 1 from public.erp_real_payments where sale_id=s.id and status<>'void' and channel='site' and not(id=any(kept_payments))) then raise exception 'Pagamento externo não pode ser removido';end if;
 if payment_total<>subtotal-discount+freight then raise exception 'Soma dos pagamentos deve corresponder ao total corrigido';end if;
 update public.erp_real_payments set status='void' where sale_id=s.id and status<>'void' and not(id=any(kept_payments));
 update public.erp_sales set subtotal=maintenance.subtotal,discount_amount=discount,discount_reason=nullif(p_document->>'discount_reason',''),shipping_charged=freight,shipping_confirmed=true,notes=nullif(p_document->>'notes',''),
  payment_method_id=case when jsonb_array_length(p_document->'payments')=1 then (select id from public.erp_payment_methods where code=p_document->'payments'->0->>'method_code') else null end,updated_at=clock_timestamp() where id=s.id;
 update public.erp_receivables set total=subtotal-discount+freight,paid=maintenance.paid,due_date=(p_document->>'due_date')::date where sale_id=s.id;
 update public.erp_production_tasks t set stage='cancelled',updated_at=now() where t.sale_id=s.id and t.source='erp' and not exists(select 1 from public.erp_sale_items i where i.sale_id=s.id and i.id=t.sale_item_key);
 update public.erp_production_tasks t set product_id=i.product_id,quantity=i.quantity,
  physical_product_id=case when p.controls_inventory and p.type<>'kit' then p.id when p.type='kit' then (select case when count(*)=1 then min(k.component_product_id::text)::uuid end from public.kit_components k join public.products c on c.id=k.component_product_id where k.kit_product_id=p.id and c.controls_inventory) end,
  stock_quantity=case when p.controls_inventory and p.type<>'kit' then i.quantity when p.type='kit' then i.quantity*coalesce((select sum(k.quantity) from public.kit_components k join public.products c on c.id=k.component_product_id where k.kit_product_id=p.id and c.controls_inventory),0) else 0 end,
  case_source=case when p.type='servico' and p.code='2' then 'customer' else 'pamda' end,
  model=coalesce(nullif(i.customization->>'model',''),p.model_phone,i.description_snapshot),requires_print=(p.type<>'fisico' or i.description_snapshot ilike '%personaliz%'),updated_at=now()
  from public.erp_sale_items i join public.products p on p.id=i.product_id where t.sale_id=s.id and t.source='erp' and t.retry_of is null and t.sale_item_key=i.id and t.stage<>'cancelled';
 update public.erp_production_jobs set status=case when (select production_after_payment from public.erp_operational_settings where singleton) and paid<subtotal-discount+freight then 'blocked' else 'queued' end,updated_at=now() where sale_id=s.id and status in ('blocked','queued');
 update public.erp_production_jobs set sale_id=s.id where sale_id=s.id;
 update public.erp_sale_receipts set receipt_snapshot=receipt_snapshot||jsonb_build_object('total',subtotal-discount+freight,'items',(select jsonb_agg(to_jsonb(i)-'unit_cost_snapshot'-'direct_unit_cost_snapshot'-'cost_verified' order by i.created_at,i.id) from public.erp_sale_items i where sale_id=s.id)) where sale_id=s.id;
 insert into public.erp_sale_events(sale_id,actor_user_id,event_type,details) values(s.id,auth.uid(),'confirmed_sale_edited',jsonb_build_object('reason',btrim(p_reason),'previous_total',s.total,'total',subtotal-discount+freight,'stock_adjusted',stock_changed,
  'before_items',(select jsonb_agg(v-'unit_cost_snapshot'-'direct_unit_cost_snapshot'-'cost_verified') from jsonb_array_elements(before_items)v),'after_items',(select jsonb_agg(to_jsonb(i)-'unit_cost_snapshot'-'direct_unit_cost_snapshot'-'cost_verified') from public.erp_sale_items i where sale_id=s.id),'before_payments',before_payments,'after_payments',(select jsonb_agg(to_jsonb(p)) from public.erp_real_payments p where sale_id=s.id)));
 perform pamda_private.audit('sale.maintenance.edit',s.id,jsonb_build_object('reason',btrim(p_reason),'previous_total',s.total,'total',subtotal-discount+freight,'stock_adjusted',stock_changed));
 insert into pamda_private.sale_maintenance_requests(request_key,actor,sale_id,payload) values(p_request_key,auth.uid(),s.id,payload);
 return s.id;
end $$;
revoke all on function public.pamda_sale_movement_edit(uuid,jsonb,text,timestamptz,uuid) from public,anon;
grant execute on function public.pamda_sale_movement_edit(uuid,jsonb,text,timestamptz,uuid) to authenticated;

do $$ declare d text;begin
 select pg_get_functiondef('public.pamda_sale_movement_read(uuid)'::regprocedure) into d;
 d:=replace(d,'''can_maintain'',public.pamda_has_permission(''sales.maintain'')','''can_edit_sale'',public.pamda_has_permission(''sales.maintain'') and not exists(select 1 from public.erp_sale_merges where preserve_originals and (sale_id=s.id or s.id=any(source_ids))),''receivable'',(select to_jsonb(r) from public.erp_receivables r where sale_id=s.id),''can_maintain'',public.pamda_has_permission(''sales.maintain'')');
 if position('can_edit_sale' in d)=0 then raise exception 'Consulta de manutenção incompatível';end if;execute d;
end $$;
