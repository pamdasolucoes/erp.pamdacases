import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CustomerRow, CustomerBranchRow } from '../src/types/pamdaCore';
import { CustomersService } from '../src/services/customers';
import { mapCustomerCatalog, mapCustomer, searchCustomers } from '../src/services/customerMapping';
import { readAllPages } from '../src/services/readPages';

const uuid = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
function customer(index: number, overrides: Partial<CustomerRow> = {}): CustomerRow {
  return { id: uuid(index), customer_code: String(index).padStart(6, '0'), name: `Cliente ${index}`, company_name: null, cnpj: null, cpf: null, cpf_cnpj_original: null, state_registration: null, legacy_person_type: null, phone: '', mobile_phone: null, whatsapp_phone: null, email: null, contact_name: '', reference_name: null, reference_phone: null, legacy_registered_on: null, legacy_last_purchase_on: null, legacy_registered_raw: null, legacy_last_purchase_raw: null, notes: null, active: true, is_chain: false, customer_kind: 'a_classificar', billing_mode: null, created_at: '2026-10-14T12:00:00Z', updated_at: '2026-10-14T12:00:00Z', ...overrides };
}
function branch(index: number, overrides: Partial<CustomerBranchRow> = {}): CustomerBranchRow {
  return { id: uuid(1000 + index), customer_id: uuid(index), name: 'Unidade do cadastro original', trade_name: null, address: '', number: null, complement: null, neighborhood: '', city: '', state: '', zip_code: '', phone: '', contact_name: '', notes: null, active: true, address_needs_review: index <= 111, import_source_customer_code: String(index).padStart(6, '0'), created_at: '2026-10-14T12:00:00Z', updated_at: '2026-10-14T12:00:00Z', ...overrides };
}
function backend(options: { maxRows?: number; authenticated?: boolean; permitted?: boolean; denied?: boolean; empty?: boolean } = {}) {
  const customers = options.empty ? [] : Array.from({ length: 384 }, (_, i) => customer(i + 1));
  const branches = options.empty ? [] : Array.from({ length: 384 }, (_, i) => branch(i + 1));
  const calls: { table: string; columns: string; from: number; to: number }[] = [];
  const client = {
    auth: { async getUser() { return { data: { user: options.authenticated === false ? null : { id: 'employee-id' } }, error: null }; } },
    from(table: string) {
      let columns = ''; let from = 0; let to = 0;
      const request = {
        select(value: string, config: object) { columns = value; assert.deepEqual(config, { count: 'exact' }); return request; },
        order(value: string) { assert.equal(value, 'id'); return request; },
        range(start: number, end: number) { from = start; to = end; return request; },
        abortSignal() { return request; },
        then(resolve: (value: unknown) => void) {
          calls.push({ table, columns, from, to });
          const rows = table === 'customers' ? customers : branches;
          const denied = options.denied || options.permitted === false;
          resolve({ data: denied ? null : rows.slice(from, Math.min(to + 1, from + (options.maxRows || 100))), count: rows.length, error: denied ? { code: '42501' } : null });
        },
      };
      return request;
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}
test('lê 384 clientes e 384 unidades, incluindo os 111 sinalizadores', async () => {
  const fake = backend();
  const result = await new CustomersService(fake.client).list();
  assert.equal(result.length, 384);
  assert.equal(result.flatMap(row => row.branches).length, 384);
  assert.equal(result.flatMap(row => row.branches).filter(row => row.addressNeedsReview).length, 111);
  assert.equal(result[0].customerCode, '000001');
  assert.equal(result[383].customerCode, '000384');
  assert.equal(fake.calls.filter(call => call.table === 'customers').length, 4);
  assert.ok(fake.calls.every(call => !call.columns.includes('*')));
});
test('não trunca páginas quando max_rows do servidor é menor que 100', async () => {
  const fake = backend({ maxRows: 37 });
  assert.equal((await new CustomersService(fake.client).list()).length, 384);
  const pages = fake.calls.filter(call => call.table === 'customers');
  assert.equal(pages[1].from, 37);
  assert.equal(pages[pages.length - 1].from, 370);
});

test('consulta solicita sempre a matriz oficial is_primary, sem opt-in',async()=>{
  const current=backend();await new CustomersService(current.client).list();
  assert.ok(current.calls.filter(call=>call.table==='customer_branches').every(call=>call.columns.endsWith(',is_primary')));
});

test('UUIDs, códigos com zeros e espaços são preservados sem conversão numérica', () => {
  const row = customer(1, { customer_code: ' 000012-A ' });
  const mapped = mapCustomer(row, []);
  assert.equal(mapped.id, row.id);
  assert.equal(mapped.customerCode, ' 000012-A ');
  assert.throws(() => mapCustomer({ ...row, customer_code: 12 } as unknown as CustomerRow, []), /TEXT/);
});
test('não atribui condições comerciais, prazos nem limites', () => {
  const result = mapCustomer(customer(1), []);
  assert.equal(result.paymentPolicy, null);
  assert.equal(result.billingMode, null);
  assert.equal('creditLimit' in result, false);
  assert.equal('paymentTermDays' in result, false);
});
test('relaciona unidades exclusivamente pela FK sem agrupar nomes iguais', () => {
  const result = mapCustomerCatalog([customer(1, { name: 'Mesma loja' }), customer(2, { name: 'Mesma loja' })], [branch(1), branch(2)]);
  assert.equal(result.length, 2);
  assert.equal(result[0].branches[0].id, uuid(1001));
  assert.equal(result[1].branches[0].id, uuid(1002));
});
test('busca por código, nome e razão social, sem diferenciar acentos ou caixa', () => {
  const result = mapCustomerCatalog([customer(1, { name: 'João Comércio', company_name: 'Empresa Curitiba' }), customer(2)], []);
  assert.equal(searchCustomers(result, '000001')[0].id, uuid(1));
  assert.equal(searchCustomers(result, 'JOAO')[0].id, uuid(1));
  assert.equal(searchCustomers(result, 'curitiba')[0].id, uuid(1));
  assert.equal(searchCustomers(result, 'ausente').length, 0);
});
test('sem sessão não consulta as tabelas comerciais', async () => {
  const fake = backend({ authenticated: false });
  await assert.rejects(new CustomersService(fake.client).list(), /Sessão inválida/);
  assert.equal(fake.calls.length, 0);
});
test('RLS bloqueia a leitura sem usar armazenamento local ou clientes de demonstração', async () => {
  await assert.rejects(new CustomersService(backend({ denied: true }).client).list(), /política RLS.*erp_user_profiles/);
  await assert.rejects(new CustomersService(backend({ permitted: false }).client).list(), /política RLS/);
  assert.deepEqual(await new CustomersService(backend({ empty: true }).client).list(), []);
});
test('cancelamento descarta leitura e paginação não devolve lista parcial', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(new CustomersService(backend().client).list(controller.signal), /abort/i);
  await assert.rejects(readAllPages(async () => ({ rows: [], total: 384 })), /incompleta/);
});
test('mudanças de contagem e duplicatas falham para evitar resultados incorretos', async () => {
  let calls = 0;
  await assert.rejects(readAllPages(async () => ({ rows: [++calls], total: calls === 1 ? 2 : 3 }), 1), /mudou/);
  assert.throws(() => mapCustomerCatalog([customer(1), customer(1)], []), /repetido/);
  assert.throws(() => mapCustomerCatalog([customer(1)], [branch(1), branch(1)]), /repetida/);
});
test('novas leituras refletem o servidor sem usar catálogo persistido', async () => {
  const first = await new CustomersService(backend().client).list();
  const second = await new CustomersService(backend({ empty: true }).client).list();
  assert.equal(first.length, 384);
  assert.equal(second.length, 0);
});
