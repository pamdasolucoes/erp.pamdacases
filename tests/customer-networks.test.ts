import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { filterNetworkUnits, mapNetworkReport, validatePeriod, validatePolicy } from '../src/services/customerNetworks';
import { validateSettlementDraft, type SettlementDraft } from '../src/services/networkSettlementDraft';
const uuid = (n: number) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');

test('datas, preferências, filtros e isolamento financeiro', () => {
  validatePeriod('2026-10-01','2026-10-20');
  for (const p of [['2026-02-30','2026-03-01'],['2026-10-20','2026-10-01'],['2020-01-01','2026-01-01']]) assert.throws(() => validatePeriod(p[0],p[1]));
  validatePolicy({ billing_cycle: 'mensal', default_collection_mode: 'centralizado', due_days: null, notes: null });
  validatePolicy({ billing_cycle: null, default_collection_mode: null, due_days: null, notes: null }, true);
  assert.throws(() => validatePolicy({ billing_cycle: 'anual', default_collection_mode: 'flexivel', due_days: 366, notes: null }));
  const value = { network_id: uuid(1), from: '2026-10-01', to: '2026-10-20', financial_authorized: true, payments_integrated: false,
    units: [2,3].map(n => ({ customer_id: uuid(n), branch_id: uuid(n+10), purchases_real: 150, purchases_test: 10, paid_real: 99, paid_test: 0 })) };
  const hidden = mapNetworkReport(value, uuid(1), value.from, value.to, false);
  assert.equal(hidden.units[0].purchases_real, null);
  assert.equal(hidden.units[0].purchases_test, null);
  assert.equal(hidden.units[0].paid_real, null);
  const visible = mapNetworkReport(value, uuid(1), value.from, value.to, true);
  assert.equal(visible.units[0].purchases_real, 150);
  assert.equal(visible.units[0].paid_real, null);
  assert.equal(filterNetworkUnits(visible,uuid(2),uuid(12)).length,1);
  assert.equal(filterNetworkUnits(visible,uuid(2),uuid(13)).length,0);
  assert.throws(() => mapNetworkReport(value,uuid(9),value.from,value.to,true));
});

test('contrato futuro admite rateio parcial entre filiais, sem excesso ou mistura real/teste', () => {
  const draft: SettlementDraft = { payer: { personOrUnitId: uuid(9), name: 'Pagador confirmado' }, confirmedReceiptCents: 10000, environment: 'real',
    allocations: [1,2].map(n => ({ orderId: uuid(n), customerId: uuid(n+2), branchId: uuid(n+4), originalDocumentId: uuid(n+6), amountCents: 4000, environment: 'real' })) };
  assert.deepEqual(validateSettlementDraft(draft), { allocatedCents:8000, unallocatedCents:2000 });
  assert.throws(() => validateSettlementDraft({ ...draft, confirmedReceiptCents:7999 }));
  assert.throws(() => validateSettlementDraft({ ...draft, allocations:[...draft.allocations,draft.allocations[0]] }));
  assert.throws(() => validateSettlementDraft({ ...draft, environment:'test' }));
});

test('contrato SQL instalado: criação, vínculos, histórico, permissões e relatório', async t => {
  const snapshot = JSON.parse(await readFile(new URL('../docs/contracts/commercial-networks.snapshot.json',import.meta.url),'utf8'));
  const security = JSON.parse(await readFile(new URL('../docs/contracts/commercial-networks.security.json',import.meta.url),'utf8'));
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE authenticated; CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.user',true),'')::uuid$$;
      CREATE FUNCTION public.pamda_is_admin() RETURNS boolean LANGUAGE sql AS $$SELECT coalesce(current_setting('test.admin',true),'false')='true'$$;
      CREATE FUNCTION public.pamda_has_permission(p_permission text) RETURNS boolean LANGUAGE sql AS $$SELECT CASE WHEN p_permission='finance.read' THEN coalesce(current_setting('test.finance',true),'false')='true' ELSE coalesce(current_setting('test.access',true),'false')='true' END$$;
      CREATE TABLE customers(id uuid PRIMARY KEY, customer_code text, name text, active boolean DEFAULT true, notes text);
      CREATE TABLE customer_branches(id uuid PRIMARY KEY, customer_id uuid REFERENCES customers, name text, is_primary boolean);
      CREATE TABLE erp_sales(id uuid PRIMARY KEY,customer_id uuid,branch_id uuid,status text,is_test boolean,total numeric,created_at timestamptz);
      CREATE TABLE erp_commercial_change_audit(actor_user_id uuid,customer_id uuid,branch_id uuid,action text,before_data jsonb,after_data jsonb,reason text);`);
    // Reconstruct only test tables from the read-only installed schema snapshot.
    for (const table of ['erp_customer_networks','erp_customer_network_members','erp_customer_billing_policies','erp_branch_billing_policies']) {
      const columns = snapshot.columns.filter((c:any) => c.table_name===table).map((c:any) => {
        const defaults: Record<string,string> = { id:'gen_random_uuid()',created_at:'now()',updated_at:'now()',joined_at:'now()',default_cycle:"'flexivel'",default_collection_mode:"'flexivel'" };
        return c.column_name+' '+c.data_type+(defaults[c.column_name]?' DEFAULT '+defaults[c.column_name]:'')+(c.is_nullable==='NO'?' NOT NULL':'');
      });
      await db.exec('CREATE TABLE '+table+' ('+columns.join(',')+')');
    }
    for (const c of security.constraints) await db.exec('ALTER TABLE '+c.table+' ADD CONSTRAINT '+c.name+' '+c.definition);
    for (const f of snapshot.functions) await db.exec(f.definition);
    for (const r of security.rls) await db.exec('ALTER TABLE '+r.table+' ENABLE ROW LEVEL SECURITY');
    for (const p of snapshot.policies) await db.exec('CREATE POLICY '+p.policyname+' ON '+p.tablename+' FOR SELECT TO authenticated USING ('+p.qual+')');
    await db.exec('GRANT USAGE ON SCHEMA auth TO authenticated; GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated');
    await db.query("SELECT set_config('test.user',$1,false),set_config('test.admin','true',false),set_config('test.access','true',false),set_config('test.finance','true',false)",[uuid(99)]);
    await db.query('INSERT INTO auth.users VALUES ($1)',[uuid(99)]);
    for (const n of [1,2,3]) {
      await db.query('INSERT INTO customers VALUES ($1,$2,$3,true,$4)',[uuid(n),' 000'+n+'-A ','Nome diferente '+n,'Histórico intocado']);
      await db.query('INSERT INTO customer_branches VALUES ($1,$2,$3,true)',[uuid(n+10),uuid(n),'Unidade '+n]);
    }
    const before = (await db.query('SELECT * FROM customers ORDER BY id')).rows;
    const branchesBefore = (await db.query('SELECT * FROM customer_branches ORDER BY id')).rows;
    await db.query("INSERT INTO erp_sales VALUES ($1,$2,$3,'confirmed',false,42,'2025-01-01T12:00:00-03:00')",[uuid(30),uuid(1),uuid(11)]);
    const historicalOrder = (await db.query('SELECT * FROM erp_sales WHERE id=$1',[uuid(30)])).rows;
    let network = '';
    await t.test('cria rede e matriz com código separado do histórico', async () => {
      network = (await db.query<any>("SELECT pamda_admin_criar_rede('Rede manual','REDE',$1,'rede') AS id",[uuid(1)])).rows[0].id;
      const member = (await db.query<any>('SELECT * FROM erp_customer_network_members WHERE customer_id=$1',[uuid(1)])).rows[0];
      assert.equal(member.display_code,'REDE'); assert.equal(member.legacy_customer_code,' 0001-A ');
    });
    await t.test('vincula nomes diferentes, deriva código no servidor e rejeita duplicidade',async () => {
      const r = await db.query<any>('SELECT pamda_admin_vincular_cliente_rede($1,$2) AS code',[network,uuid(2)]);
      assert.equal(r.rows[0].code,'REDE-1');
      await assert.rejects(db.query('SELECT pamda_admin_vincular_cliente_rede($1,$2)',[network,uuid(2)]));
      await assert.rejects(db.query("SELECT pamda_admin_criar_rede('Duplicada','REDE',$1,'rede')",[uuid(3)]));
      assert.deepEqual((await db.query('SELECT * FROM customers ORDER BY id')).rows,before);
      assert.deepEqual((await db.query('SELECT * FROM customer_branches ORDER BY id')).rows,branchesBefore);
      assert.deepEqual((await db.query('SELECT * FROM erp_sales WHERE id=$1',[uuid(30)])).rows,historicalOrder);
    });
    await t.test('nega escrita administrativa e leitura sem permissão',async () => {
      await db.exec("SELECT set_config('test.admin','false',false),set_config('test.access','false',false); SET ROLE authenticated");
      try {
        assert.equal((await db.query('SELECT * FROM erp_customer_networks')).rows.length,0);
        await assert.rejects(db.query('SELECT pamda_admin_vincular_cliente_rede($1,$2)',[network,uuid(3)]));
        await assert.rejects(db.query("SELECT pamda_admin_configurar_cobranca_cliente($1,'diario','flexivel',NULL,NULL)",[uuid(1)]));
      } finally { await db.exec("RESET ROLE; SELECT set_config('test.admin','true',false),set_config('test.access','true',false)"); }
    });
    await t.test('relatório filtra rede/período, separa teste e real e herda cobrança',async () => {
      await db.query("SELECT pamda_admin_configurar_cobranca_rede($1,'mensal','centralizado',30,'Preferência revisada')",[network]);
      for (const [n,customer,branch,test,total,date] of [[31,1,11,false,100,'2026-10-20T12:00:00-03:00'],[32,1,11,true,20,'2026-10-20T12:00:00-03:00'],[33,1,11,false,999,'2026-10-21T00:00:00-03:00'],[34,3,13,false,999,'2026-10-20T12:00:00-03:00']] as const) await db.query("INSERT INTO erp_sales VALUES ($1,$2,$3,'confirmed',$4,$5,$6)",[uuid(n),uuid(customer),uuid(branch),test,total,date]);
      const report = async () => (await db.query<any>("SELECT pamda_relatorio_rede_clientes($1,'2026-10-20','2026-10-20') AS r",[network])).rows[0].r;
      let r = await report();
      assert.equal(r.units.length,2); assert.equal(r.units[0].purchases_real,100); assert.equal(r.units[0].purchases_test,20);
      assert.equal(r.units[0].paid_real,null); assert.equal(r.payments_integrated,false); assert.equal(r.units[0].billing_cycle,'mensal');
      await db.exec("SELECT set_config('test.finance','false',false)");
      r = await report(); assert.equal(r.units[0].purchases_real,null); assert.equal(r.units[0].purchases_test,null);
      assert.deepEqual((await db.query('SELECT * FROM customers ORDER BY id')).rows,before);
    });
  } finally { await db.close(); }
});
