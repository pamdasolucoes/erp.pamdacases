import React,{useEffect,useMemo,useRef,useState} from 'react';
import {useProducts} from '../../hooks/useProducts';
import {SearchDropdown} from '../../components/common/SearchDropdown';
import {searchSaleProducts} from '../../services/saleSearch';
import {centsInput,formatMoney,parsePriceInput} from '../../services/salePricing';
import {dbCents} from '../../services/pendingSaleMapping';
import {coreService} from '../../services/coreService';
import {authService} from '../../services/auth';
import {productCatalog} from '../../services/catalogResources';
import {localDate,type DataRow} from '../../services/operations';

interface Item {key:string;id?:string;productId:string;name:string;code:string;quantity:string;price:string;customization:Record<string,unknown>;}
interface Payment {key:string;id?:string;method:string;amount:string;status:string;channel:string;scheduled:string;reference:string;}
const input='w-full rounded-lg border bg-white p-2 text-sm',button='rounded-lg border bg-white px-3 py-2 text-sm font-semibold';
export function ClosedSaleEditor({data,onCancel,onSaved,onDirtyChange,onBusyChange}:{data:DataRow;onCancel():void;onSaved(next:DataRow):void;onDirtyChange(dirty:boolean):void;onBusyChange(busy:boolean):void}){
 const {products,loading,error:catalogError,reload}=useProducts();
 const [items,setItems]=useState<Item[]>(()=>data.items.map((i:DataRow)=>({key:i.id,id:i.id,productId:i.product_id,name:i.description_snapshot,code:i.product_code_snapshot,quantity:String(i.quantity),price:centsInput(dbCents(i.negotiated_unit_price)),customization:i.customization||{}})));
 const [payments,setPayments]=useState<Payment[]>(()=>data.payments.filter((p:DataRow)=>p.status!=='void').map((p:DataRow)=>({key:p.id,id:p.id,method:p.method_code,amount:centsInput(dbCents(p.amount)),status:p.status,channel:p.channel,scheduled:p.scheduled_for||'',reference:p.reference||''})));
 const [freight,setFreight]=useState(centsInput(dbCents(data.sale.shipping_charged))),[discount,setDiscount]=useState(centsInput(dbCents(data.sale.discount_amount))),[discountReason,setDiscountReason]=useState(data.sale.discount_reason||''),[notes,setNotes]=useState(data.sale.notes||'');
 const [due,setDue]=useState(data.receivable?.due_date||localDate()),[reason,setReason]=useState(''),[query,setQuery]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const alive=useRef(true),request=useRef({signature:'',key:''});
 useEffect(()=>{onBusyChange(busy);return()=>onBusyChange(false);},[busy,onBusyChange]);
 const fingerprint=JSON.stringify([items,payments,freight,discount,discountReason,notes,due,reason]),baseline=useRef(fingerprint);
 useEffect(()=>{onDirtyChange(fingerprint!==baseline.current);},[fingerprint,onDirtyChange]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;onDirtyChange(false);};},[onDirtyChange]);
 const matches=useMemo(()=>searchSaleProducts(products,query).filter(p=>p.active),[products,query]);
 const subtotal=items.reduce((sum,i)=>{const price=parsePriceInput(i.price),qty=Number(i.quantity);return sum+(price!==null&&Number.isSafeInteger(qty)?price*qty:0);},0);
 const total=subtotal-(parsePriceInput(discount)??0)+(parsePriceInput(freight)??0),paymentTotal=payments.reduce((sum,p)=>sum+(parsePriceInput(p.amount)??0),0);
 const patchItem=(key:string,patch:Partial<Item>)=>setItems(rows=>rows.map(i=>i.key===key?{...i,...patch}:i));
 const patchPayment=(key:string,patch:Partial<Payment>)=>setPayments(rows=>rows.map(p=>p.key===key?{...p,...patch}:p));
 async function save(){
  if(busy)return;setError('');
  let document:Record<string,unknown>;
  try{
   const shipping=parsePriceInput(freight),reduction=parsePriceInput(discount);
   if(!items.length||items.length>200||shipping===null||reduction===null||reduction>subtotal)throw new Error('Confira os produtos, o frete e o desconto.');
   if(reason.trim().length<3)throw new Error('Informe o motivo da manutenção.');
   if(reduction>0&&!discountReason.trim())throw new Error('Informe o motivo do desconto.');
   document={items:items.map(i=>{const price=parsePriceInput(i.price),quantity=Number(i.quantity);if(price===null||!Number.isSafeInteger(quantity)||quantity<1||quantity>100000)throw new Error('Confira a quantidade e o preço dos itens.');return {id:i.id,product_id:i.productId,quantity,unit_price:price/100,customization:i.customization};}),freight:shipping/100,discount:reduction/100,discount_reason:discountReason,notes,due_date:due,
    payments:payments.map(p=>{const amount=parsePriceInput(p.amount);if(amount===null||amount<=0||!p.method||p.status==='scheduled'&&!p.scheduled)throw new Error('Confira os valores, as formas e as datas dos pagamentos.');return {id:p.id,method_code:p.method,amount:amount/100,status:p.status,scheduled_for:p.scheduled||null,reference:p.reference};})};
   if(paymentTotal!==total)throw new Error('A soma dos pagamentos deve corresponder ao total corrigido.');
  }catch(e){setError(e instanceof Error?e.message:'Confira os dados.');return;}
  setBusy(true);const args={p_sale_id:data.sale.id,p_document:document,p_reason:reason.trim(),p_expected_updated_at:data.sale.updated_at};
  const signature=JSON.stringify(args);if(request.current.signature!==signature)request.current={signature,key:crypto.randomUUID()};
  try{const userId=authService.getCurrentUser()!.id;await coreService.rpc(userId,'pamda_sale_movement_edit',{...args,p_request_key:request.current.key},true);
   const next=await coreService.rpc(userId,'pamda_sale_movement_read',{p_sale_id:data.sale.id}) as DataRow;productCatalog.invalidate();if(alive.current)onSaved(next);
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Não foi possível corrigir a venda.');}finally{if(alive.current)setBusy(false);}
 }
 return <form aria-label="Editar venda fechada" onSubmit={e=>{e.preventDefault();void save();}} className="space-y-4 rounded-xl border p-4">
  <h3 className="text-lg font-bold">Editar venda fechada</h3><p className="text-sm text-slate-600">O número e a data originais são mantidos. Confira os produtos e o pagamento antes de salvar a correção.</p>
  {error&&<p role="alert" className="rounded-lg bg-rose-50 p-3 text-rose-800">{error}</p>}
  <fieldset disabled={busy} className="min-w-0 space-y-4">
   <SearchDropdown label="Adicionar produto na manutenção" placeholder="Nome, código ou SKU" query={query} onQueryChange={setQuery} options={matches} loading={loading} error={catalogError||undefined} onRetry={reload} onSelect={p=>setItems(rows=>[...rows,{key:crypto.randomUUID(),productId:p.id,name:p.name,code:p.code,quantity:'1',price:p.salePrice===null?'':centsInput(Math.round(p.salePrice*100)),customization:{}}])} renderOption={p=><span>{p.code} · {p.name}</span>}/>
   <div className="space-y-3">{items.map((i,index)=><div key={i.key} className="space-y-3 rounded-xl border p-3"><div className="flex items-center justify-between gap-3"><p className="font-semibold">{i.code} · {i.name}</p><button type="button" aria-label={`Remover produto ${index+1}`} className="text-rose-700 underline" onClick={()=>setItems(rows=>rows.filter(r=>r.key!==i.key))}>Remover</button></div><div className="grid gap-3 sm:grid-cols-2"><label>Quantidade<input aria-label={`Quantidade na manutenção ${index+1}`} className={input} type="number" min="1" step="1" value={i.quantity} onChange={e=>patchItem(i.key,{quantity:e.target.value})}/></label><label>Preço unitário (R$)<input aria-label={`Preço na manutenção ${index+1}`} className={input} inputMode="decimal" value={i.price} onChange={e=>patchItem(i.key,{price:e.target.value})}/></label><label>Modelo<input aria-label={`Modelo na manutenção ${index+1}`} className={input} maxLength={200} value={String(i.customization.model||'')} onChange={e=>patchItem(i.key,{customization:{...i.customization,model:e.target.value}})}/></label><label>Cor<input aria-label={`Cor na manutenção ${index+1}`} className={input} maxLength={100} value={String(i.customization.color||'')} onChange={e=>patchItem(i.key,{customization:{...i.customization,color:e.target.value}})}/></label></div></div>)}</div>
   <div className="grid gap-3 sm:grid-cols-2"><label>Frete (R$)<input aria-label="Frete na manutenção" className={input} inputMode="decimal" value={freight} onChange={e=>setFreight(e.target.value)}/></label><label>Desconto (R$)<input aria-label="Desconto na manutenção" className={input} inputMode="decimal" value={discount} onChange={e=>setDiscount(e.target.value)}/></label><label>Motivo do desconto<input className={input} value={discountReason} maxLength={2000} onChange={e=>setDiscountReason(e.target.value)}/></label><label>Vencimento<input aria-label="Vencimento na manutenção" className={input} type="date" required value={due} onChange={e=>setDue(e.target.value)}/></label></div>
   <label className="block">Observações do pedido<textarea aria-label="Observações na manutenção" className={input} maxLength={10000} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
   <p className="text-lg font-bold">Total corrigido: {formatMoney(total)}</p><h4 className="font-bold">Pagamentos</h4>
   {payments.map((p,index)=><fieldset key={p.key} disabled={p.channel!=='erp'} className="grid gap-3 rounded-xl border p-3 sm:grid-cols-2"><legend>Pagamento {index+1}{p.channel!=='erp'?' · Provedor externo':''}</legend><label>Forma<select aria-label={`Forma corrigida ${index+1}`} className={input} value={p.method} onChange={e=>patchPayment(p.key,{method:e.target.value})}><option value="">Selecione</option>{!data.methods.some((m:DataRow)=>m.code===p.method)&&p.method&&<option value={p.method}>{p.method} (inativa)</option>}{data.methods.map((m:DataRow)=><option key={m.code} value={m.code}>{m.name}</option>)}</select></label><label>Valor (R$)<input aria-label={`Valor corrigido ${index+1}`} className={input} inputMode="decimal" value={p.amount} onChange={e=>patchPayment(p.key,{amount:e.target.value})}/></label><label>Situação<select aria-label={`Situação corrigida ${index+1}`} className={input} value={p.status} onChange={e=>patchPayment(p.key,{status:e.target.value})}><option value="paid">Recebido</option><option value="pending">Pendente</option><option value="scheduled">Agendado</option></select></label>{p.status==='scheduled'&&<label>Data agendada<input aria-label={`Data corrigida ${index+1}`} className={input} type="date" value={p.scheduled.slice(0,10)} onChange={e=>patchPayment(p.key,{scheduled:e.target.value?`${e.target.value}T12:00:00-03:00`:''})}/></label>}<label>Referência<input className={input} maxLength={2000} value={p.reference} onChange={e=>patchPayment(p.key,{reference:e.target.value})}/></label><button type="button" className="text-left text-rose-700 underline" aria-label={`Remover pagamento ${index+1}`} onClick={()=>setPayments(rows=>rows.filter(r=>r.key!==p.key))}>Remover pagamento</button></fieldset>)}
   <button type="button" disabled={payments.length>=20} className={button} onClick={()=>setPayments(rows=>[...rows,{key:crypto.randomUUID(),method:'',amount:centsInput(Math.max(0,total-paymentTotal)),status:'paid',channel:'erp',scheduled:'',reference:''}])}>Adicionar pagamento</button>
   <p className={paymentTotal===total?'text-emerald-800':'text-rose-800'}>Pagamentos: {formatMoney(paymentTotal)} · Diferença: {formatMoney(total-paymentTotal)}</p>
   <label className="block">Motivo da manutenção<textarea aria-label="Motivo da correção" className={input} required minLength={3} maxLength={2000} value={reason} onChange={e=>setReason(e.target.value)}/></label>
  </fieldset>
  <div className="flex flex-wrap gap-3"><button disabled={busy} className="rounded-lg bg-emerald-700 px-4 py-2 font-bold text-white disabled:opacity-50">{busy?'Salvando correção…':'Salvar correção e manter fechada'}</button><button type="button" disabled={busy} className={button} onClick={onCancel}>Voltar à consulta</button></div>
 </form>;
}
