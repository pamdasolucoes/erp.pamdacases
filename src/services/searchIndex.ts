import type { OfficialCustomer } from '../types/pamdaCore';
import type { OfficialProduct } from '../types/productCatalog';
export const normalizeSearch = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
export const compactSearch = (value: string) => normalizeSearch(value).replace(/[^a-z0-9]/g, '');
const customers = new WeakMap<OfficialCustomer, { fields: string[]; documents: string[] }>();
const products = new WeakMap<OfficialProduct, { fields: string[]; compact: string[]; rank: number }>();
// Canonical records are readonly. Replacing a record after a confirmed write builds a new index.
export function customerSearchIndex(customer: OfficialCustomer) {
  let index = customers.get(customer);
  if (!index) {
    index = { fields: [customer.customerCode, customer.name, customer.companyName || '', customer.cpf || '', customer.cnpj || '', customer.cpfCnpjOriginal || ''].map(normalizeSearch), documents: [customer.cpf, customer.cnpj, customer.cpfCnpjOriginal].filter((value): value is string => !!value).map(value => value.replace(/\D/g, '')) };
    customers.set(customer, index);
  }
  return index;
}
export function productSearchIndex(product: OfficialProduct) {
  let index = products.get(product);
  if (!index) {
    const fields = [product.name, product.modelPhone || '', product.sku, product.code].map(normalizeSearch);
    index = { fields, compact: fields.map(value => value.replace(/[^a-z0-9]/g, '')), rank: product.type === 'kit' ? 0 : product.type === 'fisico' && /tpu|transparen/.test(normalizeSearch(`${product.name} ${product.category}`)) ? 1 : 2 };
    products.set(product, index);
  }
  return index;
}
