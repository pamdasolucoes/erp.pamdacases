import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CustomerSalesHistoryService, type OfficialSaleHistory } from '../src/services/customerSalesHistory';
import { uuid } from './fixtures/customerRows';

const sale = (index: number): OfficialSaleHistory => ({ id:uuid(index + 5000),customer_id:uuid(1),receipt_number:String(index),sold_at:'2026-10-15T12:00:00Z',branch_name:null,total_amount:10,payment_status:'Aguardando',production_status:'Pendente',delivery_status:'Pendente',items:[{ product_name:'Produto real',quantity:1,unit_price:10 }] });
function fake(options: { probe?: string; rpc?: string; authenticated?: boolean; malformed?: boolean; wrongCustomer?: boolean; total?: number } = {}) {
  const calls: any[] = [];
  const client = {
    auth:{ getUser:async()=>({ data:{ user: options.authenticated === false ? null : { id:uuid(9) } } }) },
    from(table: string) { calls.push(table); return { select:()=>({ limit:()=>Promise.resolve({ error: options.probe ? { code:options.probe } : null }) }) }; },
    rpc(name: string, params: any) {
      calls.push(params); assert.equal(name,'pamda_customer_sales_history'); assert.equal(params.p_customer_id,uuid(1));
      const total = options.total ?? 1;
      const rows = Array.from({ length:total },(_,index)=>sale(index)).slice(params.p_offset,params.p_offset + Math.min(37,params.p_limit));
      if (options.wrongCustomer && rows.length) rows[0].customer_id=uuid(2);
      return Promise.resolve({ data:{ contract_version:options.malformed ? 99 : 1, customer_id:uuid(1), total, rows },error:options.rpc ? { code:options.rpc } : null });
    },
  } as unknown as SupabaseClient;
  return { client,calls };
}
test('sem tabela ou contrato oficial nao apresenta historico de demonstracao', async () => {
  assert.deepEqual(await new CustomerSalesHistoryService(fake({ probe:'PGRST205' }).client).list(uuid(1)),{ integrated:false });
  assert.deepEqual(await new CustomerSalesHistoryService(fake({ rpc:'PGRST202' }).client).list(uuid(1)),{ integrated:false });
});
test('historico real pagina com UUID e suporta limite de linhas inferior ao pedido', async () => {
  const backend=fake({ total:238 }); const result=await new CustomerSalesHistoryService(backend.client).list(uuid(1));
  assert.ok(result.integrated); assert.equal(result.sales.length,238);
  assert.equal(backend.calls[2].p_offset,37);
});
test('historico vazio so aparece depois de confirmar o contrato oficial', async () => {
  assert.deepEqual(await new CustomerSalesHistoryService(fake({ total:0 }).client).list(uuid(1)),{ integrated:true,sales:[] });
});
test('permissao, rede, contrato invalido e cliente diferente geram erro sem fallback', async () => {
  for (const options of [{ probe:'42501' },{ probe:'network' },{ rpc:'42501' },{ malformed:true },{ wrongCustomer:true }]) await assert.rejects(new CustomerSalesHistoryService(fake(options).client).list(uuid(1)));
  const backend=fake({ authenticated:false });
  await assert.rejects(new CustomerSalesHistoryService(backend.client).list(uuid(1)),/Sessão/);
  assert.equal(backend.calls.length,0);
});
