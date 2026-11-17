-- Pending aggregates can adjust commercial totals without rewriting source orders/items.
do $patch$
declare d text; original text;
begin
 select replace(pg_get_functiondef('public.pamda_salvar_rascunho_venda(uuid,uuid,jsonb,numeric,numeric,text,text,uuid,uuid,uuid)'::regprocedure),chr(13),'') into d;
 original:=d;
 d:=replace(d,' OR p_frete IS DISTINCT FROM v_closing.shipping_charged','');
 d:=replace(d,'OR p_desconto IS DISTINCT FROM v_closing.discount_amount OR v_in IS DISTINCT FROM v_saved','OR v_in IS DISTINCT FROM v_saved');
 d:=replace(d,' OR coalesce(p_motivo,'''')<>coalesce(v_closing.discount_reason,'''')','');
 d:=replace(d,'  IF p_forma_id IS NOT NULL AND NOT EXISTS(select 1 from public.erp_payment_methods', $checks$
  IF p_frete IS DISTINCT FROM v_closing.shipping_charged AND NOT public.pamda_has_permission('sales.shipping.override') THEN
   RAISE EXCEPTION 'Permissão necessária para alterar frete' USING errcode='42501'; END IF;
  IF (p_desconto IS DISTINCT FROM v_closing.discount_amount OR coalesce(p_motivo,'')<>coalesce(v_closing.discount_reason,'')) AND NOT public.pamda_has_permission('sales.discount') THEN
   RAISE EXCEPTION 'Desconto requer autorização' USING errcode='42501'; END IF;
  IF round(p_frete,2) IS DISTINCT FROM p_frete OR round(p_desconto,2) IS DISTINCT FROM p_desconto THEN RAISE EXCEPTION 'Informe valores em centavos'; END IF;
  IF p_desconto>v_closing.subtotal THEN RAISE EXCEPTION 'Desconto excede subtotal'; END IF;
  IF p_desconto>0 AND nullif(btrim(p_motivo),'') IS NULL THEN RAISE EXCEPTION 'Informe motivo do desconto'; END IF;
  IF p_forma_id IS NOT NULL AND NOT EXISTS(select 1 from public.erp_payment_methods$checks$);
 d:=replace(d,'  UPDATE public.erp_sales SET payment_method_id=p_forma_id,payment_term_id=p_prazo_id,updated_at=now() WHERE id=p_venda_id;', $update$
  UPDATE public.erp_sales SET payment_method_id=p_forma_id,payment_term_id=p_prazo_id,
   shipping_charged=p_frete,shipping_confirmed=true,discount_amount=p_desconto,discount_reason=p_motivo,updated_at=now() WHERE id=p_venda_id;
  INSERT INTO public.erp_sale_events(sale_id,actor_user_id,event_type,details)
   VALUES(p_venda_id,v_user,'draft_saved',jsonb_build_object('closing_adjustment',true,'shipping',p_frete,'discount',p_desconto,'reason',p_motivo,
     'previous_shipping',v_closing.shipping_charged,'previous_discount',v_closing.discount_amount));$update$);
 if d=original or position('closing_adjustment' in d)=0 or position('Informe valores em centavos' in d)=0 then raise exception 'Unexpected aggregate save definition';end if;
 execute d;

 select replace(pg_get_functiondef('public.pamda_merge_pending_sales(uuid[],uuid)'::regprocedure),chr(13),'') into d;
 original:=d;
 -- Branch identity remains in the original order snapshot and the source links.
 d:=replace(d,'''Pedido ''||order_number||'' · ''||coalesce(branch_snapshot->>''name'','''')','''Pedido ''||order_number');
 if d=original then raise exception 'Unexpected merge notes definition';end if;
 execute d;
end $patch$;

-- Allocate only differences from the source totals; unchanged closings keep their exact figures.
-- Round cumulative allocations to preserve every cent, including negative adjustments.
create or replace view pamda_private.reporting_sales with(security_invoker=true) as
with sources as (
 select s.*,m.sale_id closing_id,t.status closing_status,t.shipping_actual_cost closing_delivery_cost,
 t.shipping_charged closing_shipping,t.discount_amount closing_discount,
 sum(s.shipping_charged) over(partition by m.sale_id) original_shipping,
 sum(s.discount_amount) over(partition by m.sale_id) original_discount
 from public.erp_sales s left join public.erp_sale_merges m on s.id=any(m.source_ids) and m.preserve_originals
 left join public.erp_sales t on t.id=m.sale_id
 where not exists(select 1 from public.erp_sale_merges closing where closing.sale_id=s.id and closing.preserve_originals)
), weighted as (
 select s.*,case when original_shipping>0 then shipping_charged else 1 end shipping_weight,
 case when closing_discount>=original_discount then subtotal-discount_amount else discount_amount end discount_weight
 from sources s
), allocated as (
 select s.*,sum(shipping_weight) over(partition by closing_id) total_shipping_weight,
 sum(shipping_weight) over(partition by closing_id order by created_at,id rows unbounded preceding) cumulative_shipping_weight,
 sum(discount_weight) over(partition by closing_id) total_discount_weight,
 sum(discount_weight) over(partition by closing_id order by created_at,id rows unbounded preceding) cumulative_discount_weight
 from weighted s
), adjusted as (
 select s.*,
 case when closing_id is not null then
  round((closing_shipping-original_shipping)*cumulative_shipping_weight/total_shipping_weight,2)-
  round((closing_shipping-original_shipping)*(cumulative_shipping_weight-shipping_weight)/total_shipping_weight,2)
 else 0 end shipping_delta,
 case when closing_id is not null and closing_discount<>original_discount then
  round((closing_discount-original_discount)*cumulative_discount_weight/nullif(total_discount_weight,0),2)-
  round((closing_discount-original_discount)*(cumulative_discount_weight-discount_weight)/nullif(total_discount_weight,0),2)
 else 0 end discount_delta
 from allocated s
)
select s.id,s.order_number,case when closing_id is not null then s.created_at else s.confirmed_at end confirmed_at,
 s.customer_id,s.customer_snapshot,(s.total+shipping_delta-coalesce(discount_delta,0))::numeric(12,2) total,s.subtotal,
 (s.discount_amount+coalesce(discount_delta,0))::numeric(12,2) discount_amount,
 (s.shipping_charged+shipping_delta)::numeric(12,2) shipping_charged,
 case when closing_id is not null and closing_delivery_cost is not null then
  round(closing_delivery_cost*cumulative_shipping_weight/total_shipping_weight,2)-
  round(closing_delivery_cost*(cumulative_shipping_weight-shipping_weight)/total_shipping_weight,2)
 else s.shipping_actual_cost end shipping_actual_cost,
 case when closing_id is not null then closing_status else s.status end status,s.is_test from adjusted s;
revoke all on pamda_private.reporting_sales from public,anon,authenticated;
