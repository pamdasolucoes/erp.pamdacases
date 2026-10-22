import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { CustomerAdminService, type BranchRegistration } from '../src/services/customerAdmin';
import { PaymentsService, paymentCondition } from '../src/services/payments';
import { CoreService, UnconfirmedWriteError } from '../src/services/core';
import { mapCustomerCatalog } from '../src/services/customerMapping';
import { CoreAdminBackend } from './fixtures/coreAdminBackend';
import { customerRow, branchRow, uuid } from './fixtures/customerRows';

const userId = uuid(9000);
function setup() {
  let admin = true, identity = userId;
  const backend = new CoreAdminBackend([customerRow()], [branchRow(1, { is_primary: true })], () => admin);
  const requests: { path: string; method: string; args: any }[] = [];
  const client = createClient('https://synthetic.invalid', 'synthetic-public-key', { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (input, init) => {
    const url = new URL(String(input)), method = init?.method || 'GET', args = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ path: url.pathname, method, args });
    let result = backend.handle(url.pathname, url, args);
    if (!result && ['customers', 'customer_branches'].includes(url.pathname.split('/').pop()!)) {
      let rows: any[] = url.pathname.endsWith('/customers') ? backend.customers : backend.branches;
      for (const key of ['id', 'customer_id']) if (url.searchParams.has(key)) rows = rows.filter(row => row[key] === url.searchParams.get(key)!.slice(3));
      const from = Number(url.searchParams.get('offset') || 0), limit = Number(url.searchParams.get('limit') || 100);
      result = { body: rows.slice(from, from + limit), headers: { 'content-range': `${from}-${rows.length - 1}/${rows.length}` } };
    }
    if (result?.abort) throw new TypeError('Failed to fetch');
    return new Response(JSON.stringify(result?.body ?? { code: 'UNEXPECTED_ENDPOINT' }), { status: result?.status || (result ? 200 : 500), headers: { 'content-type': 'application/json', ...result?.headers } });
  } } });
  client.auth.getUser = async () => ({ data: { user: { id: identity } as any }, error: null });
  return { backend, requests, client, customers: new CustomerAdminService(client), payments: new PaymentsService(client), deny: () => { admin = false; }, changeUser: () => { identity = uuid(9001); }, customer: () => mapCustomerCatalog(backend.customers, backend.branches)[0] };
}
const input: BranchRegistration = { name: 'Unidade conferida', address: 'Rua real', number: '12', neighborhood: 'Centro', city: 'Curitiba', state: 'PR', zipCode: '80000-000', phone: '4199999999' };

test('cliente e matriz usam assinatura TABLE e preservam exatamente o código TEXT e UUIDs', async () => {
  const fake = setup(), code = ' 000040-A ';
  const saved = await fake.customers.createCustomer(userId, { ...input, customerCode: code });
  assert.equal(saved.customerCode, code); assert.equal(saved.branches.length, 1); assert.equal(saved.branches[0].isPrimary, true);
  assert.deepEqual(Object.keys(fake.backend.writes[0].args).sort(), ['p_codigo', 'p_nome', 'p_endereco', 'p_numero', 'p_bairro', 'p_cidade', 'p_estado', 'p_cep', 'p_telefone'].sort());
  assert.ok(fake.requests.filter(r => !r.path.includes('/rpc/')).every(r => r.method === 'GET'));
  await assert.rejects(() => fake.customers.createCustomer(userId, { ...input, customerCode: code }), /Já existe/);
  assert.equal(fake.backend.customers.length, 2);
});
test('filial é criada, editada e definida como matriz sem trocar FK ou código original', async () => {
  const fake = setup(); let customer = await fake.customers.createBranch(userId, fake.customer(), input);
  const branch = customer.branches.find(row => row.name === input.name)!;
  assert.equal(branch.customerId, customer.id); assert.equal(branch.isPrimary, false);
  assert.equal(customer.branches.find(row => row.id === uuid(1001))?.isPrimary, true);
  const creationReads = fake.requests.filter(row => !row.path.includes('/rpc/'));
  assert.equal(creationReads.length, 2);
  customer = await fake.customers.updateBranch(userId, customer, branch, { ...input, phone: 'novo', number: '' });
  assert.equal(customer.branches.find(row => row.id === branch.id)?.phone, 'novo');
  customer = await fake.customers.setPrimary(userId, customer, branch.id);
  assert.deepEqual(customer.branches.filter(row => row.isPrimary).map(row => row.id), [branch.id]);
  assert.equal(customer.customerCode, '000001'); assert.equal(customer.id, uuid(1));
  await assert.rejects(() => fake.customers.updateBranch(userId, customer, branch, input), /foi alterada/);
});
test('filial exige os quatro campos do backend e não cria outro cliente', async () => {
  for (const key of ['name', 'address', 'city', 'state']) {
    const fake = setup(); await assert.rejects(() => fake.customers.createBranch(userId, fake.customer(), { ...input, [key]: ' ' }), /nome da filial/);
    assert.equal(fake.backend.writes.length, 0);
  }
});
test('RLS/autorização do backend e troca de identidade negam escritas sem sucesso local', async () => {
  const fake = setup(); fake.deny();
  await assert.rejects(() => fake.customers.createBranch(userId, fake.customer(), input), /permissão/);
  await assert.rejects(() => fake.payments.saveMethod(userId, { code: 'teste', name: 'Teste', active: true }), /permissão/);
  assert.equal(fake.backend.branches.length, 1);
  fake.changeUser(); const count = fake.requests.length;
  await assert.rejects(() => fake.customers.createCustomer(userId, { ...input, customerCode: '09' }), /sessão mudou/);
  assert.equal(fake.requests.length, count);
});
test('resposta perdida não repete criação sem idempotência nem fabrica confirmação', async () => {
  const fake = setup(); fake.backend.failure = 'lost';
  await assert.rejects(() => fake.customers.createCustomer(userId, { ...input, customerCode: '0030' }), UnconfirmedWriteError);
  assert.equal(fake.backend.writes.length, 1); assert.equal(fake.backend.customers.length, 2);
  fake.backend.failure = 'malformed';
  await assert.rejects(() => fake.customers.createBranch(userId, fake.customer(), input), UnconfirmedWriteError);
  assert.equal(fake.backend.writes.length, 2);
});
test('catálogos reais paginam, preservam NULL e não inventam condições; erro não vira fallback', async () => {
  const fake = setup();
  fake.backend.terms[0].due_days = null as any; fake.backend.terms[0].installments = null as any;
  const catalog = await fake.payments.catalog(userId);
  assert.equal(catalog.methods.length, 2); assert.equal(catalog.terms[0].dueDays, null);
  assert.equal(catalog.terms[0].installments, null);
  assert.equal(paymentCondition(catalog, null, null), '');
  assert.equal(paymentCondition(catalog, uuid(7101), uuid(7201)), 'PIX verificado · À vista verificado');
  assert.equal(paymentCondition(catalog, uuid(7500), null), 'Condição salva indisponível');
  assert.equal(paymentCondition(catalog, uuid(7102), null), 'Condição salva indisponível');
  fake.backend.failure = 'read'; await assert.rejects(() => fake.payments.catalog(userId), /permissões/);
});
test('configuração de cliente e filial usa parâmetros reais, relê e diferencia limite NULL de zero', async () => {
  const fake = setup(), settings = { methodId: uuid(7101), termId: uuid(7201), creditLimitCents: null, notes: null };
  assert.equal((await fake.payments.settings(userId, 'customer', uuid(1))).creditLimitCents, null);
  assert.deepEqual(await fake.payments.saveSettings(userId, 'customer', uuid(1), settings), settings);
  const zero = await fake.payments.saveSettings(userId, 'customer', uuid(1), { ...settings, creditLimitCents: 0 });
  assert.equal(zero.creditLimitCents, 0);
  await fake.payments.saveSettings(userId, 'branch', uuid(1001), { ...settings, termId: null });
  assert.deepEqual(fake.backend.writes.at(-1)?.args, { p_branch_id: uuid(1001), p_method_id: uuid(7101), p_term_id: null, p_notes: null });
  await assert.rejects(() => fake.payments.saveSettings(userId, 'customer', uuid(1), { ...settings, creditLimitCents: -1 }));
});
test('catálogos são salvos por código, retornam UUID e exigem leitura confirmada', async () => {
  const fake = setup();
  let catalog = await fake.payments.saveMethod(userId, { code: 'aprovado', name: 'Forma aprovada', active: true });
  assert.equal(catalog.methods.length, 3);
  catalog = await fake.payments.saveTerm(userId, { code: 'prazo_aprovado', name: 'Prazo aprovado', dueDays: 15, installments: 2, notes: 'Autorizado', active: true });
  assert.equal(catalog.terms[1].dueDays, 15);
  fake.backend.failure = 'malformed';
  await assert.rejects(() => fake.payments.saveMethod(userId, { code: 'aprovado', name: 'Inativa', active: false }), UnconfirmedWriteError);
});
test('resumo exige finance.read real além da própria filtragem financeira da RPC', async () => {
  const fake = setup(); let allow = false;
  fake.client.rpc = ((name: string) => Promise.resolve({ data: name === 'pamda_has_permission' ? allow : { as_of: '2026-10-19T12:00:00Z', confirmed_revenue_today: 123 }, error: null })) as any;
  const core = new CoreService(fake.client);
  assert.equal((await core.summary(userId)).confirmed_revenue_today, null);
  allow = true; assert.equal((await core.summary(userId)).confirmed_revenue_today, 12300);
});
