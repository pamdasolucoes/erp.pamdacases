import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Search,RefreshCw,X} from 'lucide-react';
import {authService} from '../../services/auth';
import {pendingSalesService,saleWorkspace,pauseSaleSync,resumeSaleSync} from '../../services/saleWorkspace';
import {dbCents,saleCustomerName,saleCustomerCode,snapshotText} from '../../services/pendingSaleMapping';
import {formatMoney} from '../../services/salePricing';
import type {PendingSaleRow,OfficialSaleStatus,SaleDetails} from '../../types/pendingSales';
import type {TestPaymentRecord} from '../../types/testSales';
import type {ReceiptDocumentData} from '../../types/receipt';
import {testSalesService} from '../../services/testSales';
import {testReceiptDocument} from '../../services/testReceipt';
import {ReceiptPreviewModal} from '../../components/receipt/ReceiptPreviewModal';

type Row=PendingSaleRow&{status:OfficialSaleStatus;is_test?:boolean|null};
const date=(value:string|null)=>value?new Date(value).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'Não informado';
const label=(status:OfficialSaleStatus,isTest=false)=>status==='draft'?'Pendente':status==='cancelled'?'Cancelada':isTest?'Concluída - TESTE':'Confirmada';
const eventLabels:Record<string,string>={sale_started:'Venda iniciada',draft_saved:'Pendência salva',sale_cancelled:'Venda cancelada',test_sale_finalized:'Venda concluída em TESTE'};

export function OfficialSalesView({onContinue,customerId}:{onContinue():void;customerId?:string}){
  const user=authService.getCurrentUser()!;
  const [history,setHistory]=useState(false),[query,setQuery]=useState('');
  const [rows,setRows]=useState<Row[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [permissions,setPermissions]=useState({draft:false,cancel:false}),[permissionError,setPermissionError]=useState('');
  const [details,setDetails]=useState<SaleDetails|null>(null),[cancelTarget,setCancelTarget]=useState<Row|null>(null);
  const [reason,setReason]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  const [discardTarget,setDiscardTarget]=useState<Row|null>(null);
  const [testPayments,setTestPayments]=useState<TestPaymentRecord[]>([]);
  const [testReceipt,setTestReceipt]=useState<ReceiptDocumentData|null>(null);
  const [showTestReceipt,setShowTestReceipt]=useState(false);
  const revision=useRef(0);
  const reload=useCallback(async()=>{
    const token=++revision.current;setLoading(true);setError('');
    try{
      await saleWorkspace(user.id).flush();
      const result=await pendingSalesService.list(user.id,history,customerId);
      if(token===revision.current)setRows(result);
    }catch(error){if(token===revision.current){setRows([]);setError(error instanceof Error?error.message:'Erro ao consultar vendas.');}}
    finally{if(token===revision.current)setLoading(false);}
  },[user.id,history,customerId]);
  const loadPermissions=useCallback(async()=>{
    setPermissionError('');setPermissions({draft:false,cancel:false});
    try{
      const [draft,cancel]=await Promise.all([pendingSalesService.hasPermission(user.id,'sales.draft'),pendingSalesService.hasPermission(user.id,'sales.cancel')]);
      setPermissions({draft,cancel});
    }catch(error){setPermissionError(error instanceof Error?error.message:'Não foi possível verificar permissões.');}
  },[user.id]);
  useEffect(()=>{void reload();return()=>{revision.current++;};},[reload]);
  useEffect(()=>{void loadPermissions();const focus=()=>{void loadPermissions();void reload();};window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus);},[loadPermissions,reload]);
  const openDetails=async(row:Row)=>{
    setBusy(true);setError('');setTestPayments([]);setTestReceipt(null);setShowTestReceipt(false);
    try{
      const value=await pendingSalesService.details(user.id,row.id);setDetails(value);
      if(value.sale.status==='confirmed'&&value.sale.is_test===true){
        const [payments,receipt]=await Promise.all([testSalesService.payments(user.id,row.id),testSalesService.receipt(user.id,row.id)]);
        setTestPayments(payments);setTestReceipt(testReceiptDocument(value,receipt));
      }
    }catch(error){setError(error instanceof Error?error.message:'Erro ao abrir detalhes.');}finally{setBusy(false);}
  };
  const confirmTestPayment=async(payment:TestPaymentRecord)=>{
    if(user.role!=='admin_gerencial'||payment.channel!=='erp'||payment.status==='paid')return;
    const reference=window.prompt('Informe a referência ou justificativa para confirmar o pagamento de TESTE:')||'';
    if(!reference.trim())return;
    setBusy(true);setError('');
    try{await testSalesService.confirmPayment(user.id,payment.id,reference);setTestPayments(await testSalesService.payments(user.id,payment.saleId));setNotice('Pagamento confirmado no ambiente de TESTE.');}
    catch(error){setError(error instanceof Error?error.message:'Não foi possível confirmar o pagamento de teste.');}
    finally{setBusy(false);}
  };
  const continueSale=async(row:Row)=>{
    setBusy(true);setError('');
    try{
      const value=await pendingSalesService.details(user.id,row.id);
      if(value.sale.status!=='draft')throw new Error('Esta venda não está pendente. Atualize a consulta.');
      if(value.sale.created_by!==user.id&&user.role!=='admin_gerencial')throw new Error('Somente o responsável ou a administração pode continuar esta venda.');
      await saleWorkspace(user.id).open(value);onContinue();
    }catch(error){setError(error instanceof Error?error.message:'Erro ao continuar venda.');}finally{setBusy(false);}
  };
  const cancel=async()=>{
    if(!cancelTarget||!reason.trim())return;
    setBusy(true);setError('');
    try{
      await pauseSaleSync(user.id,cancelTarget.id);
      const value=await pendingSalesService.cancel(user.id,cancelTarget.id,reason);
      // Refresh the current workspace status without permitting a later save.
      saleWorkspace(user.id).acceptClosed(value);
      setDetails(value);setCancelTarget(null);setReason('');setNotice('Venda cancelada. O registro e o histórico foram preservados.');await reload();
    }catch(error){resumeSaleSync(user.id,cancelTarget.id);setError(error instanceof Error?error.message:'Erro ao cancelar.');}
    finally{setBusy(false);}
  };
  const discard=async()=>{
    if(!discardTarget||user.role!=='admin_gerencial')return;
    setBusy(true);setError('');
    try{
      await pauseSaleSync(user.id,discardTarget.id);
      const current=await pendingSalesService.details(user.id,discardTarget.id);
      if(current.sale.status!=='draft'||current.sale.first_product_at!==null||current.items.length)throw new Error('Esta venda já foi utilizada. O descarte não está disponível; consulte o histórico.');
      if(!await pendingSalesService.discardEmpty(user.id,current.sale.id))throw new Error('O servidor não confirmou o descarte. O registro foi preservado para revisão.');
      saleWorkspace(user.id).acceptDiscarded(current.sale.id);
      setDetails(null);setDiscardTarget(null);setNotice('Descarte confirmado pelo PAMDA CORE. A numeração é gerenciada exclusivamente pelo servidor.');await reload();
    }catch(error){resumeSaleSync(user.id,discardTarget.id);setError(error instanceof Error?error.message:'Não foi possível confirmar o descarte.');}
    finally{setBusy(false);}
  };
  const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
  const matches=rows.filter(row=>normalize([saleCustomerName(row),saleCustomerCode(row),row.seller_snapshot].join(' ')).includes(normalize(query.trim())));
  const canEdit=(row:Pick<Row,'status'|'created_by'>)=>
    row.status==='draft'&&permissions.draft&&(row.created_by===user.id||user.role==='admin_gerencial');
  const canCancel=(row:Pick<Row,'status'|'first_product_at'>)=>
    row.status==='draft'&&row.first_product_at!==null&&permissions.cancel;
  return <div className="space-y-5">
    <div className="flex flex-wrap justify-between items-center gap-3"><div><h1 className="text-2xl font-black text-slate-900">Pedidos & Pendências</h1><p className="text-sm text-slate-500">Vendas registradas no PAMDA CORE</p></div><button type="button" onClick={()=>{void reload();}} className="rounded-xl border px-4 py-2 flex gap-2 items-center text-sm"><RefreshCw className="w-4 h-4"/>Atualizar pendências</button></div>
    <div className="flex flex-wrap gap-3 items-center"><button type="button" aria-pressed={!history} onClick={()=>setHistory(false)} className={`rounded-xl px-4 py-2 text-sm font-bold ${!history?'bg-slate-900 text-white':'bg-white border'}`}>Pendentes</button><button type="button" aria-pressed={history} onClick={()=>setHistory(true)} className={`rounded-xl px-4 py-2 text-sm font-bold ${history?'bg-slate-900 text-white':'bg-white border'}`}>Histórico</button><label className="flex items-center gap-2 bg-white border rounded-xl px-3 py-2"><Search className="w-4 h-4 text-slate-400"/><input aria-label="Pesquisar pendências" placeholder="Cliente, código ou vendedor" value={query} onChange={event=>setQuery(event.target.value)} className="text-sm min-w-0 outline-none"/></label></div>
    {notice&&<p role="status" className="text-emerald-800 text-sm">{notice}</p>}
    {permissionError&&<p role="alert" className="text-sm text-amber-800">{permissionError} As ações de edição e cancelamento ficam indisponíveis até validar as permissões.</p>}
    {error&&<p role="alert" className="rounded-xl bg-rose-50 text-rose-800 p-4 text-sm">{error}</p>}
    {loading?<p role="status" className="p-6 bg-white rounded-xl border">Carregando vendas…</p>:!error&&<div className="overflow-x-auto rounded-2xl border bg-white"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Pedido</th><th className="p-3">Cliente / Código</th><th className="p-3">Início / Vendedor</th><th className="p-3">Valor atual</th><th className="p-3">Atualização</th><th className="p-3">Situação</th><th className="p-3">Ações</th></tr></thead><tbody>{matches.length?matches.map(row=><tr key={row.id} className="border-t" data-testid={`pending-sale-${row.id}`}><td className="p-3 font-bold">{row.order_number??'Sem número · revisar'}</td><td className="p-3"><p className="font-semibold">{saleCustomerName(row)}</p><p className="text-xs text-slate-500 whitespace-pre-wrap">Código: {saleCustomerCode(row)||'Não informado'}</p></td><td className="p-3"><p>{date(row.created_at)}</p><p className="text-xs text-slate-500">{row.seller_snapshot}</p></td><td className="p-3 whitespace-nowrap">{formatMoney(dbCents(row.total))}{!row.shipping_confirmed&&<p className="text-xs text-amber-800">Frete ainda não informado</p>}</td><td className="p-3">{date(row.updated_at)}</td><td className="p-3"><span className={`rounded-lg px-2 py-1 text-xs font-bold ${row.status==='cancelled'?'bg-rose-50 text-rose-800':'bg-amber-50 text-amber-900'}`}>{label(row.status,row.is_test===true)}</span></td><td className="p-3"><div className="flex flex-wrap gap-2">{canEdit(row)&&<button type="button" disabled={busy} onClick={()=>{void continueSale(row);}} className="rounded-lg bg-blue-600 text-white px-3 py-2 text-xs font-bold">Editar pendência</button>}<button type="button" disabled={busy} onClick={()=>{void openDetails(row);}} className="rounded-lg border px-3 py-2 text-xs">Consultar detalhes</button>{row.status==='draft'&&row.first_product_at===null&&user.role==='admin_gerencial'&&<button type="button" disabled={busy} onClick={()=>setDiscardTarget(row)} className="rounded-lg border px-3 py-2 text-xs text-amber-800">Revisar descarte</button>}{canCancel(row)&&<button type="button" disabled={busy} onClick={()=>{setReason('');setCancelTarget(row);}} className="rounded-lg border border-rose-200 px-3 py-2 text-xs text-rose-700">Cancelar venda</button>}</div></td></tr>):<tr><td colSpan={7} className="p-8 text-center text-slate-500">{history?'Nenhuma venda encontrada no histórico.':'Nenhuma pendência encontrada.'}</td></tr>}</tbody></table></div>}
    {details&&<div className="fixed inset-0 z-50 bg-slate-900/60 p-3 sm:p-6 flex items-center justify-center"><div role="dialog" aria-modal="true" aria-label="Detalhes da venda" className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-5 space-y-4">
      <div className="flex justify-between items-center"><h2 className="font-bold text-lg">Detalhes da venda · {label(details.sale.status,details.sale.is_test===true)}</h2><button type="button" aria-label="Fechar detalhes" onClick={()=>setDetails(null)}><X className="w-5 h-5"/></button></div>
      <p className="text-sm">Pedido: {details.sale.order_number??'Sem número · revisar'} · Primeiro produto: {date(details.sale.first_product_at)}</p><p className="font-semibold">{saleCustomerCode(details.sale)} · {saleCustomerName(details.sale)}</p><p className="text-sm">{snapshotText(details.sale.branch_snapshot,'name')} · {[snapshotText(details.sale.branch_snapshot,'address'),snapshotText(details.sale.branch_snapshot,'number'),snapshotText(details.sale.branch_snapshot,'city')].filter(Boolean).join(', ')}</p><p className="text-sm">Vendedor: {details.sale.seller_snapshot} · Início: {date(details.sale.created_at)}</p>
      <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr><th className="p-2">Item</th><th className="p-2">Quantidade</th><th className="p-2">Preço</th><th className="p-2">Subtotal</th></tr></thead><tbody>{details.items.map(item=><tr key={item.id} className="border-t"><td className="p-2"><p>{item.description_snapshot}</p><p className="text-xs text-slate-500">{item.product_code_snapshot} · {item.product_sku_snapshot}</p>{typeof item.customization?.model==='string'&&<p className="text-xs">Modelo: {item.customization.model}</p>}{typeof item.customization?.color==='string'&&<p className="text-xs">Cor: {item.customization.color}</p>}</td><td className="p-2">{String(item.quantity)}</td><td className="p-2">{formatMoney(dbCents(item.negotiated_unit_price))}</td><td className="p-2">{formatMoney(dbCents(item.line_subtotal))}</td></tr>)}</tbody></table>{!details.items.length&&<p className="text-sm p-3 text-slate-500">Venda sem itens.</p>}</div>
      <div className="text-sm space-y-1"><p>Subtotal: {formatMoney(dbCents(details.sale.subtotal))}</p><p>Desconto: {formatMoney(dbCents(details.sale.discount_amount))}{details.sale.discount_reason?` · ${details.sale.discount_reason}`:''}</p><p>Frete: {details.sale.shipping_confirmed&&details.sale.shipping_charged!==null?formatMoney(dbCents(details.sale.shipping_charged)):'Não informado'}</p><p className="font-bold">Total: {formatMoney(dbCents(details.sale.total))}</p><p className="whitespace-pre-wrap">{details.sale.notes}</p></div>
      {details.sale.is_test===true&&<section className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-3"><div><h3 className="font-bold">Pagamentos de TESTE</h3><p className="text-xs text-amber-900">Sem cobrança ou movimentação financeira real.</p></div>{testPayments.length?testPayments.map(payment=><div key={payment.id} className="flex flex-wrap justify-between gap-2 border-t border-amber-200 pt-2 text-sm"><span>{payment.methodCode} · {payment.channel.toUpperCase()} · {payment.status==='paid'?'Pago em teste':payment.status==='scheduled'?'Agendado':'Pendente'}{payment.scheduledFor&&` · ${date(payment.scheduledFor)}`}{payment.reference&&` · ${payment.reference}`}</span><strong>{formatMoney(payment.amountCents)}</strong>{user.role==='admin_gerencial'&&payment.channel==='erp'&&payment.status!=='paid'&&<button type="button" disabled={busy} onClick={()=>void confirmTestPayment(payment)} className="rounded-lg border px-2 py-1 text-xs font-bold">Confirmar pagamento TESTE</button>}</div>):<p className="text-sm">Nenhum pagamento encontrado.</p>}{testReceipt&&<button type="button" onClick={()=>setShowTestReceipt(true)} className="rounded-lg bg-amber-700 px-3 py-2 text-xs font-bold text-white">Consultar recibo de TESTE</button>}</section>}
      {details.sale.status==='cancelled'&&<div className="rounded-xl bg-rose-50 text-rose-900 p-3 text-sm space-y-1"><p className="font-bold">Cancelamento registrado</p><p>Em {date(details.sale.cancelled_at)}</p><p>Responsável: {details.actors[details.sale.cancelled_by||'']||'Identificação não disponível para esta conta'}</p><p>Motivo: {details.sale.cancellation_reason}</p></div>}
      <div><h3 className="font-semibold text-sm mb-2">Histórico</h3><ol className="space-y-2 text-xs">{details.events.map(event=><li key={event.id} className="border rounded-lg p-2">{eventLabels[event.event_type]||'Evento registrado'} · {date(event.occurred_at)} · {details.actors[event.actor_user_id]||'Responsável não disponível para esta conta'}</li>)}</ol></div>
      <div className="flex justify-end gap-2">{canEdit(details.sale)&&<button type="button" disabled={busy} onClick={()=>{void continueSale(details.sale);}} className="rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-bold">Editar pendência</button>}<button type="button" disabled={busy} onClick={()=>setDetails(null)} className="rounded-lg border px-4 py-2 text-sm">Fechar</button></div>
    </div></div>}
    {showTestReceipt&&testReceipt&&<ReceiptPreviewModal data={testReceipt} onClose={()=>setShowTestReceipt(false)}/>}
    {discardTarget&&<div className="fixed inset-0 z-[60] bg-slate-900/60 p-4 flex items-center justify-center"><div role="dialog" aria-modal="true" aria-label="Revisar descarte de pendência" className="bg-white rounded-2xl p-5 max-w-lg w-full space-y-4"><h2 className="font-bold text-lg">Revisar pendência sem histórico de produtos</h2><p className="text-sm">{saleCustomerName(discardTarget)} · Pedido {discardTarget.order_number??'sem número'}. O servidor verificará se esta pendência pode ser descartada. Vendas já utilizadas serão preservadas.</p><div className="flex gap-3"><button type="button" disabled={busy} onClick={()=>void discard()} className="rounded-xl bg-amber-600 text-white px-4 py-2 text-sm font-bold">Confirmar descarte protegido</button><button type="button" disabled={busy} onClick={()=>setDiscardTarget(null)} className="rounded-xl border px-4 py-2 text-sm">Voltar</button></div></div></div>}
    {cancelTarget&&<div className="fixed inset-0 z-[60] bg-slate-900/60 p-4 flex items-center justify-center"><form role="dialog" aria-modal="true" aria-label="Cancelar venda pendente" onSubmit={event=>{event.preventDefault();void cancel();}} className="bg-white rounded-2xl p-5 max-w-lg w-full space-y-4"><h2 className="font-bold text-lg">Cancelar venda pendente</h2><p className="text-sm">Confirme o cancelamento de {saleCustomerName(cancelTarget)}. O registro e seu histórico serão preservados.</p><label className="block text-sm font-bold">Motivo do cancelamento<textarea required maxLength={4000} value={reason} onChange={event=>setReason(event.target.value)} className="mt-1 w-full border rounded-xl p-3 font-normal"/></label><div className="flex gap-3"><button type="submit" disabled={busy||!reason.trim()} className="rounded-xl bg-rose-600 text-white px-4 py-2 text-sm font-bold disabled:opacity-50">{busy?'Cancelando…':'Confirmar cancelamento'}</button><button type="button" disabled={busy} onClick={()=>setCancelTarget(null)} className="rounded-xl border px-4 py-2 text-sm">Voltar</button></div></form></div>}
  </div>;
}
