import React,{useRef,useState} from 'react';
import type {PaymentCatalog} from '../../types/payments';
import type {SaleDetails} from '../../types/pendingSales';
import type {ReceiptDocumentData} from '../../types/receipt';
import {realSales,type RealPaymentInput} from '../../services/realSales';
import {pendingSalesService} from '../../services/saleWorkspace';
import {authService} from '../../services/auth';
import {productCatalog} from '../../services/catalogResources';
import {money} from '../../services/operations';
import type {TestPaymentDraft} from '../../types/testSales';
import {parsePriceInput} from '../../services/salePricing';
export function SaleFinalizationModal({userId,details,catalog,initialPayments,onClose,onCompleted}:{userId:string;details:SaleDetails;catalog:PaymentCatalog;initialPayments?:TestPaymentDraft[];onClose():void;onCompleted(details:SaleDetails,receipt:ReceiptDocumentData):void}){
 const methods=catalog.methods.filter(m=>m.active&&m.code!=='credito_cliente');
 const [payments,setPayments]=useState(()=>initialPayments?.length?initialPayments.map(p=>({method_code:p.methodCode,amount:String((parsePriceInput(p.amount)??0)/100),status:p.status,scheduled_for:p.scheduledFor,reference:''})):[{method_code:methods[0]?.code||'',amount:String(details.sale.total),status:'pending',scheduled_for:'',reference:''}]);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');const key=useRef(crypto.randomUUID());
 const user=authService.getCurrentUser();const canReceive=user?.role==='admin_gerencial'||user?.permissions?.['finance.manage'];
 const sum=payments.reduce((s,p)=>s+Math.round(Number(p.amount)*100),0),total=Math.round(Number(details.sale.total)*100);
 async function submit(e:React.FormEvent){e.preventDefault();if(busy)return;setBusy(true);setError('');try{
  if(sum!==total)throw new Error('A soma dos pagamentos deve corresponder ao total.');
  const inputs:RealPaymentInput[]=payments.map(p=>({method_code:p.method_code,amount:Number(p.amount),status:p.status as RealPaymentInput['status'],channel:'erp',...(p.status==='scheduled'?{scheduled_for:new Date(p.scheduled_for).toISOString()}:{}),reference:p.reference}));
  await realSales.finalize(userId,details.sale.id,inputs,key.current);
  const confirmed=await pendingSalesService.details(userId,details.sale.id);
  const receipt=await realSales.receipt(userId,confirmed);productCatalog.invalidate();onCompleted(confirmed,receipt);
 }catch(e){setError(e instanceof Error?e.message:'Finalização não confirmada. Tente novamente.');}finally{setBusy(false);}}
 const change=(index:number,field:string,value:string)=>setPayments(rows=>rows.map((row,i)=>i===index?{...row,[field]:value}:row));
 return <div className="fixed inset-0 z-50 bg-slate-900/60 p-5 flex items-center justify-center"><form onSubmit={submit} role="dialog" aria-modal="true" aria-label="Finalizar venda" className="w-full max-w-3xl max-h-[90vh] overflow-auto bg-white rounded-2xl p-6 space-y-4"><h2 className="font-black text-xl">Finalizar pedido {details.sale.order_number}</h2><p>Total: <strong>{money(details.sale.total)}</strong></p><p className="text-sm text-slate-600">A confirmação registra o contas a receber, baixa o estoque e envia o pedido à produção. Marque como pago somente os valores já recebidos.</p>
 <fieldset disabled={busy} className="space-y-4">{payments.map((p,index)=><div key={index} className="grid sm:grid-cols-2 gap-3 border rounded-xl p-3"><label>Forma<select className="w-full border rounded-lg p-2" value={p.method_code} required onChange={e=>change(index,'method_code',e.target.value)}>{methods.map(m=><option key={m.code} value={m.code}>{m.name}</option>)}</select></label><label>Valor (R$)<input type="number" min="0.01" step="0.01" required className="w-full border rounded-lg p-2" value={p.amount} onChange={e=>change(index,'amount',e.target.value)}/></label><label>Situação<select className="w-full border rounded-lg p-2" value={p.status} onChange={e=>change(index,'status',e.target.value)}><option value="pending">Pendente</option><option value="scheduled">Agendado</option>{canReceive&&<option value="paid">Recebido</option>}</select></label>{p.status==='scheduled'&&<label>Data agendada<input type="datetime-local" required className="w-full border rounded-lg p-2" value={p.scheduled_for} onChange={e=>change(index,'scheduled_for',e.target.value)}/></label>}{p.status==='paid'&&<label>Comprovante / referência<input required minLength={3} className="w-full border rounded-lg p-2" value={p.reference} onChange={e=>change(index,'reference',e.target.value)}/></label>}{payments.length>1&&<button type="button" className="underline" onClick={()=>setPayments(rows=>rows.filter((_,i)=>i!==index))}>Remover pagamento</button>}</div>)}<button type="button" className="underline" onClick={()=>setPayments(rows=>[...rows,{method_code:methods[0]?.code||'',amount:'',status:'pending',scheduled_for:'',reference:''}])}>Adicionar pagamento</button></fieldset>
 <p>Soma: {money(sum/100)}</p>{error&&<p role="alert" className="text-rose-800">{error}</p>}<footer className="flex gap-3 justify-end"><button type="button" onClick={onClose} disabled={busy}>Voltar</button><button className="rounded-xl bg-blue-700 text-white px-4 py-2 font-bold disabled:opacity-50" disabled={busy||sum!==total||!methods.length}>{busy?'Confirmando…':'Confirmar venda'}</button></footer></form></div>;
}
