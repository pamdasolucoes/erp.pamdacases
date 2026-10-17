import type { OfficialCustomer } from '../types/pamdaCore';

// Names/order/import codes do not prove headquarters. The optional marker is explicit.
export function defaultBranchId(customer: OfficialCustomer): string {
  if(customer.branches.length===1) return customer.branches[0].active ? customer.branches[0].id : '';
  const primary=customer.branches.filter(branch=>branch.isPrimary===true);
  return primary.length===1 && primary[0].active ? primary[0].id : '';
}
