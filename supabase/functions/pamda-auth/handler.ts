import type { SupabaseClient } from '@supabase/supabase-js';

const ROLES = ['admin_gerencial', 'venda_atendimento', 'producao'];
const FIELDS = 'id,username,display_name,role,active,can_read_customers,can_view_financial_metrics,must_change_password,created_at';

export interface EmployeeRow {
  id: string;
  username: string;
  auth_email?: string;
  display_name: string;
  role: string;
  active: boolean;
  can_read_customers: boolean;
  can_view_financial_metrics: boolean;
  must_change_password: boolean;
  created_at: string;
}

export function publicEmployee(row: EmployeeRow) {
  return {
    id: row.id, username: row.username, name: row.display_name, role: row.role,
    active: row.active, canReadCustomers: row.can_read_customers,
    canViewFinancialMetrics: row.can_view_financial_metrics,
    mustChangePassword: row.must_change_password, createdAt: row.created_at,
  };
}

class RequestError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
function fail(status: number, message: string): never { throw new RequestError(status, message); }
const validPassword = (value: unknown): value is string => typeof value === 'string' && value.length >= 12 && value.length <= 128;

function employeeFields(body: Record<string, unknown>) {
  if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 100 ||
      typeof body.role !== 'string' || !ROLES.includes(body.role) ||
      typeof body.active !== 'boolean' || typeof body.canReadCustomers !== 'boolean' ||
      typeof body.canViewFinancialMetrics !== 'boolean') fail(400, 'Dados do funcionário inválidos.');
  if (body.role === 'producao' && (body.canReadCustomers || body.canViewFinancialMetrics)) {
    fail(400, 'Perfil de produção não pode receber acesso comercial ou financeiro.');
  }
  return {
    display_name: (body.name as string).trim(), role: body.role, active: body.active,
    can_read_customers: body.canReadCustomers, can_view_financial_metrics: body.canViewFinancialMetrics,
  };
}

export function createAuthHandler(options: {
  admin: SupabaseClient;
  createPasswordClient: () => SupabaseClient;
  allowedOrigins: string[];
}) {
  const { admin, createPasswordClient, allowedOrigins } = options;
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Origin',
      'Access-Control-Allow-Headers': 'authorization,x-client-info,apikey,content-type',
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
    };
    if (origin && allowedOrigins.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
    const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
    if (origin && !allowedOrigins.includes(origin)) return reply({ error: 'Origem não autorizada.' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reply({ error: 'Método não permitido.' }, 405);
    try {
      const raw = await request.text();
      if (raw.length > 16384) fail(413, 'Solicitação muito grande.');
      let body: Record<string, unknown>;
      try { body = JSON.parse(raw); } catch { return reply({ error: 'JSON inválido.' }, 400); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'Solicitação inválida.');

      if (body.action === 'login') {
        const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
        if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username) || typeof body.password !== 'string' ||
            !body.password || body.password.length > 128) fail(401, 'Usuário ou senha inválidos.');
        const throttle = await admin.rpc('pamda_take_login_attempt', { p_username: username });
        if (throttle.error) fail(503, 'Serviço de autenticação indisponível.');
        if (!throttle.data) fail(429, 'Muitas tentativas. Aguarde 15 minutos.');
        const found = await admin.from('erp_employees').select(`${FIELDS},auth_email`).eq('username', username).maybeSingle();
        if (found.error) fail(503, 'Serviço de autenticação indisponível.');
        const employee = found.data as EmployeeRow | null;
        // Até usuários desconhecidos passam pelo Auth, com a mesma resposta.
        // Esta identidade não é criada e não possui senha padrão.
        const email = employee?.auth_email || 'unregistered@auth.pamda.invalid';
        const passwordClient = createPasswordClient();
        const result = await passwordClient.auth.signInWithPassword({ email, password: body.password });
        if (result.error || !result.data.session || !employee?.active || !ROLES.includes(employee.role) ||
            result.data.user?.id !== employee.id) {
          if (result.data.session) await passwordClient.auth.signOut({ scope: 'local' });
          fail(401, 'Usuário ou senha inválidos.');
        }
        await admin.from('erp_login_attempts').delete().eq('username', username);
        return reply({
          session: { access_token: result.data.session.access_token, refresh_token: result.data.session.refresh_token },
          employee: publicEmployee(employee),
        });
      }

      const authorization = request.headers.get('authorization') || '';
      const token = authorization.match(/^Bearer (\S+)$/i)?.[1];
      if (!token) fail(401, 'Autenticação necessária.');
      const identity = await admin.auth.getUser(token);
      if (identity.error || !identity.data.user) fail(401, 'Sessão inválida.');
      // Ler claims somente depois de getUser validar o JWT no Auth. Conferir a
      // sessao no servidor bloqueia JWTs remanescentes de uma sessao encerrada.
      let sessionId: unknown;
      try { sessionId = JSON.parse(atob(token!.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).session_id; } catch {}
      if (typeof sessionId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) fail(401, 'Sessão inválida.');
      const sessionValid = await admin.rpc('pamda_employee_session_valid', { p_employee_id: identity.data.user.id, p_session_id: sessionId });
      if (sessionValid.error || sessionValid.data !== true) fail(401, 'Sessão encerrada. Entre novamente.');
      const actorResult = await admin.from('erp_employees').select(`${FIELDS},auth_email`).eq('id', identity.data.user.id).maybeSingle();
      if (actorResult.error) fail(503, 'Não foi possível validar as permissões.');
      const actor = actorResult.data as EmployeeRow | null;
      if (!actor?.active || !ROLES.includes(actor.role)) fail(403, 'Acesso não autorizado.');
      if (body.action === 'session') return reply({ employee: publicEmployee(actor) });

      if (body.action === 'change-password') {
        if (typeof body.currentPassword !== 'string' || !validPassword(body.newPassword) ||
            body.newPassword === body.currentPassword) fail(400, 'A nova senha deve ter de 12 a 128 caracteres e ser diferente da atual.');
        const passwordClient = createPasswordClient();
        const confirmation = await passwordClient.auth.signInWithPassword({ email: actor.auth_email!, password: body.currentPassword });
        if (confirmation.error || confirmation.data.user?.id !== actor.id) fail(401, 'Senha atual inválida.');
        try {
          const changed = await admin.auth.admin.updateUserById(actor.id, { password: body.newPassword });
          if (changed.error) fail(400, 'Não foi possível trocar a senha.');
          const updated = await admin.from('erp_employees').update({ must_change_password: false }).eq('id', actor.id);
          if (updated.error) fail(503, 'Senha alterada; liberação do perfil pendente. Contate o administrador.');
        } finally {
          await passwordClient.auth.signOut({ scope: 'local' });
        }
        const renewed = await createPasswordClient().auth.signInWithPassword({ email: actor.auth_email!, password: body.newPassword });
        if (renewed.error || !renewed.data.session) fail(503, 'Senha alterada. Entre novamente com a nova senha.');
        return reply({ session: { access_token: renewed.data.session.access_token, refresh_token: renewed.data.session.refresh_token } });
      }

      if (actor.role !== 'admin_gerencial' || actor.must_change_password) fail(403, 'Acesso exclusivo do administrador.');
      if (body.action === 'list-employees') {
        const employees: ReturnType<typeof publicEmployee>[] = [];
        let offset = 0;
        for (;;) {
          const result = await admin.from('erp_employees').select(FIELDS, { count: 'exact' }).order('id').range(offset, offset + 99);
          if (result.error || result.count === null) fail(503, 'Não foi possível listar funcionários.');
          const rows = result.data as EmployeeRow[];
          if (!rows.length && offset < result.count) fail(503, 'Listagem incompleta.');
          employees.push(...rows.map(publicEmployee));
          offset += rows.length;
          if (offset >= result.count) break;
        }
        return reply({ employees });
      }
      if (body.action === 'create-employee') {
        const fields = employeeFields(body);
        const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
        if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username) || !validPassword(body.password)) fail(400, 'Informe um usuário válido e senha com 12 a 128 caracteres.');
        const existing = await admin.from('erp_employees').select('id').eq('username', username).maybeSingle();
        if (existing.error) fail(503, 'Não foi possível conferir o usuário.');
        if (existing.data) fail(409, 'Nome de usuário já utilizado.');
        const authEmail = `${crypto.randomUUID()}@auth.pamda.invalid`;
        const created = await admin.auth.admin.createUser({ email: authEmail, password: body.password, email_confirm: true });
        if (created.error || !created.data.user) fail(400, 'Não foi possível criar a identidade de autenticação.');
        const saved = await admin.from('erp_employees').insert({ id: created.data.user.id, auth_email: authEmail, username, ...fields, must_change_password: true }).select(FIELDS).single();
        if (saved.error) {
          // Compensar apenas a identidade criada nesta solicitação.
          await admin.auth.admin.deleteUser(created.data.user.id);
          fail(409, 'Não foi possível cadastrar o funcionário.');
        }
        return reply({ employee: publicEmployee(saved.data as EmployeeRow) }, 201);
      }
      if (body.action === 'update-employee') {
        if (typeof body.id !== 'string') fail(400, 'Funcionário inválido.');
        const fields = employeeFields(body);
        const saved = await admin.from('erp_employees').update(fields).eq('id', body.id).select(FIELDS).maybeSingle();
        if (saved.error) fail(400, 'Não foi possível alterar o funcionário. Mantenha pelo menos um administrador ativo.');
        if (!saved.data) fail(404, 'Funcionário não encontrado.');
        return reply({ employee: publicEmployee(saved.data as EmployeeRow) });
      }
      if (body.action === 'reset-password') {
        if (typeof body.id !== 'string' || !validPassword(body.newPassword)) fail(400, 'Funcionário ou senha inválidos.');
        const target = await admin.from('erp_employees').select('id').eq('id', body.id).maybeSingle();
        if (target.error || !target.data) fail(404, 'Funcionário não encontrado.');
        // Bloquear dados antes de trocar a senha; falhas permanecem bloqueadas.
        const locked = await admin.from('erp_employees').update({ must_change_password: true }).eq('id', body.id);
        if (locked.error) fail(503, 'Não foi possível iniciar a recuperação.');
        const changed = await admin.auth.admin.updateUserById(body.id, { password: body.newPassword });
        if (changed.error) fail(400, 'Não foi possível redefinir a senha.');
        return reply({ success: true });
      }
      fail(400, 'Ação inválida.');
    } catch (error) {
      return reply({ error: error instanceof RequestError ? error.message : 'Serviço indisponível.' }, error instanceof RequestError ? error.status : 503);
    }
  };
}
