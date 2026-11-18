import {validateAccountExtensions} from './recurringAccountCalculation';
import type {MonthlyClosingData,MonthlyRules,MonthlyTotals,TimeEntry} from '../types/monthlyClosing';

export const defaultMonthlyRules:MonthlyRules={pamBps:2000,pamMinimumCents:170000,reserveBps:1000,thalesCents:207300,thalesFrom:'2026-09',thalesUntil:null};
const validMonth=(v:string)=>/^\d{4}-(0[1-9]|1[0-2])$/.test(v)&&v>='2000-01'&&v<='2100-12';
const validDate=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
const cents=(n:number,signed=false)=>Number.isSafeInteger(n)&&Math.abs(n)<=100000000000&&(signed||n>=0);
const aggregateCents=(n:number,signed=false)=>Number.isSafeInteger(n)&&(signed||n>=0);
const percentage=(n:number,bps:number)=>{if(!Number.isSafeInteger(n))throw new Error('Total fora do limite de cálculo.');return Number((BigInt(n)*BigInt(bps)+5000n)/10000n);};
const text=(v:string,max=300)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
export function createMonthlyClosing(month:string,rules:MonthlyRules=defaultMonthlyRules):MonthlyClosingData {
  if(!validMonth(month))throw new Error('Selecione um mês válido.');
  const [year,m]=month.split('-').map(Number),end=new Date(Date.UTC(year,m,0)).toISOString().slice(0,10);
  return {month,start:month+'-01',end,rules:{...rules},shop:{mode:'erp',snapshot:null,profitCents:0,shippingCents:0,reason:''},expenses:[],shopeeReceipts:[],shopeeCosts:[],couriers:[],timeEntries:[],withdrawalDeductions:[],payments:{thalesCents:0,thalesOn:'',pamCents:0,pamOn:'',withdrawalCents:0,withdrawalOn:''},notes:''};
}
export function timeEntryTotals(row:TimeEntry){
  const minutes=(v:string)=>{if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(v))throw new Error('Informe entrada e saída válidas na folha ponto.');const [h,m]=v.split(':').map(Number);return h*60+m;};
  const start=minutes(row.start),end=minutes(row.end);const duration=end>=start?end-start:end+1440-start;
  if(!Number.isInteger(row.breakMinutes)||row.breakMinutes<0||row.breakMinutes>duration||!Number.isInteger(row.expectedMinutes)||row.expectedMinutes<0||row.expectedMinutes>1440)throw new Error('Confira o intervalo e a jornada prevista na folha ponto.');
  const worked=duration-row.breakMinutes,extra=Math.max(0,worked-row.expectedMinutes),missing=Math.max(0,row.expectedMinutes-worked);
  return {worked,extra,missing,value:Math.round((worked-extra)*row.hourCents/60)+Math.round(extra*row.extraHourCents/60)};
}
export function validateMonthlyClosing(data:MonthlyClosingData){
  if(!data||!validMonth(data.month)||!validDate(data.start)||!validDate(data.end)||data.start>data.end||Date.parse(data.end)-Date.parse(data.start)>62*86400000)throw new Error('Informe um período válido de até 63 dias.');
  validateAccountExtensions(data);
  const r=data.rules;
  if(!r||![r.pamBps,r.reserveBps].every(v=>Number.isInteger(v)&&v>=0&&v<=10000)||!cents(r.pamMinimumCents)||!cents(r.thalesCents)||!validMonth(r.thalesFrom)||r.thalesUntil!==null&&(!validMonth(r.thalesUntil)||r.thalesUntil<r.thalesFrom))throw new Error('Confira as regras da PAM, da reserva e do custo fixo do Thales.');
  const arrays=[data.expenses,data.shopeeReceipts,data.shopeeCosts,data.couriers,data.timeEntries,data.withdrawalDeductions];
  for(const rows of arrays){if(!Array.isArray(rows)||rows.length>500||rows.some(row=>!text(row.id,100))||new Set(rows.map(row=>row.id)).size!==rows.length)throw new Error('Lista inválida ou com linhas repetidas (limite de 500 linhas por seção).');}
  const inPeriod=(date:string)=>validDate(date)&&date>=data.start&&date<=data.end;
  for(const row of data.expenses){if(!text(row.description)||row.reference.length>100||![row.amountCents,row.reductionCents,row.paidCents].every(v=>cents(v))||row.reductionCents>row.amountCents||row.dueDate&&!validDate(row.dueDate)||row.paidOn&&!validDate(row.paidOn)||row.paidCents>0&&!row.paidOn)throw new Error('Confira a descrição, os valores e a data do pagamento das contas.');}
  for(const rows of [data.shopeeReceipts,data.shopeeCosts,data.withdrawalDeductions])for(const row of rows){if(!text(row.description)||!inPeriod(row.date)||!cents(row.amountCents))throw new Error('Confira descrição, data e valor dos lançamentos da Shopee e dos descontos da retirada.');}
  for(const row of data.couriers){if(!text(row.name)||!inPeriod(row.date)||!Number.isInteger(row.quantity)||row.quantity<0||row.quantity>100000||![row.rateCents,row.gasCents,row.cashCents,row.advanceCents].every(v=>cents(v))||!cents(row.paidCents,true))throw new Error('Confira os dados do acerto do motoboy.');}
  for(const row of data.timeEntries){if(!text(row.name)||!inPeriod(row.date)||![row.hourCents,row.extraHourCents].every(v=>cents(v)))throw new Error('Confira os dados da folha ponto.');timeEntryTotals(row);}
  for(const name of ['thales','pam','withdrawal'] as const){const value=data.payments?.[`${name}Cents`],date=data.payments?.[`${name}On`];if(!cents(value)||typeof date!=='string'||date&&!validDate(date)||value>0&&!date)throw new Error('Confira o valor e a data dos pagamentos do acerto.');}
  const shop=data.shop;
  if(!shop||!['erp','manual'].includes(shop.mode)||!cents(shop.profitCents,true)||!cents(shop.shippingCents)||typeof shop.reason!=='string'||shop.reason.length>2000||typeof data.notes!=='string'||data.notes.length>10000)throw new Error('Confira o lucro das lojas e as observações.');
  if(shop.mode==='manual'&&!shop.reason.trim())throw new Error('Informe a origem do lucro das lojas digitado manualmente.');
  if(shop.mode==='erp'&&shop.snapshot){const s=shop.snapshot;if(s.start!==data.start||s.end!==data.end||!text(s.id,100)||!Number.isSafeInteger(s.pendingCostCount)||s.pendingCostCount<0||!Number.isSafeInteger(s.saleCount)||s.saleCount<0||s.pendingCostCount>s.saleCount||!Number.isFinite(Date.parse(s.capturedAt))||s.profitCents!==null&&!aggregateCents(s.profitCents,true)||!aggregateCents(s.shippingCents))throw new Error('Atualize o lucro das lojas para o período selecionado.');}
}
export function calculateMonthlyClosing(data:MonthlyClosingData):MonthlyTotals {
  validateMonthlyClosing(data);
  const sum=<T,>(rows:T[],get:(row:T)=>number)=>rows.reduce((total,row)=>total+get(row),0);
  const expensesCents=sum(data.expenses,r=>r.amountCents-r.reductionCents),expensesPaidCents=sum(data.expenses,r=>r.paidCents);
  const active=data.month>=data.rules.thalesFrom&&(!data.rules.thalesUntil||data.month<=data.rules.thalesUntil),thalesCents=active?data.rules.thalesCents:0;
  const courierCostCents=sum(data.couriers,r=>r.quantity*r.rateCents+r.gasCents),courierDueCents=sum(data.couriers,r=>r.quantity*r.rateCents+r.gasCents-r.cashCents-r.advanceCents),courierPaidCents=sum(data.couriers,r=>r.paidCents);
  const shopeeReceivedCents=sum(data.shopeeReceipts,r=>r.amountCents),shopeeCostCents=sum(data.shopeeCosts,r=>r.amountCents),shopeeProfitCents=shopeeReceivedCents-shopeeCostCents;
  const snapshot=data.shop.snapshot,ready=data.shop.mode==='manual'||!!snapshot&&snapshot.pendingCostCount===0&&snapshot.profitCents!==null;
  const shopProfitCents=ready?(data.shop.mode==='manual'?data.shop.profitCents:snapshot!.profitCents):null;
  const shopShippingCents=ready?(data.shop.mode==='manual'?data.shop.shippingCents:snapshot!.shippingCents):null;
  const shopTotalCents=shopProfitCents===null||shopShippingCents===null?null:shopProfitCents+shopShippingCents;
  const totalOutflowsCents=expensesCents+thalesCents+courierCostCents;
  const netProfitCents=shopTotalCents===null?null:shopTotalCents+shopeeProfitCents-totalOutflowsCents;
  const pamCents=netProfitCents===null?null:Math.max(percentage(Math.max(0,netProfitCents),data.rules.pamBps),data.rules.pamMinimumCents);
  const reserveCents=netProfitCents===null?null:percentage(Math.max(0,netProfitCents-pamCents!),data.rules.reserveBps);
  const deductionsCents=sum(data.withdrawalDeductions,r=>r.amountCents),withdrawalCents=netProfitCents===null?null:netProfitCents-pamCents!-reserveCents!-deductionsCents;
  const times=data.timeEntries.map(timeEntryTotals);
  const totals={expensesCents,expensesPaidCents,expensesBalanceCents:expensesCents-expensesPaidCents,thalesCents,thalesBalanceCents:thalesCents-data.payments.thalesCents,shopeeReceivedCents,shopeeCostCents,shopeeProfitCents,courierCostCents,courierDueCents,courierPaidCents,courierBalanceCents:courierDueCents-courierPaidCents,totalOutflowsCents,shopProfitCents,shopShippingCents,shopTotalCents,netProfitCents,pamCents,pamBalanceCents:pamCents===null?null:pamCents-data.payments.pamCents,reserveCents,withdrawalCents,withdrawalBalanceCents:withdrawalCents===null?null:withdrawalCents-data.payments.withdrawalCents,deductionsCents,workedMinutes:sum(times,t=>t.worked),expectedMinutes:sum(data.timeEntries,t=>t.expectedMinutes),extraMinutes:sum(times,t=>t.extra),missingMinutes:sum(times,t=>t.missing),timeValueCents:sum(times,t=>t.value)};
  if(Object.values(totals).some(v=>v!==null&&!Number.isSafeInteger(v)))throw new Error('Total fora do limite de cálculo.');
  return totals;
}
