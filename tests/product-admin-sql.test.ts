import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { officialCatalogFixture } from './fixtures/officialProducts';
import { uuid } from './fixtures/customerRows';

test('RPCs reais em PostgreSQL isolado: criação, autorização, concorrência e publicação', async t => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE TABLE public.erp_user_profiles(user_id uuid PRIMARY KEY,role text,active boolean);
      CREATE SEQUENCE public.pamda_codigo_produtos_seq START 1000;
      CREATE SEQUENCE public.pamda_codigo_especiais_seq START 10000;
      CREATE SEQUENCE public.pamda_codigo_servicos_seq START 90000;`);
    await db.exec(await readFile(new URL('./fixtures/product-admin-schema.sql', import.meta.url), 'utf8'));
    const functions = await readFile(new URL('./fixtures/product-admin-functions.sql', import.meta.url), 'utf8');
    // SQL-language authorization helper must exist before PL/pgSQL bodies are used.
    const blocks = functions.split(/(?=CREATE OR REPLACE FUNCTION)/).filter(s => s.trim());
    for (const block of [...blocks.filter(s => s.includes('FUNCTION public.pamda_is_admin()')), ...blocks.filter(s => !s.includes('FUNCTION public.pamda_is_admin()'))]) await db.exec(block);
    await db.exec(await readFile(new URL('../supabase/review/11_PRODUTOS_ADMIN_SEGURO.sql', import.meta.url), 'utf8'));
    const privileges = (await db.query<any>(`SELECT
      has_function_privilege('authenticated','public.pamda_admin_produto_acao(uuid,text,timestamptz,jsonb,text)','EXECUTE') AS rpc,
      has_function_privilege('anon','public.pamda_admin_produto_acao(uuid,text,timestamptz,jsonb,text)','EXECUTE') AS anon_rpc,
      has_function_privilege('authenticated','private.pamda_admin_produto_acao_impl(uuid,text,timestamptz,jsonb,text)','EXECUTE') AS private_rpc,
      has_schema_privilege('authenticated','private','USAGE') AS private_schema`)).rows[0];
    assert.deepEqual(privileges, { rpc: true, anon_rpc: false, private_rpc: false, private_schema: false });
    const admin = uuid(9000), employee = uuid(9001), inactive = uuid(9002);
    await db.query(`INSERT INTO auth.users VALUES($1),($2),($3)`, [admin, employee, inactive]);
    await db.query(`INSERT INTO erp_user_profiles VALUES($1,'admin_gerencial',true),($2,'venda_atendimento',true),($3,'admin_gerencial',false)`, [admin, employee, inactive]);
    const fixture = officialCatalogFixture();
    fixture.products.find(p => p.type === 'servico')!.sku = 'SRV-DTF-UV';
    for (const row of fixture.products) {
      const keys = Object.keys(row); await db.query(`INSERT INTO products(${keys.join(',')}) VALUES(${keys.map((_, i) => `$${i + 1}`).join(',')})`, Object.values(row));
    }
    for (const row of fixture.components) {
      const keys = Object.keys(row); await db.query(`INSERT INTO kit_components(${keys.join(',')}) VALUES(${keys.map((_, i) => `$${i + 1}`).join(',')})`, Object.values(row));
    }
    const snapshot = async () => (await db.query(`SELECT to_jsonb(p) as row FROM products p WHERE id=ANY($1::uuid[]) ORDER BY id`, [fixture.products.map(p => p.id)])).rows;
    const before = await snapshot();
    const linksBefore = (await db.query('SELECT * FROM kit_components ORDER BY id')).rows;
    async function asUser(id: string | null, sql: string, args: unknown[] = []) {
      await db.query(`SELECT set_config('request.jwt.claim.sub',$1,false)`, [id ?? '']);
      await db.exec('SET ROLE authenticated');
      try { return await db.query<any>(sql, args); } finally { await db.exec('RESET ROLE'); }
    }
    const create = (id: string | null, sku: string) => asUser(id, `SELECT public.pamda_admin_criar_capa_com_kit('Modelo isolado','Marca isolada',$1,12,30,NULL,NULL,NULL) AS result`, [sku]);
    let created: any;
    const action = (id: string, actionName: string, version: string, data: object, reason = 'Motivo isolado para ação', actor = admin) =>
      asUser(actor, 'SELECT public.pamda_admin_produto_acao($1,$2,$3,$4::jsonb,$5)', [id, actionName, version, JSON.stringify(data), reason]);
    const versionOf = async (id: string) => (await db.query<any>('SELECT updated_at::text AS version FROM products WHERE id=$1', [id])).rows[0].version as string;
    const archiveData = async (id: string) => ({ confirm_sku: (await db.query<any>('SELECT sku FROM products WHERE id=$1', [id])).rows[0].sku });
    const protectedState = async () => (await db.query(`SELECT
      (SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM products p) AS products,
      (SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM erp_panda_ia_phone_models m) AS models,
      (SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM erp_product_admin_audit a) AS audit`)).rows;
    const blockedWithoutChanges = async (attempt: () => Promise<unknown>, message: RegExp) => {
      const before = await protectedState(); await assert.rejects(attempt(), message); assert.deepEqual(await protectedState(), before);
    };
    await t.test('funcionário, inativo e sessão ausente bloqueados sem consumir sequência', async () => {
      for (const id of [employee, inactive, null]) await assert.rejects(create(id, 'TEST-UNAUTHORIZED'), /administrador/);
      assert.equal((await db.query<any>('SELECT is_called FROM pamda_codigo_produtos_seq')).rows[0].is_called, false);
    });
    await t.test('capa+kit atômico: código servidor, dois componentes, NULL, estoque e auditoria', async () => {
      created = (await create(admin, 'TEST-ISOLATED')).rows[0].result;
      assert.equal(created.case_code, '1000'); assert.equal(created.kit_code, '21000');
      const rows = (await db.query<any>('SELECT * FROM products WHERE id=ANY($1::uuid[]) ORDER BY code', [[created.case_id, created.kit_id]])).rows;
      for (const row of rows) { assert.equal(row.current_inventory, '0'); assert.equal(row.stock_verified, false); assert.equal(row.current_cost, null); assert.equal(row.managerial_cost, null); }
      const components = (await db.query<any>('SELECT * FROM kit_components WHERE kit_product_id=$1 ORDER BY sort_order', [created.kit_id])).rows;
      assert.equal(components.length, 2); assert.equal(components[0].component_product_id, created.case_id);
      assert.equal(components[1].component_product_id, fixture.products.find(p => p.sku === 'SRV-DTF-UV')!.id);
      assert.ok(components.every(c => Number(c.quantity) === 1));
      assert.equal((await db.query<any>('SELECT published FROM erp_panda_ia_phone_models WHERE kit_product_id=$1', [created.kit_id])).rows[0].published, false);
      assert.equal((await db.query('SELECT * FROM erp_product_admin_audit')).rows.length, 2);
    });
    await t.test('SKU duplicado rejeitado sem novos produtos', async () => {
      await assert.rejects(create(admin, 'test-isolated'), /SKU.*existe/);
      assert.equal((await db.query<any>('SELECT count(*)::integer AS count FROM products')).rows[0].count, 639);
    });
    await t.test('servidor rejeita SKU arbitrário do kit e alteração independente mesmo sem a interface', async () => {
      await blockedWithoutChanges(async () => action(created.case_id, 'alterar_sku', await versionOf(created.case_id), {
        sku: 'CASE-ATTACK', linked_sku: 'ARBITRARY-KIT', linked_product_id: created.kit_id,
        expected_linked_updated_at: await versionOf(created.kit_id),
      }), /SKU do kit deve ser KIT-/);
      for (const id of [created.kit_id, fixture.products.find(p => p.type === 'kit')!.id]) {
        await blockedWithoutChanges(async () => action(id, 'alterar_sku', await versionOf(id), { sku: 'INDEPENDENT-KIT' }), /pela capa vinculada.*especiais/);
      }
    });
    await t.test('kits especiais, composição divergente e SKU incoerente ficam bloqueados para revisão', async () => {
      const rename = async () => action(created.case_id, 'alterar_sku', await versionOf(created.case_id), {
        sku: 'CASE-SPECIAL', linked_product_id: created.kit_id, expected_linked_updated_at: await versionOf(created.kit_id),
      });
      await db.query("UPDATE products SET sku='KIT-ESPECIAL' WHERE id=$1", [created.kit_id]);
      await blockedWithoutChanges(rename, /especial ou incoerente.*revisão/);
      await db.query('UPDATE products SET sku=$2 WHERE id=$1', [created.kit_id, created.kit_sku]);
      await db.query('UPDATE kit_components SET quantity=2 WHERE kit_product_id=$1 AND component_product_id=$2', [created.kit_id, created.case_id]);
      await blockedWithoutChanges(rename, /especial ou incoerente.*revisão/);
      await db.query('UPDATE kit_components SET quantity=1 WHERE kit_product_id=$1 AND component_product_id=$2', [created.kit_id, created.case_id]);
      const service = fixture.products.find(p => p.sku === 'SRV-DTF-UV')!;
      await db.query("UPDATE products SET sku='SRV-ESPECIAL' WHERE id=$1", [service.id]);
      await blockedWithoutChanges(rename, /especial ou incoerente.*revisão/);
      await db.query("UPDATE products SET sku='SRV-DTF-UV' WHERE id=$1", [service.id]);
      await db.query("UPDATE products SET sku='CAP-MAGSAFE' WHERE id=$1", [created.case_id]);
      await db.query("UPDATE products SET sku='KIT-CAP-MAGSAFE' WHERE id=$1", [created.kit_id]);
      await blockedWithoutChanges(rename, /especial ou incoerente.*revisão/);
      await db.query('UPDATE products SET sku=$2 WHERE id=$1', [created.case_id, created.case_sku]);
      await db.query('UPDATE products SET sku=$2 WHERE id=$1', [created.kit_id, created.kit_sku]);
    });
    await t.test('edição exige motivo, impede campos protegidos e rejeita versão antiga', async () => {
      const row = (await db.query<any>('SELECT updated_at::text AS version FROM products WHERE id=$1', [created.case_id])).rows[0];
      const edit = (changes: object, reason = 'Correção isolada', actor = admin) => asUser(actor, 'SELECT pamda_admin_editar_produto($1,$2,$3,$4)', [created.case_id, row.version, JSON.stringify(changes), reason]);
      for (const key of ['id','code','sku','type','current_inventory','active','components']) await assert.rejects(edit({ [key]: 'não permitido' }), /não editável/);
      await assert.rejects(edit({ name: 'Novo nome' }, ''), /obrigatórios/);
      await assert.rejects(edit({ sale_price: -1 }), /Custos e preço não podem ser negativos/);
      await assert.rejects(edit({ image_url: 'javascript:alert(1)' }), /URL HTTPS/);
      await assert.rejects(edit({ name: 'Alteração por vendedor' }, 'Correção isolada', employee), /42501|administrador/);
      await assert.rejects(edit({ name: 'Alteração por admin inativo' }, 'Correção isolada', inactive), /42501|administrador/);
      await edit({ name: 'Nome corrigido', description: 'Descrição corrigida', category: 'Categoria teste',
        brand: 'Marca teste', model_phone: 'Modelo teste', sale_price: 35, image_url: 'https://assets.invalid/product.png' });
      await assert.rejects(edit({ name: 'Versão obsoleta' }), /outra sessão/);
      const edited = (await db.query<any>('SELECT * FROM products WHERE id=$1', [created.case_id])).rows[0];
      assert.equal(edited.name, 'Nome corrigido'); assert.equal(edited.description, 'Descrição corrigida'); assert.equal(edited.category, 'Categoria teste');
      assert.equal(edited.brand, 'Marca teste'); assert.equal(edited.model_phone, 'Modelo teste'); assert.equal(Number(edited.sale_price), 35);
      assert.equal(edited.image_url, 'https://assets.invalid/product.png'); assert.equal(edited.current_cost, null); assert.equal(edited.managerial_cost, null);
      const audit = (await db.query<any>("SELECT actor_user_id,reason,before_data,after_data,occurred_at FROM erp_product_admin_audit WHERE product_id=$1 AND action='editar_produto'", [created.case_id])).rows[0];
      assert.equal(audit.actor_user_id, admin); assert.equal(audit.reason, 'Correção isolada'); assert.ok(audit.occurred_at); assert.equal(audit.before_data.name, 'Capa TPU transparente - Modelo isolado'); assert.equal(audit.after_data.name, 'Nome corrigido');
      const currentVersion = await versionOf(created.case_id);
      await asUser(admin, 'SELECT pamda_admin_editar_produto($1,$2,$3,$4)', [created.case_id, currentVersion, JSON.stringify({ current_cost: 2.5, managerial_cost: 3 }), 'Custos revisados']);
      const costs = (await db.query<any>('SELECT current_cost,managerial_cost FROM products WHERE id=$1', [created.case_id])).rows[0];
      assert.equal(Number(costs.current_cost), 2.5); assert.equal(Number(costs.managerial_cost), 3);
    });
    await t.test('SKU único inclusive arquivados: capa e kit vinculados mudam juntos e são auditados', async () => {
      const archivedId = uuid(9003);
      await db.query(`INSERT INTO products(id,code,sku,name,type,active) VALUES($1,'9003','ARCHIVED-UNIQUE','Produto arquivado sintético','fisico',false)`, [archivedId]);
      const linkedVersion = await versionOf(created.kit_id);
      await assert.rejects(action(created.case_id, 'alterar_sku', await versionOf(created.case_id), {
        sku: 'archived-unique', linked_sku: 'KIT-ARCHIVED-UNIQUE', linked_product_id: created.kit_id,
        expected_linked_updated_at: linkedVersion,
      }), /já existe, inclusive em produto arquivado/);
      await assert.rejects(action(created.case_id, 'alterar_sku', await versionOf(created.case_id), {
        sku: 'UNAUTHORIZED-SKU', linked_sku: 'KIT-UNAUTHORIZED', linked_product_id: created.kit_id,
        expected_linked_updated_at: linkedVersion,
      }, 'Motivo autorizado', employee), /42501|administrador/);
      await assert.rejects(action(created.case_id, 'alterar_sku', await versionOf(created.case_id), {
        sku: 'UNAUTHORIZED-SKU', linked_sku: 'KIT-UNAUTHORIZED', linked_product_id: created.kit_id,
        expected_linked_updated_at: linkedVersion,
      }, 'Motivo autorizado', inactive), /42501|administrador/);
      await db.query("UPDATE products SET updated_at=updated_at+interval '1 second' WHERE id=$1", [created.kit_id]);
      await assert.rejects(action(created.case_id, 'alterar_sku', await versionOf(created.case_id), {
        sku: 'STALE-CASE-SKU', linked_sku: 'STALE-KIT-SKU', linked_product_id: created.kit_id,
        expected_linked_updated_at: linkedVersion,
      }), /outra sessão/);
      await action(created.case_id, 'alterar_sku', await versionOf(created.case_id), {
        sku: 'NEW-CASE-SKU', linked_product_id: created.kit_id,
        expected_linked_updated_at: await versionOf(created.kit_id),
      });
      assert.equal((await db.query<any>('SELECT sku FROM products WHERE id=$1', [created.case_id])).rows[0].sku, 'NEW-CASE-SKU');
      assert.equal((await db.query<any>('SELECT sku FROM products WHERE id=$1', [created.kit_id])).rows[0].sku, 'KIT-NEW-CASE-SKU');
      const audits = (await db.query<any>(
        "SELECT product_id,actor_user_id,reason,before_data,after_data,occurred_at FROM erp_product_admin_audit WHERE action='alterar_sku' AND product_id=ANY($1::uuid[])",
        [[created.case_id, created.kit_id]],
      )).rows;
      assert.equal(audits.length, 2); assert.ok(audits.every((a: any) => a.actor_user_id === admin && a.reason === 'Motivo isolado para ação' && a.occurred_at));
      assert.ok(audits.some((a: any) => a.product_id === created.case_id && a.before_data.sku === 'TEST-ISOLATED' && a.after_data.sku === 'NEW-CASE-SKU'));
    });
    await t.test('publicação exige conferência; remover preço publicado exige despublicação prévia explícita', async () => {
      const save = (verified: boolean, publish: boolean, body: string | null = 'https://assets.invalid/body.png') => asUser(admin, 'SELECT pamda_admin_salvar_modelo_panda_ia($1,$2,$3,$4,$5,$6,$7)', [created.kit_id, 'Modelo isolado', 'Marca isolada', body, 'https://assets.invalid/mask.png', verified, publish]);
      await assert.rejects(save(false, true), /confirme visualmente/);
      await assert.rejects(save(true, true, null), /confirme visualmente/);
      await save(false, false);
      await save(true, true);
      assert.equal((await db.query<any>('SELECT b2b_site_visible FROM products WHERE id=$1', [created.kit_id])).rows[0].b2b_site_visible, true);
      const removePrice = async () => asUser(admin, 'SELECT pamda_admin_editar_produto($1,$2,$3,$4)', [created.kit_id, await versionOf(created.kit_id), JSON.stringify({ sale_price: null }), 'Remover preço em teste']);
      await blockedWithoutChanges(removePrice, /Despublique.*antes de remover o preço/);
      // A flag comercial divergente não deve ser a única fonte da proteção.
      await db.query('UPDATE products SET b2b_site_visible=false WHERE id=$1', [created.kit_id]);
      await blockedWithoutChanges(removePrice, /Despublique.*antes de remover o preço/);
      await save(true, false);
      await removePrice();
      assert.equal((await db.query<any>('SELECT sale_price FROM products WHERE id=$1', [created.kit_id])).rows[0].sale_price, null);
      assert.equal((await db.query<any>('SELECT published FROM erp_panda_ia_phone_models WHERE kit_product_id=$1', [created.kit_id])).rows[0].published, false);
      await db.query('UPDATE products SET sale_price=30,b2b_site_visible=true WHERE id=$1', [created.kit_id]);
      await blockedWithoutChanges(removePrice, /Despublique.*antes de remover o preço/);
      await db.query('UPDATE products SET b2b_site_visible=false WHERE id=$1', [created.kit_id]);
      await db.query('UPDATE products SET active=false WHERE id=$1', [created.kit_id]);
      await assert.rejects(save(true, true), /kit ativo com preço/);
      await db.query('UPDATE products SET active=true,sale_price=NULL WHERE id=$1', [created.kit_id]);
      await assert.rejects(save(true, true), /kit ativo com preço/);
    });
    await t.test('arquivamento exige SKU exato e bloqueia publicação e kits ativos sem apagar vínculos ou estoque', async () => {
      await db.query('UPDATE products SET current_inventory=7,stock_verified=true WHERE id=$1', [created.case_id]);
      await db.query('UPDATE products SET sale_price=30 WHERE id=$1', [created.kit_id]);
      await db.query('UPDATE erp_panda_ia_phone_models SET published=true WHERE kit_product_id=$1', [created.kit_id]);
      for (const data of [{}, { confirm_sku: null }, { confirm_sku: 123 }, { confirm_sku: 'ERRADO' }, { confirm_sku: 'kit-new-case-sku' }, { confirm_sku: 'KIT-NEW-CASE-SKU ' }, { confirm_sku: 'KIT-NEW-CASE-SKU', active: false }]) {
        await blockedWithoutChanges(async () => action(created.kit_id, 'arquivar', await versionOf(created.kit_id), data), /Digite exatamente o SKU atual/);
      }
      await blockedWithoutChanges(async () => action(created.kit_id, 'arquivar', await versionOf(created.kit_id), await archiveData(created.kit_id)), /Despublique o modelo Panda IA/);
      await db.query('UPDATE erp_panda_ia_phone_models SET published=false WHERE kit_product_id=$1', [created.kit_id]);
      await blockedWithoutChanges(async () => action(created.case_id, 'arquivar', await versionOf(created.case_id), await archiveData(created.case_id)), /kits ativos vinculados/);
      const componentsBefore = (await db.query<any>('SELECT * FROM kit_components WHERE kit_product_id=$1 ORDER BY id', [created.kit_id])).rows;
      await action(created.kit_id, 'arquivar', await versionOf(created.kit_id), await archiveData(created.kit_id));
      await action(created.case_id, 'arquivar', await versionOf(created.case_id), await archiveData(created.case_id));
      const archived = (await db.query<any>('SELECT active,current_inventory,stock_verified FROM products WHERE id=$1', [created.case_id])).rows[0];
      assert.equal(archived.active, false); assert.equal(Number(archived.current_inventory), 7); assert.equal(archived.stock_verified, true);
      assert.deepEqual((await db.query<any>('SELECT * FROM kit_components WHERE kit_product_id=$1 ORDER BY id', [created.kit_id])).rows, componentsBefore);
      const audit = (await db.query<any>(
        "SELECT actor_user_id,reason,before_data,after_data,occurred_at FROM erp_product_admin_audit WHERE product_id=$1 AND action='arquivar_produto'",
        [created.case_id],
      )).rows[0];
      assert.equal(audit.actor_user_id, admin); assert.equal(audit.reason, 'Motivo isolado para ação'); assert.ok(audit.occurred_at);
      assert.equal(audit.before_data.active, true); assert.equal(audit.after_data.active, false);
    });
    await t.test('os 637 produtos e vínculos originais permanecem intactos', async () => {
      assert.deepEqual(await snapshot(), before);
      assert.deepEqual((await db.query('SELECT * FROM kit_components WHERE kit_product_id<>$1 ORDER BY id', [created.kit_id])).rows, linksBefore);
    });
  } finally { await db.close(); }
});
