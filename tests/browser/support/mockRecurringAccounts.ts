import type {Page} from '@playwright/test';
import type {RecurringAccount,RecurringAccountData,MonthlyPayroll} from '../../../src/types/recurringAccounts';
import {payrollExpenses} from '../../../src/services/recurringAccountCalculation';
import {uuid} from '../../fixtures/customerRows';
import type {MonthlyClosingRecord} from '../../../src/types/monthlyClosing';
export async function mockRecurringAccounts(page:Page,records:Map<string,MonthlyClosingRecord>,initial:RecurringAccountData[]=[]){
 const items=new Map<string,RecurringAccount>();initial.forEach((data,i)=>items.set(uuid(88000+i),{id:uuid(88000+i),version:1,data,updatedAt:new Date().toISOString()}));
 const state={items,writes:[] as any[],alertReads:0,generateReads:0,failAfterSave:false};const completed=new Map<string,RecurringAccount>();
 const generate=(month:string)=>{
  const expenses:any[]=[],payroll:MonthlyPayroll[]=[];
  for(const row of items.values()){const d=row.data;if(!d.active||month<d.fromMonth||d.untilMonth&&month>d.untilMonth)continue;
   const due=(day:number|null)=>day===null?'':month+'-'+String(Math.min(day,new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).getUTCDate())).padStart(2,'0');
   if(d.kind==='account')expenses.push({id:'recurring:'+row.id,description:d.name,reference:month,amountCents:d.amountCents,reductionCents:0,dueDate:due(d.dueDay),paidCents:0,paidOn:'',sourceTemplateId:row.id,category:d.category,amountConfirmed:!d.variable});
   if(d.kind==='payroll')payroll.push({...d.payroll!,id:row.id,templateId:row.id,name:d.name,sourceNote:d.notes,confirmed:false});
  }return {expenses,payroll};
 };
 await page.route('https://pamda-test.invalid/rest/v1/rpc/pamda_monthly_accounts_*',async route=>{
  const name=new URL(route.request().url()).pathname.split('/').pop()!,body=route.request().postDataJSON();
  const respond=(data:unknown,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(data)});
  if(name==='pamda_monthly_accounts_read')return respond([...items.values()]);
  if(name==='pamda_monthly_accounts_generate'){state.generateReads++;return respond(generate(body.p_month));}
  if(name==='pamda_monthly_accounts_write'){
   state.writes.push(structuredClone(body));if(completed.has(body.p_request_key))return respond(completed.get(body.p_request_key));const old=items.get(body.p_id);
   if((old?.version||0)!==body.p_expected_version)return respond({code:'40001',message:'Cadastro alterado em outra aba'},409);
   const row={id:body.p_id,version:(old?.version||0)+1,data:body.p_data,updatedAt:new Date().toISOString()};items.set(row.id,row);completed.set(body.p_request_key,row);
   if(state.failAfterSave){state.failAfterSave=false;return route.abort('failed');}return respond(row);
  }
  state.alertReads++;const today=body.p_today as string,month=today.slice(0,7),book=records.get(month),generated=generate(month),rows=[...(book?.data.expenses||[])];
  if(book?.status!=='closed'){
   for(const p of generated.payroll)if(!book?.data.appliedTemplateIds?.includes(p.templateId)&&!rows.some(r=>r.payrollId===p.id))rows.push(...payrollExpenses(p,month));
   for(const row of generated.expenses)if(!book?.data.appliedTemplateIds?.includes(row.sourceTemplateId)&&!rows.some(r=>r.sourceTemplateId===row.sourceTemplateId))rows.push(row);
  }
  let overdue=0,dueToday=0,upcoming=0,unscheduled=0;
  for(const row of rows){if(row.amountCents-row.reductionCents-row.paidCents<=0&&row.amountConfirmed!==false)continue;
   if(!row.dueDate)unscheduled++;else if(row.dueDate<today)overdue++;else if(row.dueDate===today)dueToday++;else if(Date.parse(row.dueDate)-Date.parse(today)<=5*86400000)upcoming++;
  }
  return respond({overdue,today:dueToday,upcoming,unscheduled,firstMonth:overdue||dueToday||upcoming||unscheduled?month:null,checkedOn:today});
 });
 await page.evaluate(()=>window.dispatchEvent(new Event('pamda-monthly-accounts-changed')));
 return state;
}
