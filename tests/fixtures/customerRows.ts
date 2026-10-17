import type { CustomerRow, CustomerBranchRow } from '../../src/types/pamdaCore';
export const uuid = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
export function customerRow(index = 1, overrides: Partial<CustomerRow> = {}): CustomerRow {
  return { id: uuid(index), customer_code: String(index).padStart(6, '0'), name: `Cliente ${index}`, company_name: null, cnpj: null, cpf: null, cpf_cnpj_original: null, state_registration: null, legacy_person_type: null, phone: '', mobile_phone: null, whatsapp_phone: null, email: null, contact_name: '', reference_name: null, reference_phone: null, legacy_registered_on: null, legacy_last_purchase_on: null, legacy_registered_raw: null, legacy_last_purchase_raw: null, notes: null, active: true, is_chain: false, customer_kind: 'a_classificar', billing_mode: null, created_at: '2026-10-14T12:00:00Z', updated_at: '2026-10-14T12:00:00Z', ...overrides };
}
export function branchRow(index = 1, overrides: Partial<CustomerBranchRow> = {}): CustomerBranchRow {
  return { id: uuid(1000 + index), customer_id: uuid(index), name: 'Unidade do cadastro original', trade_name: null, address: '', number: null, complement: null, neighborhood: '', city: '', state: '', zip_code: '', phone: '', contact_name: '', notes: null, active: true, address_needs_review: index <= 111, import_source_customer_code: String(index).padStart(6, '0'), created_at: '2026-10-14T12:00:00Z', updated_at: '2026-10-14T12:00:00Z', ...overrides };
}
