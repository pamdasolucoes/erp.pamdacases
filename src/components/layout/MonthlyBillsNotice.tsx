import React,{useCallback,useEffect,useState} from 'react';
import {recurringAccounts,type AccountAlerts} from '../../services/recurringAccounts';
import {localDate} from '../../services/operations';
export function MonthlyBillsNotice({userId,onOpen}:{userId:string;onOpen:(month:string)=>void}){
 const [alerts,setAlerts]=useState<AccountAlerts|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 const today=localDate(),retry=useCallback(()=>setAttempt(n=>n+1),[]);
 useEffect(()=>{let alive=true;setError('');void recurringAccounts.alerts(userId,today).then(value=>{if(alive)setAlerts(value);},reason=>{if(alive){setAlerts(null);setError(reason instanceof Error?reason.message:'Avisos indisponíveis.');}});return()=>{alive=false;};},[userId,today,attempt]);
 useEffect(()=>{window.addEventListener('pamda-monthly-accounts-changed',retry);return()=>window.removeEventListener('pamda-monthly-accounts-changed',retry);},[retry]);
 if(error)return <section aria-label="Lembretes de contas" className="mb-4 rounded-xl border bg-white px-4 py-3 text-sm"><span>Não foi possível conferir os vencimentos. </span><button type="button" className="font-semibold underline" title={error} onClick={retry}>Tentar novamente</button></section>;
 if(!alerts||!alerts.overdue&&!alerts.today&&!alerts.upcoming&&!alerts.unscheduled)return null;
 return <section aria-label="Lembretes de contas" aria-live="polite" className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${alerts.overdue?'border-rose-200 bg-rose-50 text-rose-900':'border-amber-200 bg-amber-50 text-amber-900'}`}><div><p className="font-bold">Contas e pagamentos</p><p>{[alerts.overdue&&`${alerts.overdue} atrasada(s)`,alerts.today&&`${alerts.today} vence(m) hoje`,alerts.upcoming&&`${alerts.upcoming} próxima(s) do vencimento`,alerts.unscheduled&&`${alerts.unscheduled} com vencimento a definir`].filter(Boolean).join(' · ')}</p></div><button type="button" className="rounded-lg border bg-white px-3 py-2 font-semibold" onClick={()=>onOpen(alerts.firstMonth||today.slice(0,7))}>Ver contas a pagar</button></section>;
}
