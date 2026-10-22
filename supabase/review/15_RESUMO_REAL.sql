create or replace function public.pamda_resumo_erp() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_finance boolean:=public.pamda_has_permission('finance.read'); v_sales boolean:=public.pamda_has_permission('sales.read');
begin
 if auth.uid() is null or not exists(select 1 from public.erp_user_profiles where user_id=auth.uid() and active) then raise exception 'Sessão inválida' using errcode='42501'; end if;
 return jsonb_build_object('as_of',now(),
 'pending_sales',(select count(*) from public.erp_sales where status='draft' and (v_sales or created_by=auth.uid())),
 'pending_with_product_history',(select count(*) from public.erp_sales where status='draft' and first_product_at is not null and (v_sales or created_by=auth.uid())),
 'pending_never_with_product',(select count(*) from public.erp_sales where status='draft' and first_product_at is null and (v_sales or created_by=auth.uid())),
 'confirmed_sales',(select count(*) from public.erp_sales where status='confirmed' and not is_test and (v_sales or created_by=auth.uid())),
 'cancelled_sales',(select count(*) from public.erp_sales where status='cancelled' and not is_test and (v_sales or created_by=auth.uid())),
 'official_receipts',(select count(*) from public.erp_sale_receipts r join public.erp_sales s on s.id=r.sale_id where not s.is_test and (v_sales or s.created_by=auth.uid())),
 'test_confirmed_sales',0,'test_receipts',0,
 'catalog_active',(select count(*) from public.products where active),
 'physical_items',(select count(*) from public.products where active and controls_inventory),
 'physical_stock_verified',(select count(*) from public.products where active and controls_inventory and stock_verified),
 'production_queue_count',case when public.pamda_has_permission('production.read') then (select count(*) from public.erp_production_jobs where status in ('blocked','queued','in_progress')) end,
 'confirmed_revenue_today',case when v_finance then (select coalesce(sum(total),0) from public.erp_sales where status='confirmed' and not is_test and (confirmed_at at time zone 'America/Sao_Paulo')::date=(now() at time zone 'America/Sao_Paulo')::date) end,
 'confirmed_revenue_month',case when v_finance then (select coalesce(sum(total),0) from public.erp_sales where status='confirmed' and not is_test and date_trunc('month',confirmed_at at time zone 'America/Sao_Paulo')=date_trunc('month',now() at time zone 'America/Sao_Paulo')) end,
 'receivables_balance',case when v_finance then (select coalesce(sum(r.total-r.paid),0) from public.erp_receivables r join public.erp_sales s on s.id=r.sale_id where not s.is_test and s.status='confirmed') end);
end $$;
revoke all on function public.pamda_resumo_erp() from public,anon;
grant execute on function public.pamda_resumo_erp() to authenticated;
