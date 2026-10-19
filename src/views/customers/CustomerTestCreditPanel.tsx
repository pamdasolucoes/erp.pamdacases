import React,{useCallback,useEffect,useState} from 'react';
import {authService} from '../../services/auth';
import {formatMoney,parsePriceInput} from '../../services/salePricing';
import {testSalesService} from '../../services/testSales';

export function CustomerTestCreditPanel({customerId}:{customerId:string}){
  const user=authService.getCurrentUser()!;
  const admin=user.active&&user.role==='admin_gerencial';
  const [balance,setBalance]=useState<number|null>(null),[loading,setLoading]=useState(true);
  const [amount,setAmount]=useState(''),[reason,setReason]=useState(''),[reference,setReference]=useState('');
  const [requestKey,setRequestKey]=useState(()=>crypto.randomUUID());
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const reload=useCallback(async()=>{
    setLoading(true);setError('');
    try{setBalance(await testSalesService.creditBalance(user.id,customerId));}
    catch(reason){setBalance(null);setError(reason instanceof Error?reason.message:'Não foi possível consultar o saldo de crédito de teste.');}
    finally{setLoading(false);}
  },[user.id,customerId]);
  useEffect(()=>{void reload();},[reload]);
  async function grant(){
    const cents=parsePriceInput(amount);
    if(cents===null||cents<=0||!reason.trim()){setError('Informe um valor positivo e o motivo da concessão.');return;}
    if(!window.confirm(`Conceder ${formatMoney(cents)} em crédito de TESTE para este cliente?`))return;
    setBusy(true);setError('');setNotice('');
    try{
      await testSalesService.grantCredit(user.id,{customerId,amountCents:cents,reason,requestKey,reference:reference.trim()||null});
      setRequestKey(crypto.randomUUID());setAmount('');setReason('');setReference('');
      setNotice('Crédito de teste confirmado pelo PAMDA CORE.');await reload();
    }catch(reason){setError(reason instanceof Error?reason.message:'Não foi possível confirmar o crédito de teste.');}
    finally{setBusy(false);}
  }
  return <section aria-label="Créditos do cliente - TESTE" className="mt-5 rounded-xl border border-amber-300 bg-amber-50/50 p-4 space-y-3">
    <div><h3 className="font-bold text-sm text-slate-900">Créditos do cliente - TESTE</h3><p className="text-xs text-amber-900">Saldo exclusivo do ambiente de homologação; não representa crédito financeiro real.</p></div>
    <p className="text-sm">{loading?'Consultando saldo…':balance===null?'Saldo indisponível':<><span className="text-slate-600">Saldo disponível:</span> <strong>{formatMoney(balance)}</strong></>}</p>
    {admin&&<fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
      <label className="text-xs font-bold">Valor a conceder (R$)<input aria-label="Valor do crédito de teste" inputMode="decimal" value={amount} onChange={event=>setAmount(event.target.value)} className="mt-1 w-full rounded-lg border bg-white p-2 text-sm font-normal"/></label>
      <label className="text-xs font-bold">Referência opcional<input aria-label="Referência do crédito de teste" maxLength={500} value={reference} onChange={event=>setReference(event.target.value)} placeholder="Devolução ou ocorrência" className="mt-1 w-full rounded-lg border bg-white p-2 text-sm font-normal"/></label>
      <label className="text-xs font-bold sm:col-span-2">Motivo obrigatório<input aria-label="Motivo do crédito de teste" maxLength={1000} value={reason} onChange={event=>setReason(event.target.value)} className="mt-1 w-full rounded-lg border bg-white p-2 text-sm font-normal"/></label>
      <button type="button" disabled={busy||loading||balance===null||!amount.trim()||!reason.trim()} onClick={()=>void grant()} className="w-fit rounded-lg bg-amber-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{busy?'Confirmando…':'Conceder crédito - TESTE'}</button>
    </fieldset>}
    {!admin&&<p className="text-xs text-slate-600">A consulta e concessão de créditos de teste estão restritas à administração.</p>}
    {error&&<p role="alert" className="text-xs text-rose-800">{error}</p>}
    {notice&&<p role="status" className="text-xs text-emerald-800">{notice}</p>}
    {!balance&&error&&<button type="button" onClick={()=>void reload()} className="text-xs underline">Tentar consultar novamente</button>}
  </section>;
}
