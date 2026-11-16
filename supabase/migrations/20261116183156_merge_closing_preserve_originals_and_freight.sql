-- A merge is a billing document. Original orders remain the commercial history.
alter table public.erp_sale_items add column source_sale_item_id uuid references public.erp_sale_items(id);
create unique index erp_sale_items_source_per_closing on public.erp_sale_items(sale_id,source_sale_item_id) where source_sale_item_id is not null;

-- Recover exact item links for existing closings, without changing prices or costs.
with originals as (
 select m.sale_id target_id,i.*,row_number() over(partition by m.sale_id,i.product_id,i.quantity,i.negotiated_unit_price,i.customization,i.description_snapshot order by s.created_at,s.id,i.created_at,i.id) rn
 from public.erp_sale_merges m join public.erp_sales s on s.id=any(m.source_ids) join public.erp_sale_items i on i.sale_id=s.id
), copies as (
 select i.*,row_number() over(partition by i.sale_id,i.product_id,i.quantity,i.negotiated_unit_price,i.customization,i.description_snapshot order by i.created_at,i.id) rn
 from public.erp_sale_items i join public.erp_sale_merges m on m.sale_id=i.sale_id
)
update public.erp_sale_items i set source_sale_item_id=o.id from copies c join originals o
 on o.target_id=c.sale_id and o.product_id=c.product_id and o.quantity=c.quantity and o.negotiated_unit_price=c.negotiated_unit_price
 and o.customization is not distinct from c.customization and o.description_snapshot=c.description_snapshot and o.rn=c.rn
where i.id=c.id;

-- Repair only still-open closings. Already issued/paid documents are not rewritten.
update public.erp_sales t set shipping_charged=x.freight,shipping_confirmed=x.confirmed,updated_at=now()
from (select m.sale_id,sum(s.shipping_charged) freight,bool_and(s.shipping_confirmed and s.shipping_charged is not null) confirmed
 from public.erp_sale_merges m join public.erp_sales s on s.id=any(m.source_ids) group by m.sale_id)x
where t.id=x.sale_id and t.status='draft';

drop policy sale_merges_read on public.erp_sale_merges;
create policy sale_merges_read on public.erp_sale_merges for select to authenticated using(
 (public.pamda_has_permission('sales.confirm') or public.pamda_has_permission('sales.read') or public.pamda_has_permission('reports.read'))
 and exists(select 1 from public.erp_sales s where s.id=erp_sale_merges.sale_id or s.id=any(erp_sale_merges.source_ids)));

create function pamda_private.sale_merge_context(p_sale_id uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('role',case when m.sale_id=p_sale_id then 'closing' else 'source' end,
 'target',(select jsonb_build_object('id',s.id,'order_number',s.order_number,'created_at',s.created_at,'status',s.status,'total',s.total) from public.erp_sales s where s.id=m.sale_id),
 'sources',(select jsonb_agg(jsonb_build_object('id',s.id,'order_number',s.order_number,'created_at',s.created_at,'total',s.total,'shipping_charged',s.shipping_charged) order by s.created_at,s.id) from public.erp_sales s where s.id=any(m.source_ids)))
 from public.erp_sale_merges m where m.sale_id=p_sale_id or p_sale_id=any(m.source_ids) order by m.created_at desc limit 1;
$$;
revoke all on function pamda_private.sale_merge_context(uuid) from public,anon,authenticated;

-- Reporting substitutes each billing aggregate with its original orders exactly once.
-- A source contributes only after its closing is confirmed; cancellation removes it again.
create view pamda_private.reporting_sales with(security_invoker=true) as
with sources as (
 select s.*,m.sale_id closing_id,t.status closing_status,t.shipping_actual_cost closing_delivery_cost,
 case when sum(s.shipping_charged) over(partition by m.sale_id)>0 then s.shipping_charged else 1 end allocation_weight
 from public.erp_sales s left join public.erp_sale_merges m on s.id=any(m.source_ids)
 left join public.erp_sales t on t.id=m.sale_id
 where not exists(select 1 from public.erp_sale_merges closing where closing.sale_id=s.id)
), allocated as (
 select s.*,sum(allocation_weight) over(partition by closing_id) total_weight,
 sum(allocation_weight) over(partition by closing_id order by created_at,id rows unbounded preceding) cumulative_weight from sources s
)
select s.id,s.order_number,case when closing_id is not null then s.created_at else s.confirmed_at end confirmed_at,
 s.customer_id,s.customer_snapshot,s.total,s.subtotal,s.discount_amount,s.shipping_charged,
 case when closing_id is not null and closing_delivery_cost is not null then
 round(closing_delivery_cost*cumulative_weight/total_weight,2)-round(closing_delivery_cost*(cumulative_weight-allocation_weight)/total_weight,2)
 else s.shipping_actual_cost end shipping_actual_cost,
 case when closing_id is not null then closing_status else s.status end status,s.is_test from allocated s;
create view pamda_private.reporting_sale_items with(security_invoker=true) as
select i.sale_id,i.quantity,case when m.sale_id is null then i.unit_cost_snapshot else copy.unit_cost_snapshot end unit_cost_snapshot,
 case when m.sale_id is null then i.cost_verified else coalesce(copy.cost_verified,false) end cost_verified
from public.erp_sale_items i left join public.erp_sale_merges m on i.sale_id=any(m.source_ids)
left join public.erp_sale_items copy on copy.sale_id=m.sale_id and copy.source_sale_item_id=i.id;
revoke all on pamda_private.reporting_sales,pamda_private.reporting_sale_items from public,anon,authenticated;

do $patch$
declare d text;
begin
 select pg_get_functiondef('public.pamda_merge_pending_sales(uuid[],uuid)'::regprocedure) into d;
 if position('shipping_confirmed=false' in d)=0 or position('update public.erp_production_tasks set sale_id=v_id' in d)=0 then raise exception 'Unexpected merge definition'; end if;
 d:=replace(d,'shipping_confirmed=false','shipping_confirmed=(select bool_and(shipping_confirmed and shipping_charged is not null) from public.erp_sales where id=any(v_ids))');
 d:=replace(d,'select * into s from public.erp_sales where id=p_sale_ids[1];',$guard$
 if exists(select 1 from public.erp_sale_merges where sale_id=any(v_ids)) then raise exception 'Selecione pedidos originais, não um fechamento já agrupado'; end if;
 if exists(select 1 from public.erp_sales where id=any(v_ids) and (not shipping_confirmed or shipping_charged is null)) then raise exception 'Informe o frete de todos os pedidos, inclusive zero para frete liberado'; end if;
 select * into s from public.erp_sales where id=p_sale_ids[1];
 $guard$);
 d:=replace(d,'negotiated_unit_price,customization)'||chr(10)||' select v_id,product_id,product_code_snapshot,product_sku_snapshot,description_snapshot,quantity,negotiated_unit_price,customization from',
 'negotiated_unit_price,customization,source_sale_item_id)'||chr(10)||' select v_id,product_id,product_code_snapshot,product_sku_snapshot,description_snapshot,quantity,negotiated_unit_price,customization,id from');
 if position('customization,source_sale_item_id)' in d)=0 then raise exception 'Merge item mapping was not installed'; end if;
 execute d;
 select pg_get_functiondef('public.pamda_sale_movement_read(uuid)'::regprocedure) into d;
 d:=replace(d,'''sale'',to_jsonb(s),','''merge'',pamda_private.sale_merge_context(s.id),''sale'',to_jsonb(s),');
 execute d;
 select pg_get_functiondef('public.pamda_customer_sale_history(uuid)'::regprocedure) into d;
 d:=replace(d,'''date'',coalesce(confirmed_at,created_at)', '''date'',created_at,''merge'',pamda_private.sale_merge_context(id)');
 d:=replace(d,'where customer_id=p_customer_id and not is_test','where customer_id=p_customer_id and not is_test and not exists(select 1 from public.erp_sale_merges m where m.sale_id=erp_sales.id)');
 execute d;
 select pg_get_functiondef('public.pamda_operation_read(text,date,date)'::regprocedure) into d;
 if position('from public.erp_sales s where s.status=''confirmed'' and not s.is_test' in d)=0 then raise exception 'Unexpected reports definition'; end if;
 d:=replace(d,'from public.erp_sales s where s.status=''confirmed'' and not s.is_test','from pamda_private.reporting_sales s where s.status=''confirmed'' and not s.is_test');
 d:=replace(d,'from public.erp_sale_items i where i.sale_id=s.id) end product_cost','from pamda_private.reporting_sale_items i where i.sale_id=s.id) end product_cost');
 d:=replace(d,'from public.erp_sale_items i where i.sale_id=s.id) end cost_verified','from pamda_private.reporting_sale_items i where i.sale_id=s.id) end cost_verified');
 execute d;
end $patch$;

-- Only payment selection can change on an aggregate; source orders own the sale details.
do $patch$
declare d text;
begin
 select pg_get_functiondef('public.pamda_salvar_rascunho_venda(uuid,uuid,jsonb,numeric,numeric,text,text,uuid,uuid,uuid)'::regprocedure) into d;
 d:=replace(d,' v_seller text;', ' v_seller text; v_closing public.erp_sales%rowtype; v_in jsonb; v_saved jsonb;');
 if position('v_closing public.erp_sales' in d)=0 then raise exception 'Unexpected draft definition'; end if;
 d:=replace(d,' SELECT jsonb_build_object(''code'',c.customer_code', $guard$
 IF exists(select 1 from public.erp_sale_merges where sale_id=p_venda_id) THEN
  SELECT * INTO v_closing FROM public.erp_sales WHERE id=p_venda_id FOR UPDATE;
  IF v_closing.status<>'draft' OR (v_closing.created_by<>v_user AND NOT public.pamda_has_permission('sales.confirm')) THEN RAISE EXCEPTION 'Fechamento não pode ser alterado' USING errcode='42501'; END IF;
  SELECT jsonb_agg(x ORDER BY x) INTO v_in FROM (
   SELECT jsonb_build_object('product_id',(v->>'product_id')::uuid,'quantity',(v->>'quantity')::numeric,'unit_price',(v->>'unit_price')::numeric,
    'customization',coalesce(v->'customization','{}')||jsonb_build_object('model',coalesce(v->'customization'->>'model',''),'color',coalesce(v->'customization'->>'color',''),'walletFaces',coalesce(v->'customization'->>'walletFaces',''))) x
   FROM jsonb_array_elements(p_itens) v)q;
  SELECT jsonb_agg(x ORDER BY x) INTO v_saved FROM (
   SELECT jsonb_build_object('product_id',product_id,'quantity',quantity,'unit_price',negotiated_unit_price,
    'customization',coalesce(customization,'{}')||jsonb_build_object('model',coalesce(customization->>'model',''),'color',coalesce(customization->>'color',''),'walletFaces',coalesce(customization->>'walletFaces',''))) x
   FROM public.erp_sale_items WHERE sale_id=p_venda_id)q;
  IF p_cliente_id IS DISTINCT FROM v_closing.customer_id OR p_filial_id IS DISTINCT FROM v_closing.branch_id OR p_frete IS DISTINCT FROM v_closing.shipping_charged
   OR p_desconto IS DISTINCT FROM v_closing.discount_amount OR v_in IS DISTINCT FROM v_saved
   OR coalesce(p_observacoes,'')<>coalesce(v_closing.notes,'') OR coalesce(p_motivo,'')<>coalesce(v_closing.discount_reason,'')
   THEN RAISE EXCEPTION 'Este agrupamento é só para fechamento. Os dados dos pedidos originais devem ser preservados.'; END IF;
  IF p_forma_id IS NOT NULL AND NOT EXISTS(select 1 from public.erp_payment_methods where id=p_forma_id and active) THEN RAISE EXCEPTION 'Forma de pagamento inválida'; END IF;
  IF p_prazo_id IS NOT NULL AND NOT EXISTS(select 1 from public.erp_payment_terms where id=p_prazo_id and active) THEN RAISE EXCEPTION 'Prazo de pagamento inválido'; END IF;
  UPDATE public.erp_sales SET payment_method_id=p_forma_id,payment_term_id=p_prazo_id,updated_at=now() WHERE id=p_venda_id;
  RETURN p_venda_id;
 END IF;
 SELECT jsonb_build_object('code',c.customer_code$guard$);
 if position('Os dados dos pedidos originais' in d)=0 then raise exception 'Closing guard not installed'; end if;
 execute d;
end $patch$;
