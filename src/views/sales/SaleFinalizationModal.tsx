import React,{useRef,useState} from 'react';
import type {PaymentCatalog} from '../../types/payments';
import type {SaleDetails} from '../../types/pendingSales';
import type {ReceiptDocumentData} from '../../types/receipt';
import {realSales,type RealPaymentInput} from '../../services/realSales';
import {pendingSalesService} from '../../services/saleWorkspace';
import {productCatalog} from '../../services/catalogResources';
import {money} from '../../services/operations';
import type {TestPaymentDraft} from '../../types/testSales';
import {parsePriceInput} from '../../services/salePricing';
export function SaleFinalizationModal({userId,details,catalog,initialPayments,onClose,onCompleted}:{userId:string;details:SaleDetails;catalog:PaymentCatalog;initialPayments?:TestPaymentDraft[];onClose():void;onCompleted(details:SaleDetails):void}){
 const methods=catalog.methods.filter(m=>m.active&&m.code!=='credito_cliente');
 const [payments,setPayments]=useState(()=>initialPayments?.length?initialPayments.map(p=>({method_code:p.methodCode,amount:String((parsePriceInput(p.amount)??0)/100)})):[{method_code:methods[0]?.code||'',amount:String(details.sale.total)}]);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');const key=useRef(crypto.randomUUID());
 const sum=payments.reduce((s,p)=>s+Math.round(Number(p.amount)*100),0),total=Math.round(Number(details.sale.total)*100);
 async function submit(e:React.FormEvent){e.preventDefault();if(busy)return;setBusy(true);setError('');try{
  if(sum!==total)throw new Error('A soma dos pagamentos deve corresponder ao total.');
  const inputs:RealPaymentInput[]=payments.map(p=>({method_code:p.method_code,amount:Number(p.amount),status:'paid',channel:'erp'}));
  await realSales.finalize(userId,details.sale.id,inputs,key.current);
  const confirmed=await pendingSalesService.details(userId,details.sale.id);
  if(confirmed.sale.status!=='confirmed')throw new Error('O servidor ainda não confirmou a finalização.');productCatalog.invalidate();onCompleted(confirmed);
 }catch(e){setError(e instanceof Error?e.message:'Finalização não confirmada. Tente novamente.');}finally{setBusy(false);}}
 const change=(index:number,field:string,value:string)=>setPayments(rows=>rows.map((row,i)=>i===index?{...row,[field]:value}:row));
 return <div className="fixed inset-0 z-50 bg-slate-900/60 p-5 flex items-center justify-center"><form onSubmit={submit} role="dialog" aria-modal="true" aria-label="Finalizar venda" className="w-full max-w-3xl max-h-[90vh] overflow-auto bg-white rounded-2xl p-6 space-y-4"><h2 className="font-black text-xl">Finalizar pedido {details.sale.order_number}</h2><p>Total: <strong>{money(details.sale.total)}</strong></p><p className="text-sm text-slate-600">A confirmação registra o contas a receber, baixa o estoque e envia o pedido à produção. Todos os pagamentos serão registrados como recebidos. Confirme somente após conferir o recebimento. A falta de estoque não bloqueia o fechamento; o saldo negativo ficará registrado para conferência.</p>
 <fieldset disabled={busy} className="space-y-4">{payments.map((p,index)=><div key={index} className="grid sm:grid-cols-2 gap-3 border rounded-xl p-3"><label>Forma<select className="w-full border rounded-lg p-2" value={p.method_code} required onChange={e=>change(index,'method_code',e.target.value)}>{methods.map(m=><option key={m.code} value={m.code}>{m.name}</option>)}</select></label><label>Valor (R$)<input type="number" min="0.01" step="0.01" required className="w-full border rounded-lg p-2" value={p.amount} onChange={e=>change(index,'amount',e.target.value)}/></label>{payments.length>1&&<button type="button" className="underline" onClick={()=>setPayments(rows=>rows.filter((_,i)=>i!==index))}>Remover pagamento</button>}</div>)}<button type="button" className="underline" onClick={()=>setPayments(rows=>[...rows,{method_code:methods[0]?.code||'',amount:''}])}>Adicionar pagamento</button></fieldset>
 <p>Soma: {money(sum/100)}</p>{error&&<p role="alert" className="text-rose-800">{error}</p>}<footer className="flex gap-3 justify-end"><button type="button" onClick={onClose} disabled={busy}>Voltar</button><button className="rounded-xl bg-blue-700 text-white px-4 py-2 font-bold disabled:opacity-50" disabled={busy||sum!==total||!methods.length}>{busy?'Confirmando…':'Confirmar venda'}</button></footer></form></div>;
}
