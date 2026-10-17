import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAuthHandler, type EmployeeRow } from '../supabase/functions/pamda-auth/handler';

const employee = (overrides: Partial<EmployeeRow> = {}): EmployeeRow => ({ id: 'employee-id', username: 'operador', auth_email: 'private@auth.pamda.invalid', display_name: 'Funcionário', role: 'venda_atendimento', active: true, can_read_customers: true, can_view_financial_metrics: false, must_change_password: false, created_at: '2026-10-14T12:00:00Z', ...overrides });
const validToken = `test.${Buffer.from(JSON.stringify({ session_id: '00000000-0000-4000-8000-000000000001' })).toString('base64url')}.test`;
function backend(row: EmployeeRow | null = employee()) {
  const calls = { auth: [] as unknown[], mutations: [] as unknown[] };
  let passwordOk = true;
  let throttled = false;
  const admin = {
    auth: { async getUser(token: string) { return { data: { user: token === validToken ? { id: 'employee-id', user_metadata: { role: 'admin_gerencial' } } : null }, error: null }; } },
    async rpc() { return { data: !throttled, error: null }; },
    from(table: string) {
      const query = {
        select() { return query; }, eq() { return query; },
        delete() { calls.mutations.push({ table, operation: 'delete' }); return query; },
        async maybeSingle() { return { data: row, error: null }; },
        then(resolve: (value: unknown) => void) { resolve({ data: null, error: null }); },
      };
      return query;
    },
  } as unknown as SupabaseClient;
  const createPasswordClient = () => ({ auth: {
    async signInWithPassword(credentials: unknown) {
      calls.auth.push(credentials);
      return { data: { user: passwordOk ? { id: 'employee-id' } : null, session: passwordOk ? { access_token: 'test-access-token', refresh_token: 'test-refresh-token' } : null }, error: passwordOk ? null : new Error('Invalid') };
    }, async signOut() { return { error: null }; },
  } } as unknown as SupabaseClient);
  const handle = createAuthHandler({ admin, createPasswordClient, allowedOrigins: ['https://erp.example'] });
  const request = (body: object, token?: string, origin = 'https://erp.example') => handle(new Request('https://function.example', { method: 'POST', headers: { origin, ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }));
  return { calls, request, setPasswordOk: (value: boolean) => { passwordOk = value; }, setThrottled: () => { throttled = true; } };
}
test('login resolve identidade no servidor e omite e-mail no retorno', async () => {
  const fake = backend();
  const response = await fake.request({ action: 'login', username: ' OPERADOR ', password: ' senha original ' });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.employee.username, 'operador');
  assert.equal(body.session.access_token, 'test-access-token');
  assert.equal(JSON.stringify(body).includes('auth.pamda.invalid'), false);
  assert.deepEqual(fake.calls.auth, [{ email: 'private@auth.pamda.invalid', password: ' senha original ' }]);
});
test('senha inválida, usuário desconhecido e inativo recebem resposta uniforme', async () => {
  const wrong = backend(); wrong.setPasswordOk(false);
  const responses = await Promise.all([wrong, backend(employee({ active: false })), backend(null)].map(fake => fake.request({ action: 'login', username: 'operador', password: 'senha' })));
  for (const response of responses) { assert.equal(response.status, 401); assert.deepEqual(await response.json(), { error: 'Usuário ou senha inválidos.' }); }
});
test('limitação de tentativas interrompe autenticação', async () => {
  const fake = backend(); fake.setThrottled();
  assert.equal((await fake.request({ action: 'login', username: 'operador', password: 'senha' })).status, 429);
  assert.equal(fake.calls.auth.length, 0);
});
test('ações privadas sem JWT válido são bloqueadas', async () => {
  const fake = backend();
  for (const action of ['session', 'list-employees', 'create-employee', 'update-employee', 'reset-password']) {
    assert.equal((await fake.request({ action })).status, 401);
    assert.equal((await fake.request({ action }, 'invalid-token')).status, 401);
  }
});
test('admin vem do funcionário atual, ignorando requisição e metadata', async () => {
  const fake = backend();
  for (const action of ['list-employees', 'create-employee', 'update-employee', 'reset-password'])
    assert.equal((await fake.request({ action, role: 'admin_gerencial', active: true }, validToken)).status, 403);
  assert.equal(fake.calls.mutations.length, 0);
});
test('sessão revalida inativação no backend', async () => {
  assert.equal((await backend(employee({ active: false })).request({ action: 'session' }, validToken)).status, 403);
});
test('troca obrigatória impede administração', async () => {
  const fake = backend(employee({ role: 'admin_gerencial', must_change_password: true }));
  assert.equal((await fake.request({ action: 'create-employee' }, validToken)).status, 403);
  assert.equal(fake.calls.mutations.length, 0);
});
test('origem desconhecida é bloqueada mesmo no login', async () => {
  const fake = backend();
  assert.equal((await fake.request({ action: 'login', username: 'operador', password: 'senha' }, undefined, 'https://other.example')).status, 403);
  assert.equal(fake.calls.auth.length, 0);
});
