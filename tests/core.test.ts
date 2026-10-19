import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CoreService, mapCommercialContext, mapErpSummary } from '../src/services/core';
import { pendingBackend } from './fixtures/pendingSalesBackend';
import { saleCustomerCode, preparationFromSale } from '../src/services/pendingSaleMapping';
import { uuid } from './fixtures/customerRows';
import { CustomersService } from '../src/services/customers';
import { customerRow, branchRow } from './fixtures/customerRows';
import { mapUserProfile } from '../src/services/authService';
import { PreparationStore } from '../src/services/preparationStore';
import { PendingDraftSync } from '../src/services/pendingDraftSync';
import { emptySalePreparation } from '../src/services/salePreparation';

const context = (patch: Record<string, unknown> = {}) => ({ customer_id: uuid(1), branch_id: uuid(1001), is_primary: true,
  customer_default_shipping_fee: 12.5, branch_shipping_fee_override: null, effective_shipping_fee: 12.5,
  freight_source: 'customer', payment_method_id: null, payment_term_id: null, credit_limit: null, billing_mode: null, ...patch });

test('resumo mantém NULL como não configurado e descarta receitas sem permissão financeira', () => {
  const row = { as_of: '2026-10-19T12:00:00Z', pending_sales: 3, production_queue_count: null, confirmed_revenue_today: 1234.56 };
  const restricted = mapErpSummary(row, false);
  assert.equal(restricted.pending_sales, 3); assert.equal(restricted.production_queue_count, null);
  assert.equal(restricted.confirmed_revenue_today, null); assert.equal(restricted.receivables_balance, null);
  assert.equal(mapErpSummary(row, true).confirmed_revenue_today, 123456);
  assert.equal(mapErpSummary({ ...row, pending_sales: 0 }, false).pending_sales, 0);
  assert.throws(() => mapErpSummary({ ...row, pending_sales: -1 }, false));
  assert.throws(() => mapErpSummary({ ...row, as_of: 'invalido' }, false));
});

test('resumo mantém vendas e recibos de teste separados dos indicadores oficiais',()=>{
  const summary=mapErpSummary({as_of:'2026-10-19T12:00:00Z',confirmed_sales:8,test_confirmed_sales:3,official_receipts:7,test_receipts:2,confirmed_revenue_month:120},true);
  assert.equal(summary.confirmed_sales,8);assert.equal(summary.test_confirmed_sales,3);
  assert.equal(summary.official_receipts,7);assert.equal(summary.test_receipts,2);
  assert.equal(summary.confirmed_revenue_month,12000);
});

test('contexto conserva zero explícito da filial, herança, NULL e UUIDs sem inventar políticas', () => {
  const inherited = mapCommercialContext(context(), uuid(1), uuid(1001));
  assert.equal(inherited.effectiveShippingCents, 1250); assert.equal(inherited.branchShippingCents, null);
  const free = mapCommercialContext(context({ branch_shipping_fee_override: 0, effective_shipping_fee: 0, freight_source: 'branch' }), uuid(1), uuid(1001));
  assert.equal(free.branchShippingCents, 0); assert.equal(free.effectiveShippingCents, 0);
  const missing = mapCommercialContext(context({ customer_default_shipping_fee: null, effective_shipping_fee: null }), uuid(1), uuid(1001));
  assert.equal(missing.effectiveShippingCents, null); assert.equal(missing.paymentMethodId, null); assert.equal(missing.creditLimitCents, null);
  assert.throws(() => mapCommercialContext(context(), uuid(2), uuid(1001)), /outro cliente/);
});

test('sugestão de frete usa RPC do endereço e preserva R$ 0 e classificação NULL',async()=>{
  const calls:{name:string;args:Record<string,unknown>}[]=[];
  const client={auth:{getUser:async()=>({data:{user:{id:uuid(9000)}},error:null})},rpc:async(name:string,args:Record<string,unknown>)=>{
    calls.push({name,args});
    const city=String(args.p_city),neighborhood=String(args.p_neighborhood);
    const value=city==='Curitiba'?(neighborhood==='Centro'?0:5):city==='Pinhais'?10:null;
    return {data:value,error:null};
  }} as unknown as SupabaseClient;
  const service=new CoreService(client);
  assert.equal(await service.suggestFreight(uuid(9000),'Curitiba','Centro'),0);
  assert.equal(await service.suggestFreight(uuid(9000),'Curitiba','Batel'),500);
  assert.equal(await service.suggestFreight(uuid(9000),'Pinhais','Centro'),1000);
  assert.equal(await service.suggestFreight(uuid(9000),'Município sem classificação','Centro'),null);
  assert.deepEqual(calls[0],{name:'pamda_sugerir_frete_endereco',args:{p_city:'Curitiba',p_neighborhood:'Centro'}});
  await assert.rejects(()=>service.suggestFreight(uuid(9000),'','Centro'),/Cidade e bairro/);
});

test('frete só anuncia sucesso após reler o valor salvo; RPC usa identidade e argumentos oficiais', async () => {
  const calls: { name: string; args: any }[] = []; let current = context(); let denied = false;
  const client = { from: (table: string) => {
    const request = { select: () => request, eq: () => request, order: () => request,
      maybeSingle: async () => ({ data: customerRow(), error: null }), range: async () => ({ data: table === 'customer_branches' ? [branchRow()] : [], error: null, count: 1 }) };
    return request;
  }, auth: { getUser: async () => ({ data: { user: { id: uuid(9000) } } }) }, rpc: async (name: string, args: any) => {
    calls.push({ name, args });
    if (denied) return { data: null, error: { code: '42501' } };
    if (name === 'pamda_salvar_frete_filial') current = context({ branch_shipping_fee_override: args.p_amount, effective_shipping_fee: args.p_amount });
    return { data: name === 'pamda_contexto_comercial_cliente' ? current : null, error: null };
  } } as unknown as SupabaseClient;
  const service = new CoreService(client);
  assert.equal((await service.saveFreight(uuid(9000), uuid(1), uuid(1001), 'branch', 0, 'Entrega retirada')).effectiveShippingCents, 0);
  assert.deepEqual(calls[0], { name: 'pamda_salvar_frete_filial', args: { p_branch_id: uuid(1001), p_amount: 0, p_reason: 'Entrega retirada' } });
  await assert.rejects(() => service.saveFreight(uuid(9000), uuid(1), uuid(1001), 'customer', 999, 'Aprovado'), /não confirmou/);
  denied = true; await assert.rejects(() => service.saveFreight(uuid(9000), uuid(1), uuid(1001), 'branch', 100, 'Teste'), /permissão/);
  await assert.rejects(() => service.context(uuid(9001), uuid(1), uuid(1001)), /sessão mudou/);
});

test('pendência legada sem número é consultável e código oficial vem de snapshot.code preservado', async () => {
  const { user, service, backend } = pendingBackend();
  const id = await service.start(user.id, uuid(1), uuid(1001), uuid(8000));
  backend.sales[0].order_number = null;
  backend.sales[0].customer_snapshot = { code: ' 000001-A ', name: 'Legado' };
  const rows = await service.list(user.id);
  assert.equal(rows[0].order_number, null); assert.equal(rows[0].first_product_at, null);
  assert.equal(saleCustomerCode(rows[0]), ' 000001-A ');
  assert.equal(saleCustomerCode({ ...rows[0], customer_snapshot: { customer_code: '000002' } }), '000002');
  assert.equal(saleCustomerCode({ ...rows[0], customer_snapshot: { code: 12 } }), '');
  assert.equal(preparationFromSale(user.id, await service.details(user.id, id)).remote?.orderNumber, null);
  assert.equal((await service.progress(user.id, id)).orderNumber, null);
});

test('edição rejeita retorno com código alterado ou filial de outro cliente', async () => {
  const row = customerRow(), branch = branchRow();
  const update = { id: row.id, expectedCustomerCode: row.customer_code, expectedUpdatedAt: row.updated_at, changes: { phone: 'novo' }, branches: [] };
  let response: unknown = { customer: { ...row, customer_code: '1' }, branches: [branch] };
  const client = { auth: { getUser: async () => ({ data: { user: { id: uuid(9000) } } }) }, rpc: async () => ({ data: response, error: null }) } as unknown as SupabaseClient;
  const service = new CustomersService(client);
  await assert.rejects(() => service.update(update), /cadastro esperado/);
  response = { customer: row, branches: [{ ...branch, customer_id: uuid(2) }] };
  await assert.rejects(() => service.update(update), /cadastro esperado/);
});

test('novos perfis válidos não ganham permissão financeira nem comercial pelo nome do perfil', () => {
  for (const role of ['financeiro', 'estoque_expedicao'] as const) {
    const user = mapUserProfile(uuid(9000), { user_id: uuid(9000), username: 'Funcionario', role, active: true, can_view_financial_metrics: false });
    assert.equal(user?.role, role); assert.equal(user?.canViewFinancialMetrics, false); assert.equal(user?.canReadCustomers, false);
  }
});

test('salvamento aguarda o contexto comercial e não envia frete antigo ao trocar cliente ou unidade', async () => {
  const { user, service, backend } = pendingBackend();
  const store = new PreparationStore(user.id, 'synthetic', null);
  store.update({ ...emptySalePreparation(user.id), customerId: uuid(1), branchId: uuid(1001), commercialDefaultsPending: true,
    remote: { draftKey: uuid(8000), saleId: null, initialCustomerId: uuid(1), initialBranchId: uuid(1001), savedFingerprint: null, status: 'draft', orderNumber: null, firstProductAt: null } });
  const sync = new PendingDraftSync(store, service, () => true);
  await sync.activate();
  assert.equal(await sync.flush(), false); assert.equal(backend.writes.length, 0);
  store.update(previous => ({ ...previous, commercialDefaultsPending: false, pricing: { ...previous.pricing, freight: '0,00' } }));
  assert.equal(await sync.flush(), true);
  assert.equal(backend.sales.length, 1); assert.equal(backend.sales[0].shipping_charged, 0);
  sync.dispose();
});

test('recuperação após interrupção inicial preserva frete confirmado e respeita limpeza manual explícita', async () => {
  for (const manualFreight of [false, true]) {
    const { user, service, backend } = pendingBackend();
    const id = await service.start(user.id, uuid(1), uuid(1001), uuid(8000));
    Object.assign(backend.sales[0], { shipping_charged: 12.5, shipping_confirmed: true, total: 12.5 });
    const store = new PreparationStore(user.id, 'synthetic', null);
    const draft = emptySalePreparation(user.id);
    store.update({ ...draft, customerId: uuid(1), branchId: uuid(1001), pricing: { ...draft.pricing, freight: '', manualFreight },
      remote: { draftKey: uuid(8000), saleId: id, initialCustomerId: uuid(1), initialBranchId: uuid(1001), savedFingerprint: null, status: 'draft', orderNumber: 10000, firstProductAt: null } });
    const sync = new PendingDraftSync(store, service, () => true);
    await sync.activate(); assert.equal(await sync.flush(), true);
    assert.equal(store.getSnapshot().pricing.freight, manualFreight ? '' : '12,5');
    assert.equal(backend.sales[0].shipping_confirmed, !manualFreight);
    assert.equal(backend.sales[0].shipping_charged, manualFreight ? 0 : 12.5);
    sync.dispose();
  }
});
