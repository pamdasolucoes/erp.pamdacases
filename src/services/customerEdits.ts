import type { CustomerUpdate } from '../types/pamdaCore';
import type { User } from '../types/erp';

const customerFields = {
  name: 'name', companyName: 'company_name', cnpj: 'cnpj', cpf: 'cpf', phone: 'phone',
  whatsappPhone: 'whatsapp_phone', email: 'email', contactName: 'contact_name', notes: 'notes', active: 'active',
};
const branchFields = {
  name: 'name', tradeName: 'trade_name', address: 'address', number: 'number', complement: 'complement',
  neighborhood: 'neighborhood', city: 'city', state: 'state', zipCode: 'zip_code', phone: 'phone',
  contactName: 'contact_name', notes: 'notes', active: 'active', addressNeedsReview: 'address_needs_review',
};
export const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const canEditCustomers = (user: User | null): boolean => !!user?.active && user.role === 'admin_gerencial' && user.canReadCustomers === true;

function mapChanges(changes: object, fields: Record<string, string>, nullable: string[]) {
  const mapped: Record<string, string | boolean | null> = {};
  for (const [key, value] of Object.entries(changes)) {
    if (!Object.hasOwn(fields, key)) throw new Error('A alteração contém um campo protegido ou não autorizado.');
    if (key === 'active' || key === 'addressNeedsReview') {
      if (typeof value !== 'boolean') throw new Error('Situação inválida.');
    } else {
      if (value === null && nullable.includes(key)) { mapped[fields[key]] = null; continue; }
      if (typeof value !== 'string' || value.length > 10000) throw new Error('Campo cadastral inválido.');
      if (key === 'name' && !value.trim()) throw new Error('O nome é obrigatório.');
      if (key === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error('Informe um e-mail válido ou deixe o campo vazio.');
      if ((key === 'cpf' || key === 'cnpj') && value &&
          (!/^[\d.\s/-]+$/.test(value) || value.replace(/\D/g, '').length !== (key === 'cpf' ? 11 : 14))) {
        throw new Error(`Informe um ${key.toUpperCase()} válido ou deixe o campo vazio.`);
      }
    }
    mapped[fields[key]] = value;
  }
  return mapped;
}

export function toCustomerUpdateRpc(update: CustomerUpdate) {
  if (!isUuid(update.id) || !update.expectedUpdatedAt || !Number.isFinite(Date.parse(update.expectedUpdatedAt))) throw new Error('Cliente ou versão inválida. Atualize a lista.');
  const seen = new Set<string>();
  return {
    p_customer_id: update.id,
    p_expected_updated_at: update.expectedUpdatedAt,
    p_changes: mapChanges(update.changes, customerFields, ['companyName', 'cnpj', 'cpf', 'whatsappPhone', 'email', 'notes']),
    p_branches: update.branches.map(branch => {
      if (!isUuid(branch.id) || seen.has(branch.id) || !branch.expectedUpdatedAt || !Number.isFinite(Date.parse(branch.expectedUpdatedAt))) throw new Error('Unidade ou versão inválida. Atualize a lista.');
      seen.add(branch.id);
      if (branch.changes.addressNeedsReview === false && branch.confirmAddressReviewed !== true) throw new Error('Confirme a conferência do endereço antes de marcá-lo como revisado.');
      return {
        id: branch.id, expected_updated_at: branch.expectedUpdatedAt,
        changes: mapChanges(branch.changes, branchFields, ['tradeName', 'number', 'complement', 'notes']),
        confirm_address_reviewed: branch.confirmAddressReviewed === true,
      };
    }),
  };
}
