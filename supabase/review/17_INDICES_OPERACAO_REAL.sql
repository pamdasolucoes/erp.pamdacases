create index if not exists erp_operations_audit_actor_idx on public.erp_operations_audit(actor_user_id);
create index if not exists erp_stock_movements_actor_idx on public.erp_stock_movements(actor_user_id);
create index if not exists erp_stock_entries_supplier_idx on public.erp_stock_entries(supplier_id);
create index if not exists erp_stock_entries_actor_idx on public.erp_stock_entries(actor_user_id);
create index if not exists erp_expenses_actor_idx on public.erp_expenses(actor_user_id);
create index if not exists erp_real_payments_actor_idx on public.erp_real_payments(actor_user_id);
create index if not exists erp_billing_closings_customer_idx on public.erp_billing_closings(customer_id);
create index if not exists erp_billing_closings_actor_idx on public.erp_billing_closings(actor_user_id);
