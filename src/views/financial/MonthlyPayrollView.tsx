import React from 'react';
import {calculatePayroll,syncPayroll} from '../../services/recurringAccountCalculation';
import {formatMoney} from '../../services/salePricing';
import {MoneyInput,Field,input,button} from './MonthlyClosingFields';
import type {MonthlyClosingData} from '../../types/monthlyClosing';
import type {MonthlyPayroll} from '../../types/recurringAccounts';
export function MonthlyPayrollView({data,onChange,onApply}:{data:MonthlyClosingData;onChange:(data:MonthlyClosingData)=>void;onApply:()=>void}){
 const update=(id:string,patch:Partial<MonthlyPayroll>)=>{const people=(data.payroll||[]).map(p=>p.id===id?{...p,...patch}:p);onChange(syncPayroll(data,people));};
 return <section className="space-y-4" aria-label="Folha de pagamento do mês"><h2 className="text-lg font-bold">Folha de pagamento · {data.month.split('-').reverse().join('/')}</h2><p className="text-sm text-slate-600">Salário, adiantamento, faltas, VT e VR geram as mesmas contas exibidas em Lançamentos. Registre os pagamentos e as datas nessas contas.</p>
  {!(data.payroll||[]).length&&<p className="text-sm text-slate-600">Cadastre o funcionário em Contas fixas e traga os cadastros para este mês.</p>}
  {(data.payroll||[]).map(p=>{let total:ReturnType<typeof calculatePayroll>|null=null,error='';try{total=calculatePayroll(p);}catch(e){error=e instanceof Error?e.message:'Confira a folha.';}
   return <section key={p.id} className="space-y-4 rounded-xl border bg-white p-5"><div className="flex flex-wrap justify-between gap-3"><h3 className="font-bold">{p.name}</h3><button type="button" className={button} disabled={data.expenses.some(e=>e.payrollId===p.id&&e.paidCents>0)} onClick={()=>{if(window.confirm(`Retirar a folha de ${p.name} deste mês?`))onChange(syncPayroll(data,(data.payroll||[]).filter(row=>row.id!==p.id)));}}>Retirar do mês</button></div>{p.sourceNote&&<p className="text-xs text-amber-800">{p.sourceNote}</p>}<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    {([['baseSalaryCents','Salário-base'],['advanceCents','Adiantamento previsto'],['extraCents','Adicionais'],['otherReductionCents','Outros descontos'],['vtRateCents','VT por dia'],['vrRateCents','VR por dia']] as const).map(([key,label])=><Field key={key} label={label}><MoneyInput label={`${p.name} ${label}`} value={p[key]} onChange={n=>update(p.id,{[key]:n,confirmed:false})}/></Field>)}
    {([['divisorDays100','Dias-base para faltas'],['absenceDays100','Dias de falta'],['vtDays100','Dias VT'],['vrDays100','Dias VR']] as const).map(([key,label])=><Field key={key} label={label}><input aria-label={`${p.name} ${label}`} type="number" min="0" max="366" step="0.01" className={input} value={p[key]/100} onChange={e=>update(p.id,{[key]:Math.round(Number(e.target.value)*100),confirmed:false})}/></Field>)}
   </div>{error?<p role="status" className="text-sm text-amber-800">{error}</p>:<div className="flex flex-wrap gap-x-6 gap-y-2 text-sm"><p>Desconto por faltas: <strong>{formatMoney(total!.absenceCents)}</strong></p><p>Saldo salarial: <strong>{formatMoney(total!.salaryNetCents)}</strong></p><p>VT: <strong>{formatMoney(total!.vtCents)}</strong></p><p>VR: <strong>{formatMoney(total!.vrCents)}</strong></p></div>}
   <label className="flex gap-2 text-sm font-semibold"><input type="checkbox" aria-label={`Folha de ${p.name} conferida`} checked={p.confirmed} onChange={e=>update(p.id,{confirmed:e.target.checked})}/>Conferi salário, adiantamento, faltas e benefícios deste mês</label><p className="text-xs text-slate-600">Faltas = salário-base × dias de falta ÷ dias-base informados. O adiantamento é parte do salário, não um custo adicional.</p>
  </section>;
  })}<button type="button" className={button} onClick={onApply}>Trazer cadastros para este mês</button>
 </section>;
}
