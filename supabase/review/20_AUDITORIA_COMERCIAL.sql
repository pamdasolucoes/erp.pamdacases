create or replace function public.pamda_operation_read(p_module text,p_start date default null,p_end date default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_data jsonb; v_permission text;
begin
 v_permission:=case p_module when 'stock' then 'stock.read' when 'purchases' then 'purchases.manage'
 when 'expenses' then 'expenses.manage' when 'receivables' then 'finance.read' when 'closings' then 'finance.read'
 when 'production' then 'production.read' when 'deliveries' then 'deliveries.manage' when 'reports' then 'reports.read'
 when 'profitability' then 'profitability.read' when 'audit' then 'audit.read' when 'settings' then 'settings.manage' end;
 if v_permission is null then raise exception 'Módulo desconhecido'; end if;
 perform pamda_private.require_permission(v_permission);
 if p_module='stock' then
 select jsonb_build_object('products',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'code',code,'name',name,'balance',current_inventory,'verified',stock_verified,'min',min_inventory,'cost',case when public.pamda_has_permission('stock.cost') then current_cost end) order by code),'[]') from public.products where controls_inventory and active),
 'movements',(select coalesce(jsonb_agg(to_jsonb(x)-'unit_cost'),'[]') from (select m.*,p.code,p.name from public.erp_stock_movements m join public.products p on p.id=m.product_id order by m.created_at desc limit 500) x)) into v_data;
 elsif p_module='purchases' then
 select jsonb_build_object('suppliers',(select coalesce(jsonb_agg(to_jsonb(t) order by name),'[]') from public.erp_suppliers t),
 'products',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'code',code,'name',name) order by code),'[]') from public.products where active and controls_inventory),
 'entries',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from (select e.*,s.name supplier_name from public.erp_stock_entries e left join public.erp_suppliers s on s.id=e.supplier_id order by e.created_at desc limit 500) t)) into v_data;
 elsif p_module='expenses' then
 select jsonb_build_object('rows',coalesce(jsonb_agg(to_jsonb(t) order by expense_date desc),'[]')) into v_data from public.erp_expenses t where (p_start is null or expense_date>=p_start) and (p_end is null or expense_date<=p_end);
 elsif p_module='receivables' then
 select jsonb_build_object('rows',coalesce(jsonb_agg(to_jsonb(t) order by due_date),'[]'), 'methods',(select jsonb_agg(jsonb_build_object('code',code,'name',name)) from public.erp_payment_methods where active and code<>'credito_cliente')) into v_data
 from (select r.*,s.order_number,s.customer_id,s.customer_snapshot->>'name' customer_name from public.erp_receivables r join public.erp_sales s on s.id=r.sale_id where s.status='confirmed' and not s.is_test) t;
 elsif p_module='closings' then
 select jsonb_build_object('rows',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from (select c.*,cu.name customer_name,
 (select sum(r.total) from public.erp_billing_closing_sales cs join public.erp_receivables r on r.sale_id=cs.sale_id where cs.closing_id=c.id) total,
 (select sum(r.total-r.paid) from public.erp_billing_closing_sales cs join public.erp_receivables r on r.sale_id=cs.sale_id where cs.closing_id=c.id) balance,
 (select jsonb_agg(s.order_number) from public.erp_billing_closing_sales cs join public.erp_sales s on s.id=cs.sale_id where cs.closing_id=c.id) orders
 from public.erp_billing_closings c join public.customers cu on cu.id=c.customer_id order by created_at desc) t),
 'customers',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'code',customer_code) order by name),'[]') from public.customers where active)) into v_data;
 elsif p_module='production' then
 select jsonb_build_object('rows',coalesce(jsonb_agg(to_jsonb(t) order by created_at),'[]')) into v_data
 from (select j.*,s.order_number,s.customer_snapshot->>'name' customer_name,s.notes,s.created_at,
 (select jsonb_agg(jsonb_build_object('name',i.description_snapshot,'quantity',i.quantity,'customization',i.customization)) from public.erp_sale_items i where i.sale_id=s.id) items
 from public.erp_production_jobs j join public.erp_sales s on s.id=j.sale_id where s.status='confirmed' and not s.is_test) t;
 elsif p_module='deliveries' then
 select jsonb_build_object('rows',coalesce(jsonb_agg(to_jsonb(t) order by order_number desc),'[]')) into v_data
 from (select d.*,s.order_number,s.customer_snapshot->>'name' customer_name,s.branch_snapshot address,s.shipping_charged,j.status production_status
 from public.erp_deliveries d join public.erp_sales s on s.id=d.sale_id join public.erp_production_jobs j on j.sale_id=s.id where not s.is_test and s.status='confirmed') t;
 elsif p_module in ('reports','profitability') then
 select jsonb_build_object('rows',coalesce(jsonb_agg(to_jsonb(t) order by confirmed_at desc),'[]'),
 'expenses',case when p_module='profitability' then (select coalesce(sum(amount),0) from public.erp_expenses where (p_start is null or expense_date>=p_start) and (p_end is null or expense_date<=p_end)) end) into v_data
 from (select s.id,s.order_number,s.confirmed_at,s.customer_id,s.customer_snapshot->>'name' customer_name,s.total,s.subtotal,s.discount_amount,s.shipping_charged,
 case when p_module='profitability' then s.shipping_actual_cost end delivery_cost,
 case when p_module='profitability' then (select sum(i.quantity*i.unit_cost_snapshot) from public.erp_sale_items i where i.sale_id=s.id) end product_cost,
 case when p_module='profitability' then (select bool_and(i.cost_verified and i.unit_cost_snapshot is not null) from public.erp_sale_items i where i.sale_id=s.id) end cost_verified
 from public.erp_sales s where s.status='confirmed' and not s.is_test
 and (p_start is null or (s.confirmed_at at time zone 'America/Sao_Paulo')::date>=p_start) and (p_end is null or (s.confirmed_at at time zone 'America/Sao_Paulo')::date<=p_end)) t;
 elsif p_module='audit' then
 select jsonb_build_object('rows',coalesce(jsonb_agg(to_jsonb(t) order by happened_at desc),'[]')) into v_data from (
 select a.id,a.action,a.actor_user_id,a.details,a.created_at happened_at from public.erp_operations_audit a
 union all select a.id,a.action,a.actor_user_id,a.details,a.created_at from public.erp_access_audit a
 union all select a.id,a.action,a.actor_user_id,jsonb_build_object('before',a.before_data,'after',a.after_data,'reason',a.reason),a.occurred_at from public.erp_product_admin_audit a
 union all select a.id,a.event_type,a.actor_user_id,a.details,a.occurred_at from public.erp_sale_events a
 union all select a.id,a.action,a.actor_user_id,jsonb_build_object('before',a.before_data,'after',a.after_data,'reason',a.reason),a.created_at from public.erp_commercial_change_audit a
 ) t where (p_start is null or happened_at>=p_start) and (p_end is null or happened_at<p_end+1);
 elsif p_module='settings' then select to_jsonb(s) into v_data from public.erp_operational_settings s where singleton;
 end if;
 return v_data;
end $$;
