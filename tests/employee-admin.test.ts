import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAuthHandler, type EmployeeRow } from '../supabase/functions/pamda-auth/handler';

const actorId = '00000000-0000-4000-8000-000000000001';
const createdId = '00000000-0000-4000-8000-000000000002';
const token = `test.${Buffer.from(JSON.stringify({ session_id: '00000000-0000-4001-8000-000000000001' })).toString('base64url')}.test`;
function fixture() {
  const rows = new Map<string, EmployeeRow>([[actorId, { id: actorId, username: 'admin.real', display_name: 'Administrador', auth_email: 'internal@auth.pamda.invalid', role: 'admin_gerencial', active: true, can_read_customers: true, can_view_financial_metrics: true, must_change_password: false, created_at: '2026-10-14T12:00:00Z' }]]);
  const calls = { creates: [] as Record<string, unknown>[], passwords: [] as { id: string; password: string }[], deletes: [] as string[], tables: [] as string[], signIns: [] as unknown[] };
  let insertFails = false;
  const admin = {
    auth: {
      async getUser(value: string) { return { data: { user: value === token ? { id: actorId } : null }, error: null }; },
      admin: {
        async createUser(input: Record<string, unknown>) { calls.creates.push(input); return { data: { user: { id: createdId } }, error: null }; },
        async deleteUser(id: string) { calls.deletes.push(id); return { error: null }; },
        async updateUserById(id: string, input: { password: string }) { calls.passwords.push({ id, password: input.password }); return { error: null }; },
      },
    },
    async rpc() { return { data: true, error: null }; },
    from(table: string) {
      calls.tables.push(table);
      let field = 'id'; let value: unknown; let insert: Partial<EmployeeRow> | null = null; let update: Partial<EmployeeRow> | null = null;
      function execute() {
        if (insert) {
          if (insertFails) return { data: null, error: new Error('insert failed') };
          const saved = { ...insert, created_at: '2026-10-14T12:00:00Z' } as EmployeeRow;
          rows.set(saved.id, saved); return { data: saved, error: null };
        }
        const row = [...rows.values()].find(row => row[field as keyof EmployeeRow] === value);
        if (row && update) Object.assign(row, update);
        return { data: row || null, error: null };
      }
      const query = {
        select() { return query; }, eq(key: string, filter: unknown) { field = key; value = filter; return query; },
        insert(input: Partial<EmployeeRow>) { insert = input; return query; }, update(input: Partial<EmployeeRow>) { update = input; return query; },
        async maybeSingle() { return execute(); }, async single() { return execute(); },
        then(resolve: (value: unknown) => void) { resolve(execute()); },
      };
      return query;
    },
  } as unknown as SupabaseClient;
  const handler = createAuthHandler({ admin, allowedOrigins: ['https://erp.example'], createPasswordClient: () => ({ auth: {
    async signInWithPassword(input: { password: string }) { calls.signIns.push(input); return { data: { user: { id: actorId }, session: { access_token: 'new-access', refresh_token: 'new-refresh' } }, error: input.password === 'wrong' ? new Error('wrong') : null }; },
    async signOut() { return { error: null }; },
  } } as unknown as SupabaseClient) });
  const request = (body: object) => handler(new Request('https://function.example', { method: 'POST', headers: { origin: 'https://erp.example', authorization: `Bearer ${token}` }, body: JSON.stringify(body) }));
  return { calls, rows, request, failInsert: () => { insertFails = true; } };
}
const input = { username: 'novo.funcionario', name: 'Funcionário', password: 'senha-temporaria-unica', role: 'venda_atendimento', active: true, canReadCustomers: true, canViewFinancialMetrics: false };

test('admin cria identidade Auth e perfil privado sem exibir e-mail técnico', async () => {
  const fake = fixture();
  const response = await fake.request({ action: 'create-employee', ...input });
  assert.equal(response.status, 201);
  assert.equal(fake.calls.creates.length, 1);
  assert.equal(fake.calls.creates[0].email_confirm, true);
  assert.equal(fake.rows.get(createdId)?.must_change_password, true);
  assert.equal(fake.rows.get(createdId)?.username, input.username);
  assert.equal(JSON.stringify(await response.json()).includes('auth.pamda.invalid'), false);
  assert.ok(fake.calls.tables.every(table => table === 'erp_employees'));
});
test('senha curta e privilégios incompatíveis com produção são rejeitados antes de criar identidade', async () => {
  const fake = fixture();
  assert.equal((await fake.request({ action: 'create-employee', ...input, password: 'curta' })).status, 400);
  assert.equal((await fake.request({ action: 'create-employee', ...input, role: 'producao' })).status, 400);
  assert.equal(fake.calls.creates.length, 0);
});
test('falha ao gravar funcionário compensa apenas a nova identidade desta requisição', async () => {
  const fake = fixture(); fake.failInsert();
  assert.equal((await fake.request({ action: 'create-employee', ...input })).status, 409);
  assert.deepEqual(fake.calls.deletes, [createdId]);
  assert.ok(fake.rows.has(actorId));
});
test('edição ignora campos privados e pode retirar permissão ou inativar funcionário', async () => {
  const fake = fixture();
  fake.rows.set(createdId, { ...fake.rows.get(actorId)!, id: createdId, username: 'funcionario', auth_email: 'staff@auth.pamda.invalid', role: 'venda_atendimento' });
  const response = await fake.request({ action: 'update-employee', id: createdId, ...input, active: false, canReadCustomers: false, auth_email: 'malicious@example', username: 'renomeado' });
  assert.equal(response.status, 200);
  assert.equal(fake.rows.get(createdId)?.auth_email, 'staff@auth.pamda.invalid');
  assert.equal(fake.rows.get(createdId)?.username, 'funcionario');
  assert.equal(fake.rows.get(createdId)?.active, false);
});
test('recuperação exige funcionário existente e impõe nova troca de senha', async () => {
  const fake = fixture();
  assert.equal((await fake.request({ action: 'reset-password', id: createdId, newPassword: 'senha-temporaria-unica' })).status, 404);
  assert.equal(fake.calls.passwords.length, 0);
  assert.equal((await fake.request({ action: 'reset-password', id: actorId, newPassword: 'senha-temporaria-unica' })).status, 200);
  assert.equal(fake.rows.get(actorId)?.must_change_password, true);
  assert.equal(fake.calls.passwords.length, 1);
});
test('troca pessoal verifica senha atual e retorna nova sessão', async () => {
  const fake = fixture();
  assert.equal((await fake.request({ action: 'change-password', currentPassword: 'wrong', newPassword: 'nova-senha-pessoal-unica' })).status, 401);
  assert.equal(fake.calls.passwords.length, 0);
  const response = await fake.request({ action: 'change-password', currentPassword: 'senha-atual', newPassword: 'nova-senha-pessoal-unica' });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { session: { access_token: 'new-access', refresh_token: 'new-refresh' } });
  assert.equal(fake.rows.get(actorId)?.must_change_password, false);
});
