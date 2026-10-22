-- Permissão individual permite consultar clientes a perfis autorizados pelo administrador.
-- As permissões comerciais anteriores permanecem válidas.
create policy erp_customers_individual_read on public.customers for select to authenticated
using ((select public.pamda_has_permission('customers.manage')));
create policy erp_branches_individual_read on public.customer_branches for select to authenticated
using ((select public.pamda_has_permission('customers.manage')));
