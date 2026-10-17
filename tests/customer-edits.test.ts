import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CustomersService } from '../src/services/customers';
import { toCustomerUpdateRpc, canEditCustomers } from '../src/services/customerEdits';
import { mapCustomerCatalog, searchCustomers } from '../src/services/customerMapping';
import { buildCustomerUpdate, createCustomerForm } from '../src/views/customers/customerForm';
import { customerRow, branchRow, uuid } from './fixtures/customerRows';

const original = () => mapCustomerCatalog([customerRow(1, { notes: '  legado  ', email: null, cpf: 'legado invalido' })], [branchRow(1)])[0];
test('formulario so envia diferencas e preserva nulos, espacos, documento legado e identificadores', () => {
  const customer = original(); const form = createCustomerForm(customer);
  assert.deepEqual(buildCustomerUpdate(customer, form).changes, {});
  form.values.phone = '(41) 99999-0000';
  const update = buildCustomerUpdate(customer, form);
  assert.deepEqual(update.changes, { phone: '(41) 99999-0000' });
  assert.deepEqual(toCustomerUpdateRpc(update), { p_customer_id: customer.id, p_expected_updated_at: customer.updatedAt, p_changes: { phone: '(41) 99999-0000' }, p_branches: [] });
});
test('opcionais podem ser limpos sem inventar valores', () => {
  const customer = original(); const form = createCustomerForm(customer);
  form.values.cpf = ''; form.values.notes = '';
  assert.deepEqual(buildCustomerUpdate(customer, form).changes, { cpf: null, notes: null });
});
test('campos protegidos, documentos e emails invalidos nao chegam ao servidor', () => {
  const update = buildCustomerUpdate(original(), createCustomerForm(original()));
  for (const changes of [{ customerCode: '2' }, { id: uuid(2) }, { paymentPolicy: {} }, { name: ' ' }, { cpf: '123' }, { cnpj: '123' }, { email: 'invalido' }]) {
    assert.throws(() => toCustomerUpdateRpc({ ...update, changes } as any));
  }
});
test('revisao exige confirmacao humana e endereco completo, sem mudanca automatica de flag', () => {
  const customer = original(); const form = createCustomerForm(customer);
  form.branches[0].values.address = 'Rua A';
  assert.deepEqual(buildCustomerUpdate(customer, form).branches[0].changes, { address: 'Rua A' });
  form.branches[0].confirmAddressReviewed = true;
  assert.throws(() => buildCustomerUpdate(customer, form), /Preencha/);
  Object.assign(form.branches[0].values, { city: 'Curitiba', state: 'PR', zipCode: '80000-000' });
  const update = buildCustomerUpdate(customer, form);
  assert.equal(toCustomerUpdateRpc(update).p_branches[0].changes.address_needs_review, false);
  assert.throws(() => toCustomerUpdateRpc({ ...update, branches: [{ ...update.branches[0], confirmAddressReviewed: false }] }), /Confirme/);
});
test('busca compartilhada encontra documentos com e sem mascara e nunca une clientes', () => {
  const rows = mapCustomerCatalog([customerRow(1, { cpf: '123.456.789-01', company_name: 'Razão Teste' }), customerRow(2, { cnpj: '12.345.678/0001-90' }), customerRow(3, { cpf_cnpj_original: '11.222.333/0001-44' })], []);
  for (const [query, id] of [['12345678901',uuid(1)],['12.345.678/0001-90',uuid(2)],['11222333000144',uuid(3)],['RAZAO',uuid(1)],['000001',uuid(1)]]) assert.equal(searchCustomers(rows,query)[0].id,id);
});
test('servico aceita somente resposta confirmada pelo banco e trata permissao, versao e rede', async () => {
  const row = customerRow(); const branch = branchRow();
  const update = { id: row.id, expectedUpdatedAt: row.updated_at, changes: { phone: 'novo' }, branches: [] };
  const fake = (data: unknown, error: unknown = null) => ({ auth: { getUser: async () => ({ data: { user: { id: uuid(9) } } }) }, rpc: async (name: string, payload: any) => { assert.equal(name,'pamda_update_customer'); assert.equal(payload.p_customer_id,row.id); return { data,error }; } }) as unknown as SupabaseClient;
  const confirmed = await new CustomersService(fake({ customer: { ...row, phone: 'confirmado' }, branches: [branch] })).update(update);
  assert.equal(confirmed.phone,'confirmado'); assert.equal(confirmed.customerCode,'000001');
  for (const [code,message] of [['42501',/permissão/],['40001',/outra pessoa/],['PGRST202',/configurada/],['fetch_error',/conexão/]] as const) await assert.rejects(new CustomersService(fake(null,{ code })).update(update),message);
  await assert.rejects(new CustomersService(fake({ customer: customerRow(2), branches: [] })).update(update),/esperado/);
  await assert.rejects(new CustomersService(null).update(update),/Configure/);
  assert.equal(canEditCustomers(null),false);
});
