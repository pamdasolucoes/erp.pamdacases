import type { OfficialCustomer } from '../types/pamdaCore';
import type { OfficialProduct } from '../types/productCatalog';
import { searchCustomers } from './customerMapping';

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
const compact = (value: string) => normalize(value).replace(/[^a-z0-9]/g, '');
export function searchSaleCustomers(customers: readonly OfficialCustomer[], query: string): readonly OfficialCustomer[] {
  const value = query.trim();
  if (!/^\d+$/.test(value)) return searchCustomers(customers, value);
  const exact = customers.filter(customer => customer.customerCode.trim() === value);
  return exact.length ? exact : customers.filter(customer => customer.customerCode.trim().startsWith(value));
}
export function searchSaleProducts(products: readonly OfficialProduct[], query: string): readonly OfficialProduct[] {
  const value = query.trim(); const numeric = /^\d+$/.test(value);
  const exact = numeric ? products.filter(product => product.code.trim() === value) : [];
  const tokens = normalize(value).split(/\s+/).filter(Boolean);
  const matched = exact.length ? exact : products.filter(product => {
    if (!value) return true;
    if (numeric) return product.code.trim().startsWith(value);
    const fields = [product.name, product.modelPhone || '', product.sku, product.code];
    return fields.some(field => tokens.every(token => normalize(field).includes(token))) || fields.some(field => compact(field).includes(compact(value)));
  });
  const group = (product: OfficialProduct) => product.type === 'kit' ? 0 : product.type === 'fisico' && /tpu|transparen/.test(normalize(`${product.name} ${product.category}`)) ? 1 : 2;
  return [...matched].sort((left, right) => group(left) - group(right) || left.name.localeCompare(right.name, 'pt-BR', { numeric: true }) || left.id.localeCompare(right.id));
}
