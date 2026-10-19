import type { CustomerRow, CustomerBranchRow, OfficialCustomer, OfficialCustomerBranch } from '../types/pamdaCore';
import { dbCents } from './pendingSaleMapping';
import { normalizeSearch, customerSearchIndex } from './searchIndex';

export function mapBranch(row: CustomerBranchRow): OfficialCustomerBranch {
  if (typeof row.id !== 'string' || typeof row.customer_id !== 'string' || typeof row.address_needs_review !== 'boolean') {
    throw new Error('Schema de unidades incompatível com a migration oficial.');
  }
  return {
    id: row.id, customerId: row.customer_id, name: row.name, tradeName: row.trade_name,
    address: row.address, number: row.number, complement: row.complement, neighborhood: row.neighborhood,
    city: row.city, state: row.state, zipCode: row.zip_code, phone: row.phone, contactName: row.contact_name,
    notes: row.notes, active: row.active, addressNeedsReview: row.address_needs_review,
    importSourceCustomerCode: row.import_source_customer_code, createdAt: row.created_at, updatedAt: row.updated_at,
    isPrimary: typeof row.is_primary === 'boolean' ? row.is_primary : null,
    shippingFeeOverrideCents: row.shipping_fee_override == null ? null : dbCents(row.shipping_fee_override),
  };
}

export function mapCustomer(row: CustomerRow, branches: readonly OfficialCustomerBranch[]): OfficialCustomer {
  if (typeof row.id !== 'string' || typeof row.customer_code !== 'string' || !row.customer_code.trim() || typeof row.name !== 'string') {
    throw new Error('Schema de clientes incompatível com a migration oficial. customer_code deve ser TEXT.');
  }
  return {
    id: row.id, customerCode: row.customer_code, name: row.name, companyName: row.company_name,
    cnpj: row.cnpj, cpf: row.cpf, cpfCnpjOriginal: row.cpf_cnpj_original, stateRegistration: row.state_registration,
    legacyPersonType: row.legacy_person_type, phone: row.phone, mobilePhone: row.mobile_phone,
    whatsappPhone: row.whatsapp_phone, email: row.email, contactName: row.contact_name,
    referenceName: row.reference_name, referencePhone: row.reference_phone,
    legacyRegisteredOn: row.legacy_registered_on, legacyLastPurchaseOn: row.legacy_last_purchase_on,
    legacyRegisteredRaw: row.legacy_registered_raw, legacyLastPurchaseRaw: row.legacy_last_purchase_raw,
    notes: row.notes, active: row.active, isChain: row.is_chain, customerKind: row.customer_kind,
    billingMode: row.billing_mode, paymentPolicy: null,
    defaultFreight: { status: 'available', amountCents: row.default_shipping_fee == null ? null : dbCents(row.default_shipping_fee) },
    branches, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export function mapCustomerCatalog(customers: CustomerRow[], units: CustomerBranchRow[]): OfficialCustomer[] {
  const ids = new Set<string>();
  const codes = new Set<string>();
  const unitIds = new Set<string>();
  const branchesByCustomer = new Map<string, OfficialCustomerBranch[]>();
  for (const unit of units) {
    if (unitIds.has(unit.id)) throw new Error('Unidade repetida na paginação. Atualize a lista.');
    unitIds.add(unit.id);
    const branch = mapBranch(unit);
    const branches = branchesByCustomer.get(branch.customerId) || [];
    branches.push(branch);
    branchesByCustomer.set(branch.customerId, branches);
  }
  return customers.map(row => {
    if (ids.has(row.id) || codes.has(row.customer_code)) throw new Error('Cliente repetido na paginação. Atualize a lista.');
    ids.add(row.id);
    codes.add(row.customer_code);
    // Relacao exclusivamente pelo UUID/FK existente. Nunca agrupar por nome,
    // documento, codigo de importacao ou enderecos semelhantes.
    return mapCustomer(row, branchesByCustomer.get(row.id) || []);
  });
}

export function searchCustomers(customers: readonly OfficialCustomer[], query: string): readonly OfficialCustomer[] {
  const search = normalizeSearch(query.trim());
  if (!search) return customers;
  const documentSearch = query.replace(/\D/g, '');
  return customers.filter(customer => {
    const index = customerSearchIndex(customer);
    const textMatch = index.fields.some(value => value.includes(search));
    const documentMatch = /^[\d.\s/()-]+$/.test(query) && !!documentSearch &&
      index.documents.some(value => value.includes(documentSearch));
    return textMatch || documentMatch;
  });
}
