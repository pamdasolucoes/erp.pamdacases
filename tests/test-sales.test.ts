import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { TestSalesService, validateTestPayments } from '../src/services/testSales';
import type { TestPaymentInput } from '../src/types/testSales';
import { uuid } from './fixtures/customerRows';

const userId=uuid(9000),saleId=uuid(9001),requestKey=uuid(9002),paymentId=uuid(9003);
function service(respond:(url:URL,method:string,body:unknown)=>unknown){
  const requests:{url:string;method:string;body:unknown}[]=[];
  const client=createClient('https://synthetic.invalid','synthetic-public-key',{
    auth:{persistSession:false,autoRefreshToken:false},
    global:{fetch:async(input,init)=>{
      const url=new URL(String(input)),method=init?.method||'GET',body=init?.body?JSON.parse(String(init.body)):null;
      requests.push({url:url.pathname,method,body});
      return new Response(JSON.stringify(respond(url,method,body)),{status:200,headers:{'content-type':'application/json'}});
    }},
  });
  client.auth.getUser=async()=>({data:{user:{id:userId} as never},error:null});
  return {service:new TestSalesService(client),requests};
}

test('valida soma em centavos, canais, agendamentos e bloqueia precisão e pagamentos Site pagos',()=>{
  const payments:TestPaymentInput[]=[
    {method_code:'credito_cliente',amount:25,status:'paid',channel:'erp'},
    {method_code:'pix',amount:15,status:'pending',channel:'site'},
  ];
  assert.deepEqual(validateTestPayments(payments,4000),payments);
  assert.throws(()=>validateTestPayments([{...payments[0],amount:25.001}],2501),/Revise/);
  assert.throws(()=>validateTestPayments([{...payments[1],status:'paid'}],1500),/site/i);
  assert.throws(()=>validateTestPayments([{...payments[1],status:'scheduled'}],1500),/data e hora/);
  assert.equal(validateTestPayments([{...payments[1],status:'scheduled',scheduled_for:'2026-11-01T12:00:00.000Z'}],1500)[0].scheduled_for,'2026-11-01T12:00:00.000Z');
  assert.throws(()=>validateTestPayments([{...payments[0],amount:25}],4000),/corresponder exatamente/);
});

test('finalização usa somente a RPC de teste e transmite pagamentos e chave idempotente',async()=>{
  const fake=service(url=>url.pathname.endsWith('/pamda_finalizar_venda_teste')?{sale_id:saleId,is_test:true}:null);
  const payments:TestPaymentInput[]=[
    {method_code:'credito_cliente',amount:25,status:'paid',channel:'erp'},
    {method_code:'pix',amount:15,status:'pending',channel:'site'},
  ];
  await fake.service.finalize(userId,saleId,payments,requestKey,4000);
  assert.deepEqual(fake.requests.map(request=>request.url),['/rest/v1/rpc/pamda_finalizar_venda_teste']);
  assert.deepEqual(fake.requests[0].body,{p_sale_id:saleId,p_payments:payments,p_request_key:requestKey});
});

test('crédito usa RPC autorizada e não acessa ledger diretamente',async()=>{
  const ledgerId=uuid(9010);
  const fake=service(url=>url.pathname.endsWith('/pamda_conceder_credito_teste')?ledgerId:null);
  assert.equal(await fake.service.grantCredit(userId,{customerId:uuid(1),amountCents:2500,reason:'Devolução em homologação',reference:'OC-42',requestKey}),ledgerId);
  assert.deepEqual(fake.requests.map(request=>request.url),['/rest/v1/rpc/pamda_conceder_credito_teste']);
  assert.deepEqual(fake.requests[0].body,{p_customer_id:uuid(1),p_amount:25,p_reason:'Devolução em homologação',p_request_key:requestKey,p_reference:'OC-42'});
});

test('confirmação manual relê pagamento; não informa sucesso sem status pago confirmado',async()=>{
  let status='pending';
  const fake=service((url,method)=>{
    if(url.pathname.endsWith('/pamda_confirmar_pagamento_teste')){status='paid';return null;}
    if(url.pathname==='/rest/v1/erp_sale_test_payments')return {id:paymentId,status};
    return null;
  });
  await fake.service.confirmPayment(userId,paymentId,'Referência conferida');
  assert.equal(fake.requests[0].url,'/rest/v1/rpc/pamda_confirmar_pagamento_teste');
  assert.deepEqual(fake.requests[0].body,{p_payment_id:paymentId,p_reference:'Referência conferida'});
  assert.equal(fake.requests[1].method,'GET');
});

test('identidade divergente impede qualquer RPC',async()=>{
  const fake=service(()=>null);
  fake.service=new TestSalesService({
    auth:{getUser:async()=>({data:{user:{id:uuid(9999)} as never},error:null})},
  } as never);
  await assert.rejects(()=>fake.service.finalize(userId,saleId,[{method_code:'pix',amount:40,status:'pending',channel:'erp'}],requestKey,4000),/sessão mudou/);
  assert.equal(fake.requests.length,0);
});
