import type {SupabaseClient} from '@supabase/supabase-js';
import type {TestPaymentChannel,TestPaymentInput,TestPaymentRecord,TestPaymentStatus,TestReceiptRecord} from '../types/testSales';
import {dbCents} from './pendingSaleMapping';
import {isUuid} from './customerEdits';
import {saleError} from './pendingSales';
import {supabase} from './supabase';

const paymentStatuses:readonly TestPaymentStatus[]=['pending','scheduled','paid'];
const paymentChannels:readonly TestPaymentChannel[]=['erp','site'];
function object(value:unknown):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Resposta de homologação incompatível com o contrato.');
  return value as Record<string,unknown>;
}
function numericId(value:unknown):number{
  const number=typeof value==='number'?value:typeof value==='string'&&/^\d+$/.test(value)?Number(value):NaN;
  if(!Number.isSafeInteger(number)||number<10000)throw new Error('Número do recibo de teste inválido.');
  return number;
}
export function validateTestPayments(payments:readonly TestPaymentInput[],totalCents:number):TestPaymentInput[]{
  if(!payments.length||!Number.isSafeInteger(totalCents)||totalCents<0)throw new Error('Adicione os pagamentos para cobrir o total.');
  const normalized=payments.map(payment=>{
    const exactCents=payment.amount*100,roundedCents=Math.round(exactCents);
    if(!payment.method_code.trim()||!Number.isSafeInteger(roundedCents)||!Number.isFinite(exactCents)||
      Math.abs(exactCents-roundedCents)>1e-7||payment.amount<=0||
      !paymentStatuses.includes(payment.status)||!paymentChannels.includes(payment.channel))throw new Error('Revise a forma, o valor e o status dos pagamentos.');
    if(payment.channel==='site'&&payment.status==='paid')throw new Error('Pagamentos do site não podem ser marcados como recebidos pelo ERP.');
    if(payment.status==='scheduled'){
      if(!payment.scheduled_for||!Number.isFinite(Date.parse(payment.scheduled_for)))throw new Error('Informe a data e hora do pagamento agendado.');
    }else if(payment.scheduled_for!==undefined)throw new Error('A data agendada só se aplica ao status agendado.');
    return {...payment,amount:roundedCents/100};
  });
  const sum=normalized.reduce((total,payment)=>total+Math.round(payment.amount*100),0);
  if(sum!==totalCents)throw new Error('A soma dos pagamentos deve corresponder exatamente ao total da venda.');
  return normalized;
}

export class TestSalesService{
  constructor(private client:SupabaseClient|null){}
  private async identity(userId:string){
    if(!this.client)throw new Error('Configure o Supabase PAMDA CORE.');
    const {data,error}=await this.client.auth.getUser();
    if(error||data.user?.id!==userId)throw new Error('A sessão mudou. Valide seu acesso.');
    return this.client;
  }
  async creditBalance(userId:string,customerId:string):Promise<number>{
    if(!isUuid(customerId))throw new Error('Selecione um cliente válido.');
    const client=await this.identity(userId);
    const {data,error}=await client.rpc('pamda_saldo_credito_teste',{p_customer_id:customerId});
    if(error)throw saleError(error);
    return dbCents(data);
  }
  async grantCredit(userId:string,input:{customerId:string;amountCents:number;reason:string;requestKey:string;reference:string|null}):Promise<string>{
    if(!isUuid(input.customerId)||!isUuid(input.requestKey)||!Number.isSafeInteger(input.amountCents)||input.amountCents<=0||!input.reason.trim()||
      input.reference!==null&&input.reference.length>500)throw new Error('Informe valor positivo, motivo e referência válida para o crédito de teste.');
    const client=await this.identity(userId);
    const {data,error}=await client.rpc('pamda_conceder_credito_teste',{
      p_customer_id:input.customerId,p_amount:input.amountCents/100,p_reason:input.reason.trim(),
      p_request_key:input.requestKey,p_reference:input.reference?.trim()||null,
    });
    if(error)throw saleError(error);
    if(typeof data!=='string'||!isUuid(data))throw new Error('O servidor não confirmou o crédito de teste.');
    return data;
  }
  async finalize(userId:string,saleId:string,payments:readonly TestPaymentInput[],requestKey:string,totalCents:number):Promise<unknown>{
    if(!isUuid(saleId)||!isUuid(requestKey))throw new Error('Venda ou chave de idempotência inválida.');
    const validated=validateTestPayments(payments,totalCents);
    const client=await this.identity(userId);
    const {data,error}=await client.rpc('pamda_finalizar_venda_teste',{
      p_sale_id:saleId,p_payments:validated,p_request_key:requestKey,
    });
    if(error)throw saleError(error);
    return data;
  }
  async payments(userId:string,saleId:string):Promise<TestPaymentRecord[]>{
    if(!isUuid(saleId))throw new Error('Venda inválida para consultar pagamentos de teste.');
    const client=await this.identity(userId);
    const {data,error}=await client.from('erp_sale_test_payments').select('*').eq('sale_id',saleId);
    if(error)throw saleError(error);
    if(!Array.isArray(data))throw new Error('O servidor retornou pagamentos de teste em formato inválido.');
    return data.map((value:unknown)=>{
      const row=object(value);
      if(row.sale_id!==saleId||typeof row.method_code!=='string'||
        !paymentStatuses.includes(row.status as TestPaymentStatus)||!paymentChannels.includes(row.channel as TestPaymentChannel)||
        typeof row.id!=='string'||!isUuid(row.id))throw new Error('Pagamento de teste incompatível com o contrato do servidor.');
      const scheduled=row.scheduled_for;
      if(scheduled!==null&&scheduled!==undefined&&(typeof scheduled!=='string'||!Number.isFinite(Date.parse(scheduled))))throw new Error('Data agendada inválida no histórico de pagamentos.');
      const reference=row.reference;
      if(reference!==null&&reference!==undefined&&typeof reference!=='string')throw new Error('Referência de pagamento inválida.');
      return {id:row.id,saleId,methodCode:row.method_code,amountCents:dbCents(row.amount),status:row.status as TestPaymentStatus,
        channel:row.channel as TestPaymentChannel,scheduledFor:typeof scheduled==='string'?scheduled:null,reference:typeof reference==='string'?reference:null};
    });
  }
  async receipt(userId:string,saleId:string):Promise<TestReceiptRecord>{
    if(!isUuid(saleId))throw new Error('Venda inválida para consultar recibo de teste.');
    const client=await this.identity(userId);
    const {data,error}=await client.from('erp_sale_test_receipts')
      .select('receipt_number,sale_id,receipt_snapshot,issued_at').eq('sale_id',saleId).maybeSingle();
    if(error)throw saleError(error);
    if(!data||data.sale_id!==saleId||typeof data.issued_at!=='string'||!Number.isFinite(Date.parse(data.issued_at)))throw new Error('Recibo de teste não encontrado ou incompatível.');
    return {receiptNumber:numericId(data.receipt_number),saleId,receiptSnapshot:object(data.receipt_snapshot),issuedAt:data.issued_at};
  }
  async confirmPayment(userId:string,paymentId:string,reference:string):Promise<void>{
    if(!isUuid(paymentId)||!reference.trim())throw new Error('Informe uma referência ou justificativa para confirmar o pagamento.');
    const client=await this.identity(userId);
    const {error}=await client.rpc('pamda_confirmar_pagamento_teste',{p_payment_id:paymentId,p_reference:reference.trim()});
    if(error)throw saleError(error);
    const {data, error:readError}=await client.from('erp_sale_test_payments').select('*').eq('id',paymentId).maybeSingle();
    if(readError)throw saleError(readError);
    const row=object(data);
    if(row.id!==paymentId||row.status!=='paid')throw new Error('O servidor não confirmou o recebimento do pagamento de teste.');
  }
}
export const testSalesService=new TestSalesService(supabase);
