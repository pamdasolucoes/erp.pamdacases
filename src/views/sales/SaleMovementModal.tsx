import React,{useEffect,useRef,useState} from 'react';
import {coreService} from '../../services/coreService';
import {authService} from '../../services/auth';
import {money,displayDate,type DataRow} from '../../services/operations';
import {realSales} from '../../services/realSales';
import type {SaleDetails} from '../../types/pendingSales';
import type {ReceiptDocumentData} from '../../types/receipt';
import {ReceiptPreviewModal} from '../../components/receipt/ReceiptPreviewModal';

const stateName=(s:string)=>({confirmed:'Confirmada',cancelled:'Cancelada',draft:'Pendente',paid:'Recebido',pending:'Pendente',scheduled:'Agendado',void:'Anulado'}[s]||s);
const eventName=(s:string)=>({sale_finalized:'Venda finalizada',sale_payment_corrected:'Forma de pagamento corrigida',confirmed_sale_cancelled:'Venda fechada cancelada',sale_started:'Pedido iniciado',draft_saved:'Pendência salva',sale_merged:'Pedido mesclado',sale_merge_created:'Mesclagem de pedidos'}[s]||'Evento registrado');
export function SaleMovementModal({saleId,onClose,onChanged}:{saleId:string;onClose():void;onChanged():void}){
 const user=authService.getCurrentUser()!;
 const [data,setData]=useState<DataRow|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const [mode,setMode]=useState<'read'|'payments'|'cancel'>('read'),[reason,setReason]=useState(''),[notice,setNotice]=useState('');
 const [payments,setPayments]=useState<DataRow[]>([]),[receipt,setReceipt]=useState<ReceiptDocumentData|null>(null);
 const request=useRef({signature:'',key:''});
 useEffect(()=>{let alive=true;setLoading(true);setError('');coreService.rpc(user.id,'pamda_sale_movement_read',{p_sale_id:saleId}).then(value=>{if(alive){const d=value as DataRow;setData(d);setPayments(d.payments.filter((p:DataRow)=>p.status!=='void'));}}).catch(e=>{if(alive)setError(e.message);}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};},[user.id,saleId]);
 async function save(){
  if(!data||busy)return;setBusy(true);setError('');
  const args={p_sale_id:saleId,p_action:mode,p_payments:mode==='payments'?payments.map(p=>({id:p.id,method_code:p.method_code})):[],p_reason:reason.trim(),p_expected_updated_at:data.sale.updated_at};
  const signature=JSON.stringify(args);if(request.current.signature!==signature)request.current={signature,key:crypto.randomUUID()};
  try{
   await coreService.rpc(user.id,'pamda_sale_movement_write',{...args,p_request_key:request.current.key},true);
   const next=await coreService.rpc(user.id,'pamda_sale_movement_read',{p_sale_id:saleId}) as DataRow;
   setData(next);setPayments(next.payments.filter((p:DataRow)=>p.status!=='void'));setMode('read');setReason('');request.current={signature:'',key:''};setNotice(mode==='cancel'?'Venda cancelada. O estoque foi mantido.':'Forma de pagamento atualizada.');onChanged();
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar.');}finally{setBusy(false);}
 }
 async function reprint(){if(!data||busy)return;setBusy(true);setError('');try{setReceipt(await realSales.receipt(user.id,{sale:data.sale,items:data.items,events:[],actors:{}} as SaleDetails));}catch(e){setError(e instanceof Error?e.message:'Não foi possível abrir o recibo.');}finally{setBusy(false);}}
 return <>{!receipt&&<div className="fixed inset-0 z-40 bg-slate-900/60 p-4 grid place-items-center"><section role="dialog" aria-modal="true" aria-label="Consultar pedido" className="bg-white rounded-2xl p-5 w-full max-w-4xl max-h-[92vh] overflow-auto space-y-4">
 <header className="flex justify-between items-center"><h2 className="font-black text-xl">Pedido {data?.sale.order_number||''}</h2><button type="button" disabled={busy} onClick={onClose} className="border rounded-lg p-2">Fechar consulta</button></header>
 {error&&<p role="alert" className="bg-rose-50 text-rose-800 p-3 rounded-xl">{error}</p>}{notice&&<p role="status" className="text-emerald-800">{notice}</p>}
 {loading?<p role="status">Consultando pedido…</p>:data&&<>
 <div className="bg-emerald-50 rounded-xl p-4"><p className="font-bold">{data.sale.customer_snapshot.code} · {data.sale.customer_snapshot.name}</p><p>{data.sale.branch_snapshot.name} · {[data.sale.branch_snapshot.address,data.sale.branch_snapshot.number,data.sale.branch_snapshot.neighborhood,data.sale.branch_snapshot.city].filter(Boolean).join(', ')}</p><p>{stateName(data.sale.status)} · {displayDate(data.sale.confirmed_at||data.sale.created_at)} · Vendedor: {data.sale.seller_snapshot}</p></div>
 <div className="overflow-auto"><table className="w-full text-sm text-left"><thead><tr><th>Produto</th><th>Quantidade</th>{data.can_view_cost&&<th>Custo total</th>}<th>Preço unitário</th><th>Subtotal</th></tr></thead><tbody>{data.items.map((i:DataRow)=><tr key={i.id} className="border-t"><td className="py-3">{i.product_code_snapshot} · {i.description_snapshot}<p className="text-xs">{[i.customization?.model,i.customization?.color].filter(Boolean).join(' · ')}</p></td><td>{i.quantity}</td>{data.can_view_cost&&<td>{i.unit_cost_snapshot==null?'—':money(Number(i.unit_cost_snapshot)*Number(i.quantity))}</td>}<td>{money(i.negotiated_unit_price)}</td><td>{money(i.line_subtotal)}</td></tr>)}</tbody></table></div>
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border-t pt-3"><p>Produtos: <strong>{money(data.sale.subtotal)}</strong></p><p>Desconto: <strong>{money(data.sale.discount_amount)}</strong></p><p>Frete: <strong>{money(data.sale.shipping_charged)}</strong></p><p>Total: <strong>{money(data.sale.total)}</strong></p></div>
 {data.sale.notes&&<p className="whitespace-pre-wrap text-sm">{data.sale.notes}</p>}
 <section className="space-y-2"><h3 className="font-bold">Pagamentos</h3>{data.payments.map((p:DataRow)=><p key={p.id}>{p.method_name} · {money(p.amount)} · {stateName(p.status)}</p>)}</section>
 {data.sale.status==='cancelled'&&<p className="rounded-xl bg-rose-50 p-3">Cancelada em {displayDate(data.sale.cancelled_at)} · {data.sale.cancellation_reason}</p>}
 {mode==='read'&&<div className="flex flex-wrap gap-3">{data.sale.status==='confirmed'&&<button type="button" disabled={busy} onClick={()=>void reprint()} className="rounded-lg bg-emerald-700 text-white px-4 py-2">Ver / reimprimir recibo</button>}{data.can_maintain&&data.sale.status==='confirmed'&&<><button type="button" onClick={()=>setMode('payments')} className="rounded-lg border px-4 py-2">Manutenção de movimento</button><button type="button" onClick={()=>setMode('cancel')} className="rounded-lg border text-rose-700 px-4 py-2">Cancelar venda fechada</button></>}</div>}
 {mode!=='read'&&<form className="rounded-xl border p-4 space-y-3" onSubmit={e=>{e.preventDefault();void save();}}><h3 className="font-bold">{mode==='payments'?'Corrigir forma de pagamento':'Cancelar venda fechada'}</h3>{mode==='payments'?payments.map((p,index)=><label key={p.id} className="block text-sm">Pagamento {index+1} · {money(p.amount)}<select aria-label={`Forma do pagamento ${index+1}`} disabled={busy||p.channel!=='erp'} value={p.method_code} onChange={e=>setPayments(rows=>rows.map((r,n)=>n===index?{...r,method_code:e.target.value}:r))} className="block border rounded-lg p-2 mt-1">{!data.methods.some((m:DataRow)=>m.code===p.method_code)&&<option value={p.method_code}>{p.method_name} (inativa)</option>}{data.methods.map((m:DataRow)=><option key={m.code} value={m.code}>{m.name}</option>)}</select></label>):<p className="text-sm">A venda sairá dos totais de vendas e cobranças. Produtos e movimentos de estoque serão mantidos. O registro continuará no histórico.</p>}<label className="block text-sm">Motivo da manutenção<textarea aria-label="Motivo da manutenção" required minLength={3} maxLength={2000} disabled={busy} value={reason} onChange={e=>setReason(e.target.value)} className="block border rounded-lg p-2 w-full"/></label><button disabled={busy||reason.trim().length<3} className="rounded-lg bg-emerald-700 text-white px-4 py-2 disabled:opacity-50">{busy?'Salvando…':mode==='payments'?'Salvar forma de pagamento':'Confirmar cancelamento'}</button><button type="button" disabled={busy} onClick={()=>{setMode('read');setReason('');}} className="ml-4">Voltar</button></form>}
 <details><summary className="cursor-pointer font-bold">Histórico e manutenção</summary><ol className="space-y-2 mt-2 text-sm">{data.events.map((e:DataRow)=><li key={e.id} className="border rounded-lg p-2">{eventName(e.type)} · {displayDate(e.at)} · {e.actor}{e.details?.reason&&<p>Motivo: {e.details.reason}</p>}{e.details?.before_payments&&<p>Antes: {e.details.before_payments.map((p:DataRow)=>`${p.method_code}: ${money(p.amount)}`).join(' · ')}</p>}{e.details?.after_payments&&<p>Depois: {e.details.after_payments.map((p:DataRow)=>`${p.method_code}: ${money(p.amount)} (${stateName(p.status)})`).join(' · ')}</p>}</li>)}</ol></details>
 </>}
 </section></div>}{receipt&&<ReceiptPreviewModal data={receipt} onClose={()=>setReceipt(null)}/>}</>;
}

export function CustomerSaleHistoryModal({customerId,name,onClose,onChanged}:{customerId:string;name:string;onClose():void;onChanged():void}){
 const user=authService.getCurrentUser()!;const [rows,setRows]=useState<DataRow[]|null>(null),[error,setError]=useState(''),[saleId,setSaleId]=useState<string|null>(null);
 const load=()=>coreService.rpc(user.id,'pamda_customer_sale_history',{p_customer_id:customerId}).then(d=>setRows(d as DataRow[])).catch(e=>setError(e.message));
 useEffect(()=>{void load();},[customerId,user.id]);
 if(saleId)return <SaleMovementModal saleId={saleId} onClose={()=>{setSaleId(null);void load();}} onChanged={()=>{void load();onChanged();}}/>;
 return <div className="fixed inset-0 z-40 bg-slate-900/60 p-4 grid place-items-center"><section role="dialog" aria-modal="true" aria-label="Histórico do cliente" className="bg-white rounded-2xl p-5 w-full max-w-3xl max-h-[90vh] overflow-auto space-y-4"><header className="flex justify-between"><h2 className="font-bold text-lg">{name} · Histórico completo</h2><button type="button" onClick={onClose}>Fechar histórico</button></header>{error&&<p role="alert">{error}</p>}{!rows?<p>Consultando pedidos…</p>:<table className="w-full text-sm text-left"><thead><tr><th>Pedido</th><th>Data</th><th>Situação</th><th>Total</th></tr></thead><tbody>{rows.map(r=><tr key={r.id} className="border-t"><td className="py-3"><button type="button" className="text-emerald-800 underline" onClick={()=>setSaleId(r.id)}>Pedido {r.order_number||'sem número'}</button></td><td>{displayDate(r.date)}</td><td>{stateName(r.status)}</td><td>{money(r.total)}</td></tr>)}</tbody></table>}</section></div>;
}
