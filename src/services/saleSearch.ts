import type { OfficialCustomer } from '../types/pamdaCore';
import type { OfficialProduct } from '../types/productCatalog';
import { searchCustomers } from './customerMapping';
import { normalizeSearch as normalize, compactSearch as compact, productSearchIndex } from './searchIndex';

const collator = new Intl.Collator('pt-BR', { numeric: true });
export function searchSaleCustomers(customers: readonly OfficialCustomer[], query: string): readonly OfficialCustomer[] {
  const value = query.trim();
  if (!/^\d+$/.test(value)) return searchCustomers(customers, value);
  const exact = customers.filter(customer => customer.customerCode.trim() === value);
  return exact.length ? exact : customers.filter(customer => customer.customerCode.trim().startsWith(value));
}
export function searchSaleProducts(products: readonly OfficialProduct[], query: string): readonly OfficialProduct[] {
  products = products.filter(product => product.active);
  const value = query.trim(); const numeric = /^\d+$/.test(value);
  const exact = numeric ? products.filter(product => product.code.trim() === value) : [];
  const tokens = normalize(value).split(/\s+/).filter(Boolean);
  const compactValue = compact(value);
  const matched = exact.length ? exact : products.filter(product => {
    if (!value) return true;
    if (numeric) return product.code.trim().startsWith(value);
    const index = productSearchIndex(product);
    return index.fields.some(field => tokens.every(token => field.includes(token))) || index.compact.some(field => field.includes(compactValue));
  });
  return [...matched].sort((left, right) => productSearchIndex(left).rank - productSearchIndex(right).rank || collator.compare(left.name, right.name) || left.id.localeCompare(right.id));
}
