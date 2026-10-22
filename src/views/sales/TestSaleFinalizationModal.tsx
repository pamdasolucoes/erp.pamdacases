import React,{useEffect,useMemo,useRef,useState} from 'react';
import {X,Plus,Trash2} from 'lucide-react';
import type {PaymentCatalog} from '../../types/payments';
import type {TestPaymentInput,TestPaymentStatus,TestPaymentChannel,TestPaymentRecord,TestReceiptRecord} from '../../types/testSales';
import type {TestPaymentDraft} from '../../types/testSales';
import type {ReceiptDocumentData} from '../../types/receipt';
import type {SaleDetails} from '../../types/pendingSales';
import {pendingSalesService} from '../../services/saleWorkspace';
import {testSalesService,validateTestPayments} from '../../services/testSales';
import {testReceiptDocument} from '../../services/testReceipt';
import {formatMoney,parsePriceInput,centsInput} from '../../services/salePricing';
import {dbCents} from '../../services/pendingSaleMapping';

const statusLabels:Record<TestPaymentStatus,string>={pending:'Pendente',scheduled:'Agendado',paid:'Pago no ambiente de teste'};
const methodOrder=['pix','dinheiro','credito_cliente','cartao_debito','cartao_credito','boleto'];
const newPayment=(methodCode:string,amount:string):TestPaymentDraft=>({methodCode,amount,status:'pending',channel:'erp',scheduledFor:''});

export function TestSaleFinalizationModal({userId,details,catalog,initialPayments,onClose,onCompleted}:{userId:string;details:SaleDetails;catalog:PaymentCatalog;initialPayments?:TestPaymentDraft[];onClose():void;onCompleted(details:SaleDetails,receipt:ReceiptDocumentData,payments:TestPaymentRecord[]):void}){
  const {sale,items}=details;
  const totalCents=dbCents(sale.total);
  const activeMethods=useMemo(()=>catalog.methods.filter(method=>method.active).sort((a,b)=>{
    const ai=methodOrder.indexOf(a.code),bi=methodOrder.indexOf(b.code);
    return (ai<0?methodOrder.length:ai)-(bi<0?methodOrder.length:bi)||a.name.localeCompare(b.name);
  }),[catalog.methods]);
  const [payments,setPayments]=useState<TestPaymentDraft[]>(()=>initialPayments?.length?structuredClone(initialPayments):[newPayment(activeMethods.find(method=>method.code==='pix')?.code||activeMethods[0]?.code||'',centsInput(totalCents))]);
  const [creditBalance,setCreditBalance]=useState<number|null>(null),[creditLoading,setCreditLoading]=useState(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const requestKey=useRef(crypto.randomUUID());
  const amountCents=payments.map(payment=>parsePriceInput(payment.amount));
  const currentTotal=amountCents.some(amount=>amount===null)?null:amountCents.reduce<number>((sum,amount)=>sum+amount!,0);
  const usesCredit=payments.some(payment=>payment.methodCode==='credito_cliente');
  useEffect(()=>{
    if(!usesCredit){setCreditBalance(null);return;}
    let alive=true;setCreditLoading(true);setError('');
    void testSalesService.creditBalance(userId,sale.customer_id).then(value=>{if(alive)setCreditBalance(value);},reason=>{if(alive){setCreditBalance(null);setError(reason instanceof Error?reason.message:'Não foi possível consultar o crédito de teste.');}}).finally(()=>{if(alive)setCreditLoading(false);});
    return()=>{alive=false;};
  },[userId,sale.customer_id,usesCredit]);
  function change(index:number,patch:Partial<TestPaymentDraft>){
    setPayments(rows=>rows.map((row,rowIndex)=>rowIndex===index?{...row,...patch}:row));
  }
  function addPayment(){
    setPayments(rows=>[...rows,newPayment(activeMethods.find(method=>!rows.some(row=>row.methodCode===method.code))?.code||activeMethods[0]?.code||'', '0,00')]);
  }
  async function finalize(){
    setError('');
    if(sale.status!=='draft'||sale.order_number===null||items.length===0||sale.first_product_at===null||!sale.shipping_confirmed||sale.shipping_charged===null){
      setError('A venda precisa ter número, produto salvo e frete confirmado antes da finalização de teste.');return;
    }
    if(currentTotal!==totalCents){setError('A soma dos pagamentos deve corresponder exatamente ao total da venda.');return;}
    let inputs:TestPaymentInput[];
    try{
      inputs=validateTestPayments(payments.map(payment=>{
        const amount=parsePriceInput(payment.amount);
        if(amount===null)throw new Error('Informe valores válidos nos pagamentos.');
        if(payment.methodCode==='credito_cliente'&&(payment.status!=='paid'||payment.channel!=='erp'))throw new Error('O crédito do cliente é aplicado como pago no ambiente de teste e pelo canal ERP.');
        return {method_code:payment.methodCode,amount:amount/100,status:payment.status,channel:payment.channel,
          ...(payment.status==='scheduled'?{scheduled_for:new Date(payment.scheduledFor).toISOString()}: {})};
      }),totalCents);
    }catch(reason){setError(reason instanceof Error?reason.message:'Revise os pagamentos.');return;}
    const creditCents=inputs.filter(payment=>payment.method_code==='credito_cliente').reduce((sum,payment)=>sum+Math.round(payment.amount*100),0);
    if(creditCents>0&&(creditBalance===null||creditLoading||creditCents>creditBalance)){setError('O crédito de teste disponível é insuficiente ou não foi confirmado.');return;}
    if(!window.confirm(`Finalizar o pedido Nº ${sale.order_number} em modo TESTE por ${formatMoney(totalCents)}? Nenhum estoque ou financeiro real será movimentado.`))return;
    setBusy(true);
    try{
      await testSalesService.finalize(userId,sale.id,inputs,requestKey.current,totalCents);
      const [confirmed,receiptRecord,paymentRecords]=await Promise.all([
        pendingSalesService.details(userId,sale.id),testSalesService.receipt(userId,sale.id),testSalesService.payments(userId,sale.id),
      ]);
      if(confirmed.sale.status!=='confirmed'||confirmed.sale.is_test!==true)throw new Error('O servidor não confirmou a venda como concluída em modo de teste.');
      const receipt=testReceiptDocument(confirmed,receiptRecord);
      onCompleted(confirmed,receipt,paymentRecords);
    }catch(reason){setError(reason instanceof Error?reason.message:'Não foi possível confirmar a finalização de teste. A mesma chave de idempotência será mantida nesta tentativa.');}
    finally{setBusy(false);}
  }
  return <div className="fixed inset-0 z-[70] bg-slate-900/60 p-3 sm:p-6 flex items-center justify-center">
    <section role="dialog" aria-modal="true" aria-label="Finalizar venda - TESTE" className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white p-5 space-y-5">
      <header className="flex justify-between gap-3"><div><h2 className="text-lg font-black">Finalizar venda - TESTE</h2><p className="text-sm text-amber-800">Pedido Nº {sale.order_number?.toLocaleString('pt-BR')} · DOCUMENTO DE TESTE - SEM VALOR FISCAL</p></div><button type="button" aria-label="Fechar finalização" disabled={busy} onClick={onClose}><X className="w-5 h-5"/></button></header>
      <section className="rounded-xl bg-slate-50 p-4 space-y-2"><h3 className="font-bold text-sm">Resumo da venda</h3><div className="max-h-36 overflow-auto">{items.map(item=><p key={item.id} className="flex justify-between gap-3 text-xs"><span>{item.product_code_snapshot} · {item.description_snapshot} × {String(item.quantity)}</span><strong>{formatMoney(dbCents(item.line_subtotal))}</strong></p>)}</div><p className="flex justify-between text-sm"><span>Subtotal</span><span>{formatMoney(dbCents(sale.subtotal))}</span></p>{dbCents(sale.discount_amount)>0&&<p className="flex justify-between text-sm"><span>Desconto</span><span>− {formatMoney(dbCents(sale.discount_amount))}</span></p>}<p className="flex justify-between text-sm"><span>Frete confirmado</span><span>{formatMoney(dbCents(sale.shipping_charged))}</span></p><p className="flex justify-between border-t pt-2 font-black"><span>TOTAL</span><span>{formatMoney(totalCents)}</span></p></section>
      <fieldset disabled={busy} className="space-y-3"><legend className="font-bold text-sm">Divisão dos pagamentos</legend>{payments.map((payment,index)=>{
        const chosen=activeMethods.find(method=>method.code===payment.methodCode);
        return <div key={index} className="grid sm:grid-cols-12 gap-2 items-end rounded-xl border p-3">
          <label className="sm:col-span-4 text-xs font-bold">Forma<select aria-label={`Forma de pagamento ${index+1}`} value={payment.methodCode} onChange={event=>{const methodCode=event.target.value;change(index,methodCode==='credito_cliente'?{methodCode,status:'paid',channel:'erp'}:{methodCode});}} className="mt-1 w-full rounded-lg border p-2 text-sm font-normal">{activeMethods.map(method=><option key={method.id} value={method.code}>{method.name}</option>)}</select></label>
          <label className="sm:col-span-2 text-xs font-bold">Valor (R$)<input aria-label={`Valor do pagamento ${index+1}`} inputMode="decimal" value={payment.amount} onChange={event=>change(index,{amount:event.target.value})} className="mt-1 w-full rounded-lg border p-2 text-sm font-normal"/></label>
          <label className="sm:col-span-3 text-xs font-bold">Status<select aria-label={`Status do pagamento ${index+1}`} value={payment.status} onChange={event=>change(index,{status:event.target.value as TestPaymentStatus})} className="mt-1 w-full rounded-lg border p-2 text-sm font-normal">{(payment.methodCode==='credito_cliente'?['paid']:payment.channel==='site'?['pending','scheduled']:['pending','scheduled','paid']).map(status=><option key={status} value={status}>{statusLabels[status as TestPaymentStatus]}</option>)}</select></label>
          <label className="sm:col-span-2 text-xs font-bold">Canal<select aria-label={`Canal do pagamento ${index+1}`} value={payment.channel} onChange={event=>{const channel=event.target.value as TestPaymentChannel;change(index,{channel,...(channel==='site'&&payment.status==='paid'?{status:'pending' as const}:{})});}} className="mt-1 w-full rounded-lg border p-2 text-sm font-normal"><option value="erp">ERP</option><option value="site" disabled={payment.methodCode==='credito_cliente'}>Site</option></select></label>
          <button type="button" aria-label={`Remover pagamento ${index+1}`} disabled={payments.length===1} onClick={()=>setPayments(rows=>rows.filter((_row,rowIndex)=>rowIndex!==index))} className="sm:col-span-1 p-2 text-rose-700 disabled:opacity-30"><Trash2 className="w-4 h-4"/></button>
          {payment.status==='scheduled'&&<label className="sm:col-span-6 text-xs font-bold">Agendado para<input aria-label={`Data agendada do pagamento ${index+1}`} type="datetime-local" value={payment.scheduledFor} onChange={event=>change(index,{scheduledFor:event.target.value})} className="mt-1 w-full rounded-lg border p-2 text-sm font-normal"/></label>}
          {payment.methodCode==='credito_cliente'&&<p className="sm:col-span-12 text-xs text-amber-900">{creditLoading?'Consultando crédito de teste…':creditBalance===null?'Crédito de teste indisponível':`Saldo disponível: ${formatMoney(creditBalance)}`}</p>}
          {payment.channel==='site'&&payment.status!=='paid'&&<p className="sm:col-span-12 text-xs text-slate-600">O canal Site permanece pendente/agendado até confirmação futura por webhook; o navegador não pode marcá-lo como pago.</p>}
          <span className="sr-only">{chosen?.name}</span>
        </div>;
      })}
      <div className="flex flex-wrap items-center justify-between gap-2"><button type="button" onClick={addPayment} disabled={!activeMethods.length} className="inline-flex items-center gap-1 text-xs font-bold text-blue-700"><Plus className="w-4 h-4"/>Adicionar pagamento</button><p className={`text-sm font-bold ${currentTotal===totalCents?'text-emerald-800':'text-rose-800'}`}>Soma: {currentTotal===null?'Valores inválidos':formatMoney(currentTotal)} · Total: {formatMoney(totalCents)}</p></div>
      </fieldset>
      {!activeMethods.length&&<p role="alert" className="text-sm text-rose-800">Nenhuma forma de pagamento ativa foi retornada pelo catálogo oficial.</p>}
      {error&&<p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      <p className="text-xs text-slate-500">A confirmação é apenas de homologação. Não cria cobrança Pix real, não movimenta estoque nem financeiro real.</p>
      <footer className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">Voltar</button><button type="button" disabled={busy||!activeMethods.length||currentTotal!==totalCents||creditLoading} onClick={()=>void finalize()} className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy?'Confirmando no PAMDA CORE…':'Finalizar venda - TESTE'}</button></footer>
    </section>
  </div>;
}
