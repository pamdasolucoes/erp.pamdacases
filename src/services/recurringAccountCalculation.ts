import type {MonthlyClosingData,MonthlyExpense} from '../types/monthlyClosing';
import type {AppliedAccounts,MonthlyPayroll,PayrollPart,RecurringAccountData} from '../types/recurringAccounts';
const integer=(v:number,max=100000000000)=>Number.isSafeInteger(v)&&v>=0&&v<=max;
const month=(v:string)=>/^\d{4}-(0[1-9]|1[0-2])$/.test(v)&&v.length===7&&v>='2000-01'&&v<='2100-12';
const roundDivide=(a:number,b:number,divisor:number)=>Number((BigInt(a)*BigInt(b)*2n+BigInt(divisor))/(BigInt(divisor)*2n));
export function dueDateForMonth(month:string,day:number|null){if(day===null)return '';const [y,m]=month.split('-').map(Number),last=new Date(Date.UTC(y,m,0)).getUTCDate();return `${month}-${String(Math.min(day,last)).padStart(2,'0')}`;}
export function calculatePayroll(p:MonthlyPayroll){
 if(!p||typeof p.name!=='string'||!p.name.trim()||p.name.length>100||!p.id||!p.templateId||typeof p.confirmed!=='boolean')throw new Error('Confira a identificação da folha de pagamento.');
 for(const key of ['baseSalaryCents','advanceCents','extraCents','otherReductionCents','vtRateCents','vrRateCents'] as const)if(!integer(p[key]))throw new Error('Confira os valores da folha de pagamento.');
 for(const key of ['divisorDays100','absenceDays100','vtDays100','vrDays100'] as const)if(!integer(p[key],36600))throw new Error('Confira os dias-base, faltas e dias de benefícios.');
 if(p.absenceDays100>0&&(p.divisorDays100===0||p.absenceDays100>p.divisorDays100))throw new Error('Informe os dias-base do mês para descontar as faltas.');
 for(const key of ['salary','advance','vt','vr'] as const)if(p.dueDays?.[key]!==null&&(!integer(p.dueDays?.[key],31)||p.dueDays[key]<1))throw new Error('Informe dias de vencimento entre 1 e 31, ou deixe em branco.');
 const absenceCents=p.absenceDays100?roundDivide(p.baseSalaryCents,p.absenceDays100,p.divisorDays100):0;
 const reductionCents=absenceCents+p.otherReductionCents,gross=p.baseSalaryCents+p.extraCents;
 if(reductionCents>gross)throw new Error('Os descontos excedem o salário e os adicionais.');
 const net=gross-reductionCents,advanceCostCents=Math.min(p.advanceCents,net);
 return {absenceCents,reductionCents,advanceCostCents,salaryGrossCents:gross-advanceCostCents,salaryNetCents:net-advanceCostCents,vtCents:roundDivide(p.vtRateCents,p.vtDays100,100),vrCents:roundDivide(p.vrRateCents,p.vrDays100,100)};
}
export function payrollExpenses(p:MonthlyPayroll,month:string,existing:MonthlyExpense[]=[]):MonthlyExpense[]{
 const totals=calculatePayroll(p),labels={salary:'PAGAMENTO',advance:'ADIANTAMENTO',vt:'VT',vr:'VR'};
 return (['salary','advance','vt','vr'] as PayrollPart[]).map(part=>{
  const old=existing.find(row=>row.payrollId===p.id&&row.payrollPart===part);
  const amount=part==='salary'?totals.salaryGrossCents:part==='advance'?totals.advanceCostCents:part==='vt'?totals.vtCents:totals.vrCents;
  return {...old,id:old?.id||`payroll:${p.id}:${part}`,description:`${labels[part]} ${p.name}`,reference:month,amountCents:amount,reductionCents:part==='salary'?totals.reductionCents:0,
   dueDate:old?.dueDate||dueDateForMonth(month,p.dueDays[part]),paidCents:old?.paidCents||0,paidOn:old?.paidOn||'',sourceTemplateId:p.templateId,category:part,employee:p.name,payrollId:p.id,payrollPart:part,amountConfirmed:p.confirmed};
 });
}
export function syncPayroll(data:MonthlyClosingData,payroll:MonthlyPayroll[]):MonthlyClosingData{
 const expenses=data.expenses.filter(row=>!row.payrollId);
 for(const p of payroll){try{expenses.push(...payrollExpenses(p,data.month,data.expenses));}catch{expenses.push(...data.expenses.filter(row=>row.payrollId===p.id));}}
 return {...data,payroll,expenses};
}
export function validateAccountExtensions(data:MonthlyClosingData){
 if(data.appliedTemplateIds!==undefined&&(!Array.isArray(data.appliedTemplateIds)||data.appliedTemplateIds.length>300||data.appliedTemplateIds.some(id=>typeof id!=='string'||!id||id.length>100)||new Set(data.appliedTemplateIds).size!==data.appliedTemplateIds.length))throw new Error('Vínculos dos cadastros inválidos.');
 if(data.recurringApplied!==undefined&&typeof data.recurringApplied!=='boolean')throw new Error('Cadastro mensal inválido.');
 const people=data.payroll||[];if(!Array.isArray(people)||people.length>100||new Set(people.map(p=>p.id)).size!==people.length)throw new Error('Folhas de pagamento repetidas ou inválidas.');
 for(const p of people){
  const expected=payrollExpenses(p,data.month,data.expenses),rows=data.expenses.filter(r=>r.payrollId===p.id);
  if(rows.length!==4||new Set(rows.map(r=>r.payrollPart)).size!==4)throw new Error('Confira as quatro contas geradas pela folha de pagamento.');
  for(const row of expected){const real=rows.find(r=>r.payrollPart===row.payrollPart)!;
   if(real.amountCents!==row.amountCents||real.reductionCents!==row.reductionCents||real.amountConfirmed!==p.confirmed||real.sourceTemplateId!==p.templateId)throw new Error('Atualize a folha para conferir salário, faltas, adiantamento, VT e VR.');}
 }
 for(const row of data.expenses){
  if(row.amountConfirmed!==undefined&&typeof row.amountConfirmed!=='boolean')throw new Error('Confira a confirmação do valor das contas.');
  if(row.payrollId&&!people.some(p=>p.id===row.payrollId))throw new Error('Conta vinculada a uma folha não encontrada.');
 }
}
const normalized=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase().replace(/\s+/g,' ');
export function mergeRecurringAccounts(data:MonthlyClosingData,generated:AppliedAccounts){
 let next:MonthlyClosingData={...data,expenses:[...data.expenses],payroll:[...(data.payroll||[])],recurringApplied:true,appliedTemplateIds:[...new Set([...(data.appliedTemplateIds||[]),...generated.expenses.map(row=>row.sourceTemplateId!),...generated.payroll.map(p=>p.templateId)])]};let skipped=0;
 for(const row of generated.expenses){const current=next.expenses.findIndex(r=>r.sourceTemplateId===row.sourceTemplateId&&!r.payrollId||normalized(r.description)===normalized(row.description));
  if(current<0)next.expenses.push(row);else{const old=next.expenses[current];next.expenses[current]={...row,...old,sourceTemplateId:row.sourceTemplateId,category:row.category,amountConfirmed:old.amountConfirmed??true,dueDate:old.dueDate||row.dueDate};}}
 for(const p of generated.payroll){if(next.payroll!.some(old=>old.id===p.id))continue;
  if(next.expenses.some(row=>!row.payrollId&&normalized(row.description).includes(normalized(p.name)))){skipped++;continue;}
  next.payroll!.push(p);
 }
 next=syncPayroll(next,next.payroll!);if(next.expenses.length>500)throw new Error('O mês excederia 500 contas.');return {data:next,skipped};
}
export function validateRecurringAccount(d:RecurringAccountData){
 if(!d||!['account','payroll','thales','courier'].includes(d.kind)||!['fixed','tax','salary','advance','vt','vr','other'].includes(d.category)||typeof d.name!=='string'||!d.name.trim()||d.name.length>300||typeof d.notes!=='string'||d.notes.length>2000||!integer(d.amountCents)||typeof d.variable!=='boolean'||typeof d.active!=='boolean'||!month(d.fromMonth)||d.untilMonth!==null&&(!month(d.untilMonth)||d.untilMonth<d.fromMonth)||!integer(d.remindDays,30)||d.dueDay!==null&&(!integer(d.dueDay,31)||d.dueDay<1))throw new Error('Confira o nome, valor, vigência e vencimento do cadastro.');
 if(d.kind==='payroll'){if(!d.payroll)throw new Error('Preencha a folha de pagamento.');calculatePayroll({...d.payroll,id:'template',templateId:'template',confirmed:false});}
}
