import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { User } from '../src/types/erp';
import { AuthService, mapUserProfile } from '../src/services/authService';
import { canAccessTab } from '../src/services/access';
import { assertNoFrontendSecrets, readSupabaseConfig } from '../src/services/supabaseConfig';

const userId = '6c7da859-74cf-4718-88b7-e573617b8eb4';
const profile = (overrides: Record<string, unknown> = {}) => ({
  user_id: userId,
  username: 'admin',
  role: 'admin_gerencial',
  active: true,
  can_view_financial_metrics: true,
  ...overrides,
});

function fakeAuth(initialProfile: Record<string, unknown> | null = null, authenticated = initialProfile !== null) {
  let serverUser: { id: string; email: string; created_at: string } | null =
    authenticated ? { id: userId, email: 'admin@example.com', created_at: '2026-10-14T12:00:00Z' } : null;
  let currentProfile = initialProfile;
  let profileError: { code: string; message: string } | null = null;
  let callback: (event: string, session: unknown) => void = () => {};
  const calls = {
    getUser: 0,
    login: [] as unknown[],
    profile: [] as { table: string; columns: string; userId: string }[],
    signOut: [] as unknown[],
  };
  let getUser = async () => ({ data: { user: serverUser }, error: null });
  let login: () => Promise<unknown> = async () => {
    serverUser = { id: userId, email: 'admin@example.com', created_at: '2026-10-14T12:00:00Z' };
    callback('SIGNED_IN', { user: serverUser });
    return { data: { user: serverUser, session: { access_token: 'test-access-token' } }, error: null };
  };
  const client = {
    auth: {
      onAuthStateChange(cb: typeof callback) { callback = cb; return { data: { subscription: { unsubscribe() {} } } }; },
      getUser() { calls.getUser++; return getUser(); },
      signInWithPassword(credentials: unknown) { calls.login.push(credentials); return login(); },
      async signOut(options: unknown) { calls.signOut.push(options); serverUser = null; callback('SIGNED_OUT', null); return { error: null }; },
    },
    from(table: string) {
      let columns = '';
      let queriedUserId = '';
      const query = {
        select(value: string) { columns = value; return query; },
        retry(enabled:boolean) { assert.equal(enabled,false);return query; },
        eq(column: string, value: string) { assert.equal(column, 'user_id'); queriedUserId = value; return query; },
        async maybeSingle() {
          calls.profile.push({ table, columns, userId: queriedUserId });
          return { data: currentProfile, error: profileError };
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
  return {
    client, calls,
    setGetUser(fn: typeof getUser) { getUser = fn; },
    setLogin(fn: typeof login) { login = fn; },
    setProfile(value: Record<string, unknown> | null) { currentProfile = value; },
    setProfileError(value: { code: string; message: string } | null) { profileError = value; },
    emit(event: string, session: unknown) { callback(event, session); },
  };
}

test('sem configuração, não cria usuário ou administrador automático', async () => {
  const auth = new AuthService(null, 'Configuração ausente');
  await auth.initialize();
  assert.equal(auth.getCurrentUser(), null);
  assert.equal(auth.isLoading(), false);
  assert.deepEqual(await auth.login('admin@example.com', 'qualquer-senha'), { success: false, error: 'Configuração ausente' });
});

test('sessão ausente bloqueia clientes e telas administrativas', async () => {
  const auth = new AuthService(fakeAuth().client);
  await auth.initialize();
  assert.equal(auth.getCurrentUser(), null);
  assert.equal(canAccessTab(null, 'clientes'), false);
});

test('login autentica com e-mail e senha pelo Supabase Auth', async () => {
  const fake = fakeAuth();
  fake.setProfile(profile());
  const auth = new AuthService(fake.client);
  assert.deepEqual(await auth.login(' admin@example.com ', ' senha original '), { success: true });
  assert.deepEqual(fake.calls.login, [{ email: 'admin@example.com', password: ' senha original ' }]);
  assert.deepEqual(fake.calls.profile, [{
    table: 'erp_user_profiles',
    columns: 'user_id,username,role,active,can_view_financial_metrics',
    userId,
  }]);
  assert.equal(auth.getCurrentUser()?.username, 'admin');
});

test('sessão persistida restaura o usuário e consulta perfil por user_id', async () => {
  const fake = fakeAuth(profile());
  const auth = new AuthService(fake.client);
  await auth.initialize();
  assert.equal(auth.getCurrentUser()?.id, userId);
  assert.equal(auth.getCurrentUser()?.canViewFinancialMetrics, true);
  assert.equal(fake.calls.login.length, 0);
  assert.equal(fake.calls.profile[0].userId, userId);
});

test('perfil ausente, inativo ou de outra identidade não autoriza o ERP', async () => {
  const absent = new AuthService(fakeAuth(null, true).client);
  await absent.initialize();
  assert.equal(absent.getCurrentUser(), null);
  assert.match(absent.getError() || '', /não retornou uma linha.*RLS pode ocultar/i);

  const inactive = new AuthService(fakeAuth(profile({ active: false })).client);
  await inactive.initialize();
  assert.equal(inactive.getCurrentUser(), null);
  assert.match(inactive.getError() || '', /está inativo/);

  const unknownRole = new AuthService(fakeAuth(profile({ role: 'admin' })).client);
  await unknownRole.initialize();
  assert.equal(unknownRole.getCurrentUser(), null);
  assert.match(unknownRole.getError() || '', /role "admin" não é reconhecido/);

  assert.equal(mapUserProfile(userId, profile({ user_id: 'different-user' }) as never), null);
  assert.equal(mapUserProfile(userId, profile({ role: 'superuser' }) as never), null);
});

test('erro RLS do perfil informa a política necessária sem conceder acesso', async () => {
  const fake = fakeAuth(profile());
  fake.setProfileError({ code: '42501', message: 'permission denied' });
  const auth = new AuthService(fake.client);
  await auth.initialize();
  assert.equal(auth.getCurrentUser(), null);
  assert.match(auth.getError() || '', /SELECT.*user_id = auth\.uid\(\)/);
});

test('permissões vêm da linha do perfil e não de metadata do Auth', async () => {
  const auth = new AuthService(fakeAuth(profile({ can_view_financial_metrics: false })).client);
  await auth.initialize();
  assert.equal(auth.isAdminGerencial(), true);
  assert.equal(auth.canViewFinancialMetrics(), false);
  assert.equal(auth.canReadCustomers(), true);
  assert.equal(canAccessTab(auth.getCurrentUser(), 'clientes'), true);
  assert.equal(canAccessTab(auth.getCurrentUser(), 'usuarios'), true);
});

test('perfil sem acesso comercial não recebe acesso à lista de clientes', () => {
  const user = mapUserProfile(userId, profile({ role: 'venda_atendimento' }) as never);
  assert.equal(user?.canReadCustomers, false);
  assert.equal(canAccessTab(user, 'clientes'), false);
});

test('logout encerra a sessão local persistida', async () => {
  const fake = fakeAuth(profile());
  const auth = new AuthService(fake.client);
  await auth.initialize();
  await auth.logout();
  assert.equal(auth.getCurrentUser(), null);
  assert.deepEqual(fake.calls.signOut, [{ scope: 'local' }]);
});

test('logout aguarda autenticação pendente e impede a restauração da sessão', async () => {
  const fake = fakeAuth();
  let finish!: (value: unknown) => void;
  fake.setLogin(() => new Promise(resolve => { finish = resolve; }));
  const auth = new AuthService(fake.client);
  const loggingIn = auth.login('admin@example.com', 'senha');
  await new Promise(resolve => setTimeout(resolve, 0));
  const loggingOut = auth.logout();
  assert.equal(fake.calls.signOut.length, 0);
  finish({ data: { user: { id: userId, email: 'admin@example.com', created_at: '' }, session: { access_token: 'test' } }, error: null });
  assert.equal((await loggingIn).success, false);
  await loggingOut;
  assert.equal(auth.getCurrentUser(), null);
  assert.equal(fake.calls.signOut.length, 1);
});

test('SIGNED_OUT remove o acesso ativo', async () => {
  const fake = fakeAuth(profile());
  const auth = new AuthService(fake.client);
  await auth.initialize();
  fake.emit('SIGNED_OUT', null);
  assert.equal(auth.getCurrentUser(), null);
  assert.equal(auth.canReadCustomers(), false);
});

test('renovação e SIGNED_IN repetido revalidam perfil sem publicar usuário nulo',async()=>{
  const fake=fakeAuth(profile()); const auth=new AuthService(fake.client);
  await auth.initialize();
  const states:(string|null)[]=[]; auth.subscribe(user=>states.push(user?.id||null));
  for(const event of ['TOKEN_REFRESHED','SIGNED_IN','USER_UPDATED']){
    fake.emit(event,{user:{id:userId}});
    assert.equal(auth.getCurrentUser()?.id,userId);
    await new Promise(resolve=>setTimeout(resolve,5));
  }
  assert.ok(states.every(id=>id===userId)); assert.equal(fake.calls.profile.length,4);
});

test('contexto validado em memória sobrevive HMR, mas a nova instância revalida o perfil',async()=>{
  const fake=fakeAuth(profile());const original=new AuthService(fake.client);await original.initialize();
  const replacement=new AuthService(fake.client,null,original.getCurrentUser());original.dispose();
  assert.equal(replacement.getCurrentUser()?.id,userId);
  fake.setProfile(profile({active:false}));await replacement.initialize();
  assert.equal(replacement.getCurrentUser(),null);
});

test('erro transitório mantém contexto bloqueável e retry valida novamente; perfil negado encerra acesso',async()=>{
  const fake=fakeAuth(profile()); const auth=new AuthService(fake.client); await auth.initialize();
  fake.setProfileError({code:'',message:'Failed to fetch'}); await auth.refresh();
  assert.equal(auth.getCurrentUser()?.id,userId); assert.ok(auth.getError());
  fake.setProfileError(null); await auth.refresh(); assert.equal(auth.getError(),null);
  fake.setProfile(profile({active:false})); await auth.refresh(); assert.equal(auth.getCurrentUser(),null);
});

test('evento de outra identidade bloqueia imediatamente e logout vence validação pendente',async()=>{
  const fake=fakeAuth(profile()); const auth=new AuthService(fake.client); await auth.initialize();
  fake.emit('SIGNED_IN',{user:{id:'other'}}); assert.equal(auth.getCurrentUser(),null);
  await new Promise(resolve=>setTimeout(resolve,5)); assert.equal(auth.getCurrentUser(),null);
  const second=fakeAuth(profile()); const service=new AuthService(second.client); await service.initialize();
  let finish!:(value:any)=>void;
  second.setGetUser(()=>new Promise(resolve=>{finish=resolve;}));
  const refreshing=service.refresh(); second.emit('SIGNED_OUT',null);
  finish({data:{user:{id:userId,created_at:'',email:''}},error:null}); await refreshing;
  assert.equal(service.getCurrentUser(),null);
});

test('configuração rejeita chaves privadas, HTTP e variáveis ausentes', () => {
  const base = { VITE_SUPABASE_URL: 'https://example.supabase.co' };
  const jwt = (role: string) => 'header.' + Buffer.from(JSON.stringify({ role })).toString('base64url') + '.signature';
  assert.throws(() => readSupabaseConfig({}), /Configure/);
  assert.throws(() => readSupabaseConfig({ ...base, VITE_SUPABASE_ANON_KEY: jwt('service_role') }), /pública/);
  assert.throws(() => readSupabaseConfig({ ...base, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_private' }), /privadas/);
  assert.throws(() => readSupabaseConfig({ ...base, VITE_SUPABASE_URL: 'http://example.supabase.co', VITE_SUPABASE_ANON_KEY: jwt('anon') }), /HTTPS/);
  assert.throws(() => readSupabaseConfig({ ...base, VITE_SUPABASE_ANON_KEY: 'invalid' }), /inválida/);
  assert.equal(readSupabaseConfig({ ...base, VITE_SUPABASE_ANON_KEY: jwt('anon') }).url, base.VITE_SUPABASE_URL);
});

test('pré-validação do Vite bloqueia credenciais privadas antes de gerar o bundle', () => {
  const key = 'header.' + Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url') + '.signature';
  assert.throws(() => assertNoFrontendSecrets({ VITE_SUPABASE_ANON_KEY: key }), /Credencial privada/);
  assert.throws(() => assertNoFrontendSecrets({ VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_test' }), /Credencial privada/);
  assert.throws(() => assertNoFrontendSecrets({ VITE_REFRESH_TOKEN: 'test-token' }), /Credencial privada/);
  assert.throws(() => assertNoFrontendSecrets({ VITE_SUPABASE_URL: 'https://user:password@example.supabase.co' }), /credenciais/);
  assert.doesNotThrow(() => assertNoFrontendSecrets({ SUPABASE_SERVICE_ROLE_KEY: key, VITE_DEFAULT_PIX_KEY: 'example@pix.example', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' }));
});
