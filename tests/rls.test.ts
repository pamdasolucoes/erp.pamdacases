import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

// PostgreSQL WASM somente em RAM, com dados sinteticos. Sem URL ou chaves reais.
test('migrations incrementais e RLS protegem cadastros oficiais e identidades', async t => {
  const db = new PGlite();
  const ids = { admin: '00000000-0000-4000-8000-000000000001', sales: '00000000-0000-4000-8000-000000000002', production: '00000000-0000-4000-8000-000000000003', denied: '00000000-0000-4000-8000-000000000004' };
  const sessionId = (id: string) => id.replace('4000', '4001');
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY);
      CREATE TABLE auth.sessions (id uuid PRIMARY KEY, user_id uuid REFERENCES auth.users(id));
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
      GRANT USAGE ON SCHEMA auth TO authenticated;
      GRANT EXECUTE ON FUNCTION auth.uid(), auth.jwt() TO authenticated;`);
    await db.exec(await readFile(new URL('./fixtures/official-schema.sql', import.meta.url), 'utf8'));
    const snapshot = async () => (await db.query(`SELECT
      (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.customers c) AS customers,
      (SELECT jsonb_agg(to_jsonb(b) ORDER BY b.id) FROM public.customer_branches b) AS branches,
      (SELECT jsonb_agg(to_jsonb(i) ORDER BY i.legacy_code) FROM public.pamda_clientes_importacao i) AS original`)).rows[0];
    const before = await snapshot();
    await db.exec(await readFile(new URL('../supabase/review/04_PAMDA_FUNCIONARIOS_AUTH.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../supabase/review/05_PAMDA_CLIENTES_SOMENTE_LEITURA.sql', import.meta.url), 'utf8'));
    for (const id of Object.values(ids)) {
      await db.query('INSERT INTO auth.users VALUES ($1)', [id]);
      await db.query('INSERT INTO auth.sessions VALUES ($1,$2)', [sessionId(id), id]);
    }
    await db.query(`SELECT public.pamda_bootstrap_admin($1,'primeiro.admin','internal@auth.pamda.invalid','Administrador')`, [ids.admin]);
    await db.query(`UPDATE public.erp_employees SET must_change_password=false WHERE id=$1`, [ids.admin]);
    for (const [name, role, permitted] of [['sales', 'venda_atendimento', true], ['production', 'producao', false], ['denied', 'venda_atendimento', false]] as const) {
      await db.query(`INSERT INTO public.erp_employees (id,username,auth_email,display_name,role,active,can_read_customers,must_change_password) VALUES ($1,$2,$3,$2,$4,true,$5,false)`, [ids[name], name, name + '@auth.pamda.invalid', role, permitted]);
    }
    async function asUser(id: string, sql: string) {
      await db.query(`SELECT set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claims',$2,false)`, [id, JSON.stringify({ sub: id, session_id: sessionId(id) })]);
      await db.exec('SET ROLE authenticated');
      try { return await db.query<{ count: number }>(sql); } finally { await db.exec('RESET ROLE'); }
    }
    await t.test('usuários autorizados veem todos os 384 clientes e unidades', async () => {
      for (const id of [ids.admin, ids.sales]) {
        assert.equal((await asUser(id, 'SELECT count(*)::int AS count FROM public.customers')).rows[0].count, 384);
        assert.equal((await asUser(id, 'SELECT count(*)::int AS count FROM public.customer_branches')).rows[0].count, 384);
      }
    });
    await t.test('anon não lê dados comerciais nem a associação privada', async () => {
      await db.exec('SET ROLE anon');
      try {
        for (const table of ['customers', 'customer_branches', 'erp_employees', 'erp_login_attempts']) await assert.rejects(db.query(`SELECT * FROM public.${table}`), /permission denied/);
      } finally { await db.exec('RESET ROLE'); }
    });
    await t.test('produção e funcionário sem permissão não veem informações comerciais', async () => {
      for (const id of [ids.production, ids.denied]) {
        assert.equal((await asUser(id, 'SELECT count(*)::int AS count FROM public.customers')).rows[0].count, 0);
        assert.equal((await asUser(id, 'SELECT count(*)::int AS count FROM public.customer_branches')).rows[0].count, 0);
      }
    });
    await t.test('até administrador autenticado não pode escrever clientes ou ler associação privada diretamente', async () => {
      await assert.rejects(asUser(ids.admin, 'SELECT * FROM public.erp_employees'), /permission denied/);
      await assert.rejects(asUser(ids.admin, `UPDATE public.customers SET name='alterado'`), /permission denied/);
      await assert.rejects(asUser(ids.admin, `INSERT INTO public.customers(customer_code,name) VALUES ('novo','novo')`), /permission denied/);
      await assert.rejects(asUser(ids.admin, 'DELETE FROM public.customer_branches'), /permission denied/);
    });
    await t.test('inativação e troca obrigatória retiram leitura imediatamente', async () => {
      await db.query('UPDATE public.erp_employees SET active=false WHERE id=$1', [ids.sales]);
      assert.equal((await asUser(ids.sales, 'SELECT count(*)::int AS count FROM public.customers')).rows[0].count, 0);
      await db.query('UPDATE public.erp_employees SET active=true,must_change_password=true WHERE id=$1', [ids.sales]);
      assert.equal((await asUser(ids.sales, 'SELECT count(*)::int AS count FROM public.customers')).rows[0].count, 0);
    });
    await t.test('sessão encerrada não acessa dados mesmo com JWT ainda não expirado', async () => {
      await db.query('UPDATE public.erp_employees SET must_change_password=false WHERE id=$1', [ids.sales]);
      await db.query('DELETE FROM auth.sessions WHERE user_id=$1', [ids.sales]);
      assert.equal((await asUser(ids.sales, 'SELECT count(*)::int AS count FROM public.customers')).rows[0].count, 0);
    });
    await t.test('bootstrap não pode ser repetido e último administrador permanece protegido', async () => {
      await assert.rejects(db.query(`SELECT public.pamda_bootstrap_admin($1,'outro.admin','another@auth.pamda.invalid','Outro')`, [ids.denied]), /primeiro funcionario/);
      await assert.rejects(db.query('UPDATE public.erp_employees SET active=false WHERE id=$1', [ids.admin]), /administrador ativo/);
      await assert.rejects(db.query('DELETE FROM public.erp_employees WHERE id=$1', [ids.admin]), /administrador ativo/);
    });
    await t.test('limitação de login é atômica e não é executável por anon', async () => {
      for (let i = 1; i <= 11; i++) assert.equal((await db.query<{ allowed: boolean }>(`SELECT public.pamda_take_login_attempt('teste.login') AS allowed`)).rows[0].allowed, i <= 10);
      await db.exec('SET ROLE anon');
      try { await assert.rejects(db.query(`SELECT public.pamda_take_login_attempt('teste.login')`), /permission denied/); }
      finally { await db.exec('RESET ROLE'); }
    });
    await t.test('clientes, UUIDs, códigos, unidades e importação não foram alterados', async () => {
      assert.deepEqual(await snapshot(), before);
      assert.equal((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM public.pamda_clientes_importacao')).rows[0].count, 384);
      assert.equal((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM public.customer_branches WHERE address_needs_review')).rows[0].count, 111);
      await assert.rejects(db.query(`UPDATE public.customers SET customer_code='renumerado' WHERE customer_code='000001'`), /imutavel/);
    });
  } finally { await db.close(); }
});
