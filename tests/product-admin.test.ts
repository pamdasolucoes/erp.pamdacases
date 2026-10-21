import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('ações administrativas: transação, acesso, auditoria e preservação', async t => {
 const db = new PGlite();
 const base='00000000-0000-4000-8000-000000000001';
 const kit='00000000-0000-4000-8000-000000000002';
 const other='00000000-0000-4000-8000-000000000003';
 try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   CREATE FUNCTION public.pamda_is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT coalesce(current_setting('test.admin',true),'')='yes' $$;
   CREATE TABLE products(id uuid PRIMARY KEY,sku text UNIQUE,code text,type text,active boolean DEFAULT true,b2b_site_visible boolean DEFAULT false,current_inventory numeric DEFAULT 5,updated_at timestamptz DEFAULT now());
   CREATE TABLE kit_components(kit_product_id uuid REFERENCES products,component_product_id uuid REFERENCES products);
   CREATE TABLE erp_panda_ia_phone_models(base_product_id uuid REFERENCES products,kit_product_id uuid REFERENCES products,published boolean DEFAULT false);
   CREATE TABLE erp_product_admin_audit(product_id uuid REFERENCES products,actor_user_id uuid,action text,before_data jsonb,after_data jsonb,reason text);
   CREATE TABLE history(product_id uuid REFERENCES products,snapshot jsonb);
   GRANT UPDATE,DELETE ON products TO authenticated;
   INSERT INTO products(id,sku,code,type) VALUES('${base}','CAP-OLD','101','fisico'),('${kit}','KIT-CAP-OLD','20101','kit'),('${other}','OTHER','102','fisico');
   INSERT INTO kit_components VALUES('${kit}','${base}');
   INSERT INTO erp_panda_ia_phone_models VALUES('${base}','${kit}',false);
   INSERT INTO history VALUES('${base}','{"sku":"CAP-OLD"}');`);
  const snapshot = async () => (await db.query('SELECT * FROM products ORDER BY id')).rows;
  const before = await snapshot();
  await db.exec(await readFile(new URL('../supabase/review/11_PRODUTOS_ADMIN_SEGURO.sql',import.meta.url),'utf8'));
  assert.deepEqual(await snapshot(),before);
  async function run(id: string, action: string, sku: string|null, admin=true, expected?: unknown) {
   const row=(await db.query<any>('SELECT * FROM products WHERE id=$1',[id])).rows[0];
   await db.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('test.admin',$2,false)",[base,admin?'yes':'no']);
   await db.exec('SET ROLE authenticated');
   try { return await db.query('SELECT public.pamda_admin_produto_acao($1,$2,$3,$4,$5)',[id,expected??row.updated_at,action,sku,'Correção conferida']); }
   finally { await db.exec('RESET ROLE'); }
  }
  await t.test('vendedor ou admin inativo não altera; anon sem execute; DML direto vedado',async()=>{
   await assert.rejects(run(base,'sku','CAP-NEW',false),/administrador/);
   await db.exec('SET ROLE anon');
   try { await assert.rejects(db.query('SELECT public.pamda_admin_produto_acao($1,now(),$2,$3,$4)',[base,'sku','NEW','motivo']),/permission denied/); } finally { await db.exec('RESET ROLE'); }
   await db.exec('SET ROLE authenticated');
   try { await assert.rejects(db.exec("UPDATE products SET sku='BYPASS'"),/permission denied/); await assert.rejects(db.exec('DELETE FROM products'),/permission denied/); } finally { await db.exec('RESET ROLE'); }
  });
  await t.test('duplicado normalizado, colisão de kit e SKU direto do kit não deixam alterações',async()=>{
   for(const [id,sku] of [[base,' other '],[kit,'KIT-NEW']]) await assert.rejects(run(id,'sku',sku));
   await db.exec("UPDATE products SET sku='KIT-CAP-NEW' WHERE sku='OTHER'");
   await assert.rejects(run(base,'sku','CAP-NEW'),/já utilizado/);
   assert.equal((await db.query('SELECT * FROM erp_product_admin_audit')).rows.length,0);
   assert.equal((await snapshot() as any)[0].sku,'CAP-OLD');
   await db.exec("UPDATE products SET sku='OTHER' WHERE sku='KIT-CAP-NEW'");
  });
  await t.test('base e kit mudam juntos com auditoria e sem alterar histórico, IDs ou estoque',async()=>{
   await db.exec("UPDATE products SET sku='KIT-ESPECIAL' WHERE type='kit'");
   await assert.rejects(run(base,'sku','CAP-NEW'),/especial/);
   await db.exec("UPDATE products SET sku='KIT-CAP-OLD' WHERE type='kit'");
   await assert.rejects(run(base,'sku','contém espaços'),/SKU inválido/);
   // Falha na segunda auditoria desfaz inclusive a troca e auditoria do kit.
   await db.exec(`ALTER TABLE erp_product_admin_audit ADD CONSTRAINT fail_base_audit CHECK(action<>'alterar_sku')`);
   await assert.rejects(run(base,'sku','CAP-NEW'),/fail_base_audit/);
   assert.equal((await db.query('SELECT * FROM erp_product_admin_audit')).rows.length,0);
   assert.equal((await snapshot() as any[])[1].sku,'KIT-CAP-OLD');
   await db.exec('ALTER TABLE erp_product_admin_audit DROP CONSTRAINT fail_base_audit');
   await run(base,'sku',' cap-new ');
   const rows=await snapshot() as any[];
   assert.equal(rows[0].sku,'CAP-NEW'); assert.equal(rows[1].sku,'KIT-CAP-NEW');
   assert.deepEqual(rows.map(r=>[r.id,r.code,r.current_inventory]),(before as any[]).map(r=>[r.id,r.code,r.current_inventory]));
   const audit=(await db.query<any>('SELECT * FROM erp_product_admin_audit')).rows;
   assert.equal(audit.length,2); assert.ok(audit.every(a=>a.actor_user_id===base && a.reason==='Correção conferida'));
   assert.equal(audit.find(a=>a.product_id===base).before_data.sku,'CAP-OLD');
   assert.deepEqual((await db.query<any>('SELECT snapshot FROM history')).rows[0].snapshot,{sku:'CAP-OLD'});
   await assert.rejects(run(base,'sku','CAP-NEXT',true,(before as any[])[0].updated_at),/outra sessão/);
  });
  await t.test('arquivamento bloqueia publicação e kit ativo; preserva todas as referências',async()=>{
   await assert.rejects(run(base,'archive',null),/kits ativos/);
   await db.exec('UPDATE erp_panda_ia_phone_models SET published=true');
   await assert.rejects(run(kit,'archive',null),/Despublique/);
   await db.exec('UPDATE erp_panda_ia_phone_models SET published=false');
   await run(kit,'archive',null); await run(base,'archive',null);
   assert.equal((await snapshot() as any[])[0].active,false);
   for(const table of ['history','kit_components','erp_panda_ia_phone_models']) assert.equal((await db.query(`SELECT * FROM ${table}`)).rows.length,1);
   await assert.rejects(run(base,'archive',null),/já arquivado/);
  });
 } finally { await db.close(); }
});
