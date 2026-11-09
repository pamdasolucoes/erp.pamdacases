import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const read = (path:string) => readFile(new URL(path,import.meta.url),'utf8');
test('RPCs e RLS respeitam permissões individuais, sem permissões novas ou escrita direta',async t=>{
 const db=new PGlite();
 try {
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth; CREATE SCHEMA private; CREATE SCHEMA pamda_private; CREATE SCHEMA messenger_private; CREATE SCHEMA storage;
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   CREATE FUNCTION messenger_private.messenger_access(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
   CREATE TABLE auth.users(id uuid primary key);
   CREATE TABLE storage.objects(bucket_id text);
   SET check_function_bodies=off;`);
  await db.exec(await read('./fixtures/permission-schema.sql'));
  const functions=JSON.parse(await read('./fixtures/permission-rpc-snapshot.json'));
  for(const f of functions)await db.exec(f.definition);
  const policies=JSON.parse(await read('./fixtures/permission-policy-snapshot.json'));
  const columns:Record<string,string>={customers:'id uuid',customer_branches:'id uuid',erp_payment_methods:'id uuid',erp_payment_terms:'id uuid',erp_customer_payment_settings:'id uuid',erp_branch_payment_settings:'id uuid',erp_panda_ia_phone_models:'id uuid',erp_sale_events:'id uuid,sale_id uuid',erp_sale_test_receipts:'id uuid',erp_production_tasks:'id uuid,channel_id uuid',erp_production_task_events:'id uuid'};
  for(const [table,fields] of Object.entries(columns)) await db.exec('CREATE TABLE IF NOT EXISTS public.'+table+' ('+fields+');');
  for(const p of policies){
   await db.exec('ALTER TABLE public.'+p.tablename+' ENABLE ROW LEVEL SECURITY;');
   await db.exec('CREATE POLICY '+p.policyname+' ON public.'+p.tablename+' FOR SELECT TO authenticated USING ('+p.qual+');');
  }
  for(const [cmd,suffix] of [['SELECT','select'],['INSERT','insert'],['UPDATE','update'],['DELETE','delete']]) await db.exec('CREATE POLICY panda_ia_tech_assets_admin_'+suffix+' ON storage.objects FOR '+cmd+' TO authenticated '+(cmd==='INSERT'?'WITH CHECK':'USING')+" (bucket_id='panda-ia-modelos' AND public.pamda_is_admin());");
  await db.exec(`CREATE FUNCTION pamda_private.require_permission(text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF auth.uid() IS NULL OR NOT public.pamda_has_permission($1) THEN RAISE EXCEPTION 'Acesso não autorizado' USING errcode='42501'; END IF; END $$;`);
  const sql=await read('../supabase/review/assigned_permissions.sql');
  const definitions=async()=> (await db.query("select pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname like 'pamda%' order by n.nspname,p.proname")).rows;
  await db.exec(sql); const once=await definitions(); await db.exec(sql); assert.deepEqual(await definitions(),once); // safe to reapply
  const id='00000000-0000-4000-8000-000000000001';
  await db.query(`insert into erp_user_profiles(user_id,role,active) values ($1,'gerencial',true)`,[id]);
  await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[id]);
  const targets=[...sql.matchAll(/\('(?:public|private)','([^']+)','([^']+)'\)/g)].map(m=>({name:m[1],permission:m[2]}));
  assert.equal(targets.length,17);
  const denied=(e:any)=>e.code==='42501'||/Acesso|restrit|autoriz|administrador/i.test(e.message);
  for(const target of targets) await t.test(target.name+' aceita somente sua permissão', async()=>{
   const fn=functions.find((f:any)=>f.name===target.name);
   const args=(fn.args ? fn.args.split(', ') : []).map((arg:string)=>'NULL::'+arg.slice(arg.indexOf(' ')+1)).join(',');
   const schema=fn.schema;
   const call=()=>db.query('SELECT '+schema+'.'+fn.name+'('+args+')');
   await db.exec('DELETE FROM erp_user_permission_overrides;');
   await assert.rejects(call(),denied);
   // An unrelated grant never authorizes this RPC.
   await db.query(`insert into erp_user_permission_overrides(user_id,permission_key,allowed) values ($1,'unrelated.permission',true)`,[id]);
   await assert.rejects(call(),denied);
   await db.query(`insert into erp_user_permission_overrides(user_id,permission_key,allowed) values ($1,$2,true)`,[id,target.permission]);
   try { await call(); } catch(e) { assert.ok(!denied(e),String(e)); } // validation/no-record errors are expected for NULL inputs
   await db.exec('UPDATE erp_user_profiles SET active=false'); await assert.rejects(call(),denied);
   await db.exec('UPDATE erp_user_profiles SET active=true; UPDATE erp_user_permission_overrides SET allowed=false;');
   await db.query('INSERT INTO erp_role_permissions(role,permission_key,allowed) VALUES ($1,$2,true)',['gerencial',target.permission]); await assert.rejects(call(),denied);
   await db.exec('DELETE FROM erp_role_permissions');
   await db.query("select set_config('request.jwt.claim.sub','',false)"); await assert.rejects(call(),denied);
   await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
  });
  await t.test('RLS de leitura e bucket sem escape de escopo',async()=>{
   await db.exec(`DELETE FROM erp_user_permission_overrides; GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated; GRANT USAGE ON SCHEMA storage TO authenticated; GRANT SELECT,INSERT ON storage.objects TO authenticated;
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY; INSERT INTO storage.objects VALUES ('panda-ia-modelos'),('outro-bucket');
    INSERT INTO customers(id) VALUES ('00000000-0000-4000-8000-000000000002');
    INSERT INTO erp_payment_methods(id) VALUES ('00000000-0000-4000-8000-000000000003');`);
   const visible=async(table:string)=>{await db.exec('SET ROLE authenticated');try{return (await db.query('SELECT * FROM '+table)).rows.length;}finally{await db.exec('RESET ROLE');}};
   assert.equal(await visible('customers'),0); assert.equal(await visible('erp_payment_methods'),0); assert.equal(await visible('storage.objects'),0);
   await db.query(`insert into erp_user_permission_overrides(user_id,permission_key,allowed) values ($1,'customers.manage',true)`,[id]);
   assert.equal(await visible('customers'),1); assert.equal(await visible('erp_payment_methods'),1);
   await db.exec('DELETE FROM erp_user_permission_overrides');
   await db.query(`insert into erp_user_permission_overrides(user_id,permission_key,allowed) values ($1,'products.manage',true)`,[id]);
   assert.equal(await visible('storage.objects'),1); assert.equal(await visible('customers'),0);
   await db.exec('SET ROLE authenticated');
   await assert.rejects(db.query("INSERT INTO storage.objects VALUES ('outro-bucket')"),/row-level security/);
   await assert.rejects(db.query("INSERT INTO products(name) VALUES ('escrita direta')"),/permission denied/);
   await db.exec('RESET ROLE');
  });
 } finally {await db.close();}
});
