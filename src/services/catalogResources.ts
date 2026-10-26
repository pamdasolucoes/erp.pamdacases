import { authService } from './auth';
import { supabase } from './supabase';
import { customerService } from './customerService';
import { productService } from './productService';
import { SessionCatalog } from './sessionCatalog';
import { subscribeCustomerCatalog } from './catalogEvents';
import type { OfficialCustomer } from '../types/pamdaCore';
import type { OfficialProduct } from '../types/productCatalog';

const project = import.meta.env.VITE_SUPABASE_URL || 'unconfigured';
const scopeFor = (userId: string) => JSON.stringify([project, userId]);
const userFor = (scope: string) => {
  const user = authService.getCurrentUser();
  if (!user || authService.getError() || scopeFor(user.id) !== scope) throw new Error('A sessão mudou. Valide seu acesso.');
  return user.id;
};
export const customerCatalog = new SessionCatalog<readonly OfficialCustomer[]>((scope, signal) => customerService.list(signal, userFor(scope)));
export const productCatalog = new SessionCatalog<readonly OfficialProduct[]>((scope, signal) => productService.list(signal, userFor(scope)));
let permissionSignature = '';
const unsubscribeAuth = authService.subscribe((user, loading, error) => {
  const valid = user && !error ? user : null;
  const signature = valid ? JSON.stringify([valid.id, valid.role, valid.canReadCustomers, valid.canViewFinancialMetrics,valid.permissions]) : '';
  const changed = signature !== permissionSignature;
  if (changed) { customerCatalog.clear(); productCatalog.clear(); permissionSignature = signature; }
  const scope = valid ? scopeFor(valid.id) : null;
  customerCatalog.setScope(scope); productCatalog.setScope(scope);
  if (!loading && valid) {
    // App revalidates Auth on focus/online/visibility and token refresh. Recheck RLS too.
    if (changed) {
      if (customerCatalog.getSnapshot().data === null) customerCatalog.refreshActive();
      if (productCatalog.getSnapshot().data === null) productCatalog.refreshActive();
    } else { customerCatalog.revalidate(); productCatalog.revalidate(); }
  }
});
const unsubscribeChanges = subscribeCustomerCatalog(({ client, userId, customer }) => {
  if (client !== supabase || userForSafe() !== userId) return;
  if (customer) customerCatalog.replace(scopeFor(userId), rows => rows.some(row => row.id === customer.id) ? rows.map(row => row.id === customer.id ? customer : row) : [...rows, customer]);
  else customerCatalog.invalidate();
});
function userForSafe() { return authService.getError() ? null : authService.getCurrentUser()?.id; }
if (import.meta.hot) import.meta.hot.dispose(() => { unsubscribeAuth(); unsubscribeChanges(); customerCatalog.setScope(null); productCatalog.setScope(null); });
