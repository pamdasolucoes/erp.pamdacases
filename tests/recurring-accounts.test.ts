import {test} from 'node:test';import assert from 'node:assert/strict';
import {createMonthlyClosing,calculateMonthlyClosing} from '../src/services/monthlyClosingCalculation';
import {calculatePayroll,payrollExpenses,syncPayroll,mergeRecurringAccounts,dueDateForMonth,validateRecurringAccount} from '../src/services/recurringAccountCalculation';
import type {MonthlyPayroll} from '../src/types/recurringAccounts';
export const samplePayroll=():MonthlyPayroll=>({id:'employee',templateId:'employee',name:'Pessoa sintética',baseSalaryCents:170000,advanceCents:70000,extraCents:0,otherReductionCents:0,divisorDays100:2100,absenceDays100:150,vtDays100:2300,vtRateCents:1200,vrDays100:2000,vrRateCents:2000,confirmed:false,dueDays:{salary:5,advance:20,vt:1,vr:1}});
test('folha separa salário, adiantamento, faltas, VT e VR sem duplicar custos',()=>{
 const p=samplePayroll(),t=calculatePayroll(p);assert.equal(t.absenceCents,12143);assert.equal(t.salaryNetCents,87857);assert.equal(t.vtCents,27600);assert.equal(t.vrCents,40000);
 const d=syncPayroll(createMonthlyClosing('2026-11'),[p]);assert.equal(d.expenses.length,4);assert.equal(calculateMonthlyClosing(d).expensesCents,225457);
 d.expenses[0].paidCents=20000;d.expenses[0].paidOn='2026-11-05';const next=syncPayroll(d,[{...p,absenceDays100:0}]);assert.equal(next.expenses[0].paidCents,20000);assert.equal(next.expenses[0].id,d.expenses[0].id);
});
test('adiantamento maior que o salário líquido conserva o crédito no acerto',()=>{
 const p={...samplePayroll(),absenceDays100:2000,advanceCents:100000};const t=calculatePayroll(p);const rows=payrollExpenses(p,'2026-11');const advance=rows.find(r=>r.payrollPart==='advance')!;advance.paidCents=100000;advance.paidOn='2026-11-20';
 assert.equal(t.salaryNetCents,0);assert.equal(advance.amountCents,t.advanceCostCents);assert.ok(advance.amountCents-advance.paidCents<0);
 assert.equal(rows.reduce((s,r)=>s+r.amountCents-r.reductionCents,0),170000-t.absenceCents+t.vtCents+t.vrCents);
});
test('edição temporariamente inválida fica na tela e bloqueia salvamento sem perder pagamentos',()=>{
 const p=samplePayroll(),d=syncPayroll(createMonthlyClosing('2026-11'),[p]);d.expenses[0].paidCents=10000;d.expenses[0].paidOn='2026-11-01';
 const invalid=syncPayroll(d,[{...p,divisorDays100:0}]);assert.equal(invalid.expenses[0].paidCents,10000);assert.throws(()=>calculateMonthlyClosing(invalid),/dias-base/);
 const changed=structuredClone(d);changed.expenses[0].amountCents++;assert.throws(()=>calculateMonthlyClosing(changed),/Atualize a folha/);
});
test('vencimentos usam último dia do mês e cadastro não apaga valores ou pagamentos já registrados',()=>{
 assert.equal(dueDateForMonth('2026-02',31),'2026-02-28');assert.equal(dueDateForMonth('2028-02',31),'2028-02-29');assert.equal(dueDateForMonth('2026-11',null),'');
 const d=createMonthlyClosing('2026-11');d.expenses=[{id:'old',description:'Aluguel',reference:d.month,amountCents:123456,reductionCents:0,paidCents:20000,paidOn:d.start,dueDate:d.start}];
 const result=mergeRecurringAccounts(d,{expenses:[{...d.expenses[0],id:'new',description:'ALUGUEL',amountCents:100000,sourceTemplateId:'rent',paidCents:0,paidOn:'',amountConfirmed:false}],payroll:[]});
 assert.equal(result.data.expenses.length,1);assert.equal(result.data.expenses[0].amountCents,123456);assert.equal(result.data.expenses[0].paidCents,20000);assert.equal(result.data.expenses[0].amountConfirmed,true);
});
test('folha manual existente permanece intacta ao trazer cadastros; limites e vigências são validados',()=>{
 const d=createMonthlyClosing('2026-11');d.expenses=[{id:'old',description:'Pagamento Pessoa sintética',reference:d.month,amountCents:170000,reductionCents:0,paidCents:0,paidOn:'',dueDate:''}];
 const merged=mergeRecurringAccounts(d,{expenses:[],payroll:[samplePayroll()]});assert.equal(merged.skipped,1);assert.equal(merged.data.expenses.length,1);assert.deepEqual(merged.data.payroll,[]);
 assert.throws(()=>validateRecurringAccount({name:'Conta',kind:'account',category:'fixed',amountCents:100,variable:false,dueDay:32,remindDays:5,active:true,fromMonth:'2026-11',untilMonth:null,notes:''}));
});
