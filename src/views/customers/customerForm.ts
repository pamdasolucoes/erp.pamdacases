import type { OfficialCustomer, CustomerChanges, BranchChanges, CustomerUpdate } from '../../types/pamdaCore';

export const customerFields = [
  ['name', 'Nome', false], ['companyName', 'Razão social', true], ['cpf', 'CPF', true], ['cnpj', 'CNPJ', true],
  ['phone', 'Telefone', false], ['whatsappPhone', 'WhatsApp', true], ['email', 'E-mail', true],
  ['contactName', 'Responsável / contato', false], ['notes', 'Observações', true],
] as const;
export const branchFields = [
  ['name', 'Nome da unidade', false], ['tradeName', 'Nome fantasia', true], ['address', 'Endereço', false],
  ['number', 'Número', true], ['complement', 'Complemento', true], ['neighborhood', 'Bairro', false],
  ['city', 'Cidade', false], ['state', 'Estado', false], ['zipCode', 'CEP', false],
  ['phone', 'Telefone da unidade', false], ['contactName', 'Contato da unidade', false], ['notes', 'Observações da unidade', true],
] as const;

type CustomerField = typeof customerFields[number][0];
type BranchField = typeof branchFields[number][0];
export interface CustomerForm {
  values: Record<CustomerField, string>;
  active: boolean;
  branches: { id: string; values: Record<BranchField, string>; active: boolean; confirmAddressReviewed: boolean }[];
}
export function createCustomerForm(customer: OfficialCustomer): CustomerForm {
  return {
    values: Object.fromEntries(customerFields.map(([key]) => [key, customer[key] ?? ''])) as CustomerForm['values'],
    active: customer.active,
    branches: customer.branches.map(branch => ({ id: branch.id, values: Object.fromEntries(branchFields.map(([key]) => [key, branch[key] ?? ''])) as CustomerForm['branches'][number]['values'], active: branch.active, confirmAddressReviewed: false })),
  };
}

export function buildCustomerUpdate(customer: OfficialCustomer, form: CustomerForm): CustomerUpdate {
  const original = createCustomerForm(customer);
  const changes: CustomerChanges = {};
  for (const [key, , nullable] of customerFields) {
    if (form.values[key] === original.values[key]) continue;
    const value = form.values[key].trim();
    Object.assign(changes, { [key]: nullable && !value ? null : value });
  }
  if (form.active !== customer.active) changes.active = form.active;
  const branches: CustomerUpdate['branches'][number][] = [];
  if (form.branches.length !== customer.branches.length || new Set(form.branches.map(branch => branch.id)).size !== form.branches.length) throw new Error('As unidades não correspondem ao cadastro original. Atualize a lista.');
  for (const draft of form.branches) {
    const branch = customer.branches.find(branch => branch.id === draft.id);
    const oldForm = original.branches.find(branch => branch.id === draft.id);
    if (!branch || !oldForm) throw new Error('Unidade não pertence ao cliente selecionado.');
    const changed: BranchChanges = {};
    for (const [key, , nullable] of branchFields) {
      if (draft.values[key] === oldForm.values[key]) continue;
      const value = draft.values[key].trim();
      Object.assign(changed, { [key]: nullable && !value ? null : value });
    }
    if (draft.active !== branch.active) changed.active = draft.active;
    if (draft.confirmAddressReviewed && branch.addressNeedsReview) {
      if (['address', 'city', 'state'].some(key => !draft.values[key as BranchField].trim())) throw new Error('Preencha endereço, cidade e estado antes de confirmar a revisão.');
      changed.addressNeedsReview = false;
    }
    if (Object.keys(changed).length) branches.push({ id: branch.id, expectedUpdatedAt: branch.updatedAt, changes: changed, confirmAddressReviewed: draft.confirmAddressReviewed });
  }
  return { id: customer.id, expectedCustomerCode: customer.customerCode, expectedUpdatedAt: customer.updatedAt, changes, branches };
}
