import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('cadastro básico: reproduz bloqueio e valida permissão individual sem ampliar RLS', async () => {
 const db = new PGlite();
 try {
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth;
   CREATE TABLE auth.users(id uuid primary key);
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   CREATE TABLE erp_user_profiles(user_id uuid primary key,role text,active boolean);
   CREATE TABLE erp_user_permission_overrides(user_id uuid,permission_key text,allowed boolean);
   CREATE TABLE erp_role_permissions(role text,permission_key text,allowed boolean);
   CREATE SEQUENCE pamda_codigo_produtos_seq START 1000;
   CREATE SEQUENCE pamda_codigo_especiais_seq START 10000;
   CREATE SEQUENCE pamda_codigo_servicos_seq START 90000;`);
  await db.exec(await readFile(new URL('./fixtures/product-admin-schema.sql',import.meta.url),'utf8'));
  const functions = await readFile(new URL('./fixtures/product-admin-functions.sql',import.meta.url),'utf8');
  const original = functions.slice(functions.indexOf('CREATE OR REPLACE FUNCTION public.pamda_cadastrar_item_basico'),functions.indexOf('CREATE OR REPLACE FUNCTION public.pamda_cadastrar_kit'));
  await db.exec(original);
  const id='00000000-0000-4000-8000-000000000001';
  await db.query('insert into auth.users values ($1)',[id]);
  await db.query(`insert into erp_user_profiles values ($1,'gerencial',true)`,[id]);
  await db.query(`insert into erp_user_permission_overrides values ($1,'products.manage',true)`,[id]);
  await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[id]);
  const create = () => db.query(`select * from pamda_cadastrar_item_basico('fisico','Teste isolado','NILU-TEST')`);
  await assert.rejects(create(), /Acesso não autorizado/);
  // Snapshot of the deployed permission resolver (individual override takes precedence).
  await db.exec(`CREATE FUNCTION public.pamda_has_permission(p_permission text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
   SELECT EXISTS (SELECT 1 FROM public.erp_user_profiles p WHERE p.user_id=(SELECT auth.uid()) AND p.active
    AND (p.role='admin_gerencial' OR COALESCE(
     (SELECT o.allowed FROM public.erp_user_permission_overrides o WHERE o.user_id=p.user_id AND o.permission_key=p_permission),
     (SELECT r.allowed FROM public.erp_role_permissions r WHERE r.role=p.role AND r.permission_key=p_permission),false))) $$;`);
  await db.exec(await readFile(new URL('../supabase/review/product_create_permission.sql',import.meta.url),'utf8'));
  await db.exec('SET ROLE authenticated');
  const result = await create(); assert.equal(result.rows.length,1);
  await db.exec('RESET ROLE');
  assert.equal((await db.query<any>('select current_inventory,stock_verified from products')).rows[0].stock_verified,false);
  await db.exec(`update erp_user_permission_overrides set allowed=false;`);
  await db.exec('SET ROLE authenticated'); await assert.rejects(create(),/Acesso não autorizado/); await db.exec('RESET ROLE');
  // A role grant cannot override an explicit individual denial.
  await db.exec(`insert into erp_role_permissions values ('gerencial','products.manage',true);`);
  await db.exec('SET ROLE authenticated'); await assert.rejects(create(),/Acesso não autorizado/); await db.exec('RESET ROLE');
  await db.exec(`update erp_user_profiles set active=false; update erp_user_permission_overrides set allowed=true;`);
  await db.exec('SET ROLE authenticated'); await assert.rejects(create(),/Acesso não autorizado/); await db.exec('RESET ROLE');
  await db.query(`select set_config('request.jwt.claim.sub','',false)`);
  await assert.rejects(create(),/Acesso não autorizado/);
  await db.exec('SET ROLE anon'); await assert.rejects(create(),/permission denied/); await db.exec('RESET ROLE');
  assert.equal((await db.query<any>('select count(*)::int as count from products')).rows[0].count,1);
 } finally { await db.close(); }
});
