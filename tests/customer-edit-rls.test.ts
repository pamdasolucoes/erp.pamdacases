import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('edicao oficial: PostgreSQL, RLS, transacao, imutabilidade e auditoria', async t => {
  const db = new PGlite();
  const admin = '00000000-0000-4000-8000-000000000001';
  const seller = '00000000-0000-4000-8000-000000000002';
  const inactive = '00000000-0000-4000-8000-000000000003';
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      GRANT USAGE ON SCHEMA auth TO authenticated;
      CREATE TABLE public.erp_user_profiles(user_id uuid PRIMARY KEY,username text,role text,active boolean,can_view_financial_metrics boolean);
      ALTER TABLE public.erp_user_profiles ENABLE ROW LEVEL SECURITY;
      GRANT SELECT ON public.erp_user_profiles TO authenticated;
      CREATE POLICY own_profile ON public.erp_user_profiles FOR SELECT TO authenticated USING(user_id=auth.uid());`);
    await db.exec(await readFile(new URL('./fixtures/official-schema.sql', import.meta.url), 'utf8'));
    await db.query(`INSERT INTO public.erp_user_profiles VALUES ($1,'admin','admin_gerencial',true,true),($2,'vendas','venda_atendimento',true,false),($3,'inativo','admin_gerencial',false,false)`, [admin, seller, inactive]);
    // Politicas de leitura atuais: a migration de edicao nao as substitui.
    await db.exec(`GRANT SELECT ON public.customers,public.customer_branches TO authenticated;
      CREATE POLICY customer_read ON public.customers FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.erp_user_profiles WHERE user_id=auth.uid() AND role='admin_gerencial' AND active));
      CREATE POLICY branch_read ON public.customer_branches FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.erp_user_profiles WHERE user_id=auth.uid() AND role='admin_gerencial' AND active));
      UPDATE public.customers SET notes='  preservar espacos  ',cpf_cnpj_original='documento legado sem formato',billing_mode=NULL WHERE customer_code='000001';`);
    const snapshot = async () => (await db.query(`SELECT (SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM customers c) AS customers,
      (SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM customer_branches b) AS branches,
      (SELECT jsonb_agg(to_jsonb(i) ORDER BY legacy_code) FROM pamda_clientes_importacao i) AS original`)).rows[0];
    const before = await snapshot();
    await db.exec(await readFile(new URL('../supabase/review/06_PAMDA_EDITAR_CLIENTES.sql', import.meta.url), 'utf8'));
    await t.test('aplicar a migration nao altera nenhum cadastro ou importacao', async () => assert.deepEqual(await snapshot(), before));
    async function asUser(id: string | null, sql: string, params: unknown[] = []) {
      await db.query(`SELECT set_config('request.jwt.claim.sub',$1,false)`, [id || '']);
      await db.exec(id ? 'SET ROLE authenticated' : 'SET ROLE anon');
      try { return await db.query<any>(sql, params); } finally { await db.exec('RESET ROLE'); }
    }
    const current = async () => (await db.query<any>(`SELECT to_jsonb(c) AS customer,to_jsonb(b) AS branch FROM customers c JOIN customer_branches b ON b.customer_id=c.id WHERE c.customer_code='000001'`)).rows[0];
    const save = async (id: string | null, row: any, changes: object, branches: unknown[] = []) =>
      asUser(id, 'SELECT public.pamda_update_customer($1,$2,$3,$4) AS result', [row.customer.id, row.customer.updated_at, JSON.stringify(changes), JSON.stringify(branches)]);
    await t.test('telefone persiste em nova leitura, campos intocados e codigos continuam exatos', async () => {
      const original = await current();
      const response = await save(admin, original, { phone: '(41) 99999-1234', email: null, cnpj: null });
      const saved = (await current()).customer;
      assert.equal(saved.phone, '(41) 99999-1234');
      assert.deepEqual(response.rows[0].result.customer, saved);
      for (const key of ['id','customer_code','notes','cpf_cnpj_original','billing_mode','created_at']) assert.equal(saved[key], original.customer[key]);
      assert.notEqual(saved.updated_at, original.customer.updated_at);
      assert.equal((await asUser(admin, 'SELECT phone FROM customers WHERE id=$1', [saved.id])).rows[0].phone, saved.phone);
    });
    await t.test('opcionais vazios sao validos, nome vazio e documento novo invalido sao rejeitados', async () => {
      await save(admin, await current(), { phone: '', contact_name: '', whatsapp_phone: null, cpf: null });
      assert.equal((await current()).customer.phone, '');
      await assert.rejects(save(admin, await current(), { name: ' ' }), /Nome obrigatorio/);
      await assert.rejects(save(admin, await current(), { cnpj: '123' }), /Documento invalido/);
      await assert.rejects(save(admin, await current(), { email: 'sem-arroba' }), /Email invalido/);
    });
    await t.test('endereco pode ser corrigido sem retirar revisao automaticamente', async () => {
      const row = await current();
      await save(admin, row, {}, [{ id: row.branch.id, expected_updated_at: row.branch.updated_at, changes: { address: 'Rua conferida', city: 'Curitiba', state: 'PR', zip_code: '80000-000', number: null }, confirm_address_reviewed: false }]);
      const saved = await current();
      assert.equal(saved.branch.address, 'Rua conferida');
      assert.equal(saved.branch.id, row.branch.id);
      assert.equal(saved.branch.customer_id, row.customer.id);
      assert.equal(saved.branch.address_needs_review, true);
      const branch = { id: saved.branch.id, expected_updated_at: saved.branch.updated_at, changes: { address_needs_review: false }, confirm_address_reviewed: false };
      await assert.rejects(save(admin, saved, {}, [branch]), /Confirme explicitamente/);
      await assert.rejects(asUser(admin, 'UPDATE customer_branches SET address_needs_review=false WHERE id=$1', [saved.branch.id]), /Confirme explicitamente/);
      await save(admin, saved, {}, [{ ...branch, confirm_address_reviewed: true }]);
      assert.equal((await current()).branch.address_needs_review, false);
    });
    await t.test('unidade de outro cliente desfaz toda a operacao, inclusive telefone e auditoria', async () => {
      const row = await current();
      const other = (await db.query<any>('SELECT * FROM customer_branches WHERE customer_id<>$1 LIMIT 1', [row.customer.id])).rows[0];
      const previousAudit = (await db.query('SELECT * FROM customer_change_audit')).rows;
      await assert.rejects(save(admin, row, { phone: 'nao deve persistir' }, [{ id: other.id, expected_updated_at: other.updated_at, changes: { address: 'nao persistir' } }]), /outro cliente/);
      assert.deepEqual(await current(), row);
      assert.deepEqual((await db.query('SELECT * FROM customer_change_audit')).rows, previousAudit);
    });
    await t.test('versao antiga impede sobrescrita concorrente', async () => {
      const row = await current();
      await save(admin, row, { phone: 'versao nova' });
      await assert.rejects(save(admin, row, { phone: 'versao antiga' }), /Cadastro alterado/);
      assert.equal((await current()).customer.phone, 'versao nova');
    });
    await t.test('anon, perfil inativo e vendedor nao podem editar nem ler dados restritos', async () => {
      for (const id of [null, seller, inactive]) {
        await assert.rejects(save(id, await current(), { phone: 'bloqueado' }), /permission denied|Sem permissao/);
        if (id) assert.equal((await asUser(id, 'SELECT * FROM customers')).rows.length, 0);
        else await assert.rejects(asUser(null, 'SELECT * FROM customers'), /permission denied/);
      }
    });
    await t.test('mesmo admin nao troca UUID, codigo, vinculos, origem nem politicas e nao cria/exclui', async () => {
      const row = await current();
      for (const key of ['customer_code','id','billing_mode','cpf_cnpj_original']) await assert.rejects(save(admin, row, { [key]: 'proibido' }), /Campo protegido/);
      for (const [table, key] of [['customers','customer_code'],['customers','id'],['customers','billing_mode'],['customer_branches','customer_id'],['customer_branches','import_source_customer_code']]) {
        await assert.rejects(asUser(admin, `UPDATE public.${table} SET ${key}=${key}`), /permission denied/);
      }
      await assert.rejects(asUser(admin, `INSERT INTO customers(customer_code,name) VALUES('novo','novo')`), /permission denied/);
      await assert.rejects(asUser(admin, 'DELETE FROM customers'), /permission denied/);
      await assert.rejects(asUser(admin, 'DELETE FROM customer_branches'), /permission denied/);
    });
    await t.test('auditoria registra ator e antes/depois, sem permitir adulteracao direta', async () => {
      const audit = (await asUser(admin, 'SELECT * FROM customer_change_audit ORDER BY changed_at')).rows;
      assert.ok(audit.length >= 4);
      assert.ok(audit.every(row => row.actor_id === admin && !row.changes.updated_at));
      assert.deepEqual(audit[0].changes.phone, { before: '', after: '(41) 99999-1234' });
      assert.equal((await asUser(seller, 'SELECT * FROM customer_change_audit')).rows.length, 0);
      await assert.rejects(asUser(admin, 'DELETE FROM customer_change_audit'), /permission denied/);
      const after = await snapshot() as any;
      assert.deepEqual(after.original, (before as any).original);
      assert.equal(after.customers.length, 384); assert.equal(after.branches.length, 384);
      assert.deepEqual(after.customers.map((row: any) => [row.id,row.customer_code]), (before as any).customers.map((row: any) => [row.id,row.customer_code]));
    });
  } finally { await db.close(); }
});
