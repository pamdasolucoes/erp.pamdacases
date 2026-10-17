import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PriceAuthorizationService } from '../src/services/priceAuthorization';
import { buildPriceReview, calculateSalePricing } from '../src/services/salePricing';
import { draft } from './fixtures/pricingProducts';
import { uuid } from './fixtures/customerRows';

test('backend SQL: autoriza apenas admin ativo e recalcula precos, custos e desconto sem gravar venda', async t => {
  const db=new PGlite(); const admin=uuid(20), seller=uuid(21), inactive=uuid(22), production=uuid(23);
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE TABLE public.erp_user_profiles(user_id uuid PRIMARY KEY,username text,role text,active boolean);
      ALTER TABLE public.erp_user_profiles ENABLE ROW LEVEL SECURITY;
      REVOKE ALL ON public.erp_user_profiles FROM PUBLIC,anon,authenticated;`);
    await db.query(`INSERT INTO public.erp_user_profiles VALUES($1,'admin','admin_gerencial',true),($2,'vendedor','venda_atendimento',true),($3,'inativo','admin_gerencial',false),($4,'producao','producao',true)`,[admin,seller,inactive,production]);
    const before=(await db.query('SELECT * FROM erp_user_profiles ORDER BY user_id')).rows;
    await db.exec(await readFile(new URL('../supabase/review/07_PAMDA_AUTORIZACAO_PRECOS_DEMO.sql',import.meta.url),'utf8'));
    const review=()=>buildPriceReview(calculateSalePricing([draft('4,00','2')],'0,01'),uuid(30),'Desconto negociado',uuid(1),uuid(1001));
    async function authorize(userId: string | null, payload: unknown, role='authenticated') {
      await db.query(`SELECT set_config('request.jwt.claim.sub',$1,false)`,[userId || '']);
      await db.exec(`SET ROLE ${role}`);
      try { return (await db.query<any>('SELECT public.pamda_authorize_demo_pricing($1) AS result',[JSON.stringify(payload)])).rows[0].result; }
      finally { await db.exec('RESET ROLE'); }
    }
    await t.test('retorna identidade e horario do servidor com escopo somente demonstracao', async () => {
      const result=await authorize(admin,review());
      assert.equal(result.scope,'demo_only'); assert.equal(result.official_sale_allowed,false);
      assert.deepEqual(result.authorized_by,{id:admin,username:'admin'});
      assert.ok(Number.isFinite(Date.parse(result.authorized_at)));
      assert.equal(result.requires_managerial_authorization,true);
    });
    await t.test('anon, nao autenticado, vendedor, inativo e producao sao negados', async () => {
      await assert.rejects(authorize(null,review(),'anon'),/permission denied/);
      for (const id of [null,seller,inactive,production,uuid(99)]) await assert.rejects(authorize(id,review()),/administrador ativo/);
      await assert.rejects(authorize(seller,{...review(),role:'admin_gerencial'}),/administrador ativo/);
    });
    await t.test('metadados, escopo oficial, totais adulterados, negativos e custo desconhecido sao rejeitados', async () => {
      await assert.rejects(authorize(admin,{...review(),role:'admin_gerencial'}),/Campo nao autorizado/);
      await assert.rejects(authorize(admin,{...review(),scope:'official'}),/Venda oficial permanece bloqueada/);
      for (const field of ['unitPriceCents','quantity','additionalDiscountCents','netCents','directCostCents','managerialCostCents']) {
        const payload=review() as any; payload.items[0][field]=-1;
        await assert.rejects(authorize(admin,payload),/invalida/);
      }
      const fake=review() as any; fake.items[0].netCents=1;
      await assert.rejects(authorize(admin,fake),/divergentes/);
      const cost=review() as any; cost.items[0].snapshot.directUnitCostMicros=1;
      await assert.rejects(authorize(admin,cost),/componentes/);
      cost.items[0].snapshot.directUnitCostMicros=null;
      await assert.rejects(authorize(admin,cost),/invalida/);
    });
    await t.test('servidor exige motivo abaixo de qualquer custo e no desconto adicional', async () => {
      const payload=review() as any; payload.items[0].reason='';
      await assert.rejects(authorize(admin,payload),/motivo da negociacao/);
      payload.items[0].reason='Conferido'; payload.discountReason='';
      await assert.rejects(authorize(admin,payload),/motivo do desconto/);
      payload.additionalDiscountCents=100000;
      await assert.rejects(authorize(admin,payload));
    });
    await t.test('rateio de centavos e receitas zero conferem entre TypeScript e PostgreSQL', async () => {
      const items=[draft('0,01','1',uuid(1)),draft('0,01','1',uuid(2)),draft('0,01','1',uuid(3))];
      const result=await authorize(admin,buildPriceReview(calculateSalePricing(items,'0,02'),uuid(30),'Conferido'));
      assert.equal(result.requires_managerial_authorization,true);
      assert.equal((await authorize(admin,buildPriceReview(calculateSalePricing([draft('0')],'0'),uuid(30),''))).official_sale_allowed,false);
    });
    await t.test('perfil e catalogo nao sao alterados e nenhuma tabela de vendas e criada', async () => {
      assert.deepEqual((await db.query('SELECT * FROM erp_user_profiles ORDER BY user_id')).rows,before);
      assert.deepEqual((await db.query(`SELECT tablename FROM pg_tables WHERE schemaname='public'`)).rows,[{tablename:'erp_user_profiles'}]);
      await db.exec('SET ROLE authenticated');
      try { await assert.rejects(db.query(`SELECT public.pamda_demo_pricing_integer('1')`),/permission denied/); }
      finally { await db.exec('RESET ROLE'); }
    });
  } finally { await db.close(); }
});

test('cliente so aceita autorizacao demo vinculada a revisao e identidade reais', async () => {
  const review=buildPriceReview(calculateSalePricing([draft('4')],'0'),uuid(30),'');
  const response={scope:'demo_only',official_sale_allowed:false,revision:review.revision,authorized_at:'2026-10-15T12:00:00Z',authorized_by:{id:uuid(20),username:'admin'}};
  const client=(data:unknown,error:unknown=null,authenticated=true) => ({ auth:{getUser:async()=>({data:{user:authenticated ? {id:uuid(20)} : null}})},
    rpc:async(name:string,args:any)=>{assert.equal(name,'pamda_authorize_demo_pricing'); assert.deepEqual(args,{p_draft:review}); return {data,error};} }) as unknown as SupabaseClient;
  assert.equal((await new PriceAuthorizationService(client(response)).authorizeDemo(review)).officialSaleAllowed,false);
  for (const data of [{...response,scope:'official'},{...response,official_sale_allowed:true},{...response,revision:uuid(90)},{...response,authorized_by:{id:uuid(90),username:'outro'}}]) await assert.rejects(new PriceAuthorizationService(client(data)).authorizeDemo(review),/não corresponde/);
  for (const [code,pattern] of [['PGRST202',/migration 07/],['42501',/administrador ativo/],['network',/conexão/]] as const) await assert.rejects(new PriceAuthorizationService(client(null,{code})).authorizeDemo(review),pattern);
  await assert.rejects(new PriceAuthorizationService(client(null,null,false)).authorizeDemo(review),/Sessão inválida/);
});
