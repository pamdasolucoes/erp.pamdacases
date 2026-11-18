import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMonthlyClosing,calculateMonthlyClosing,timeEntryTotals} from '../src/services/monthlyClosingCalculation';
import {canAccessTab} from '../src/services/access';
import type {MonthlyClosingData} from '../src/types/monthlyClosing';
import type {User} from '../src/types/erp';
const manual=(net:number,month='2026-06')=>{const d=createMonthlyClosing(month);d.shop={mode:'manual',snapshot:null,profitCents:net,shippingCents:0,reason:'Conferência sintética'};return d;};

test('PAM recebe 20% ou mínimo de 1.700, com reserva após PAM e sem divisão com Thales',()=>{
  for(const [profit,pam]of [[0,170000],[849999,170000],[850000,170000],[850003,170001],[1000000,200000],[-50000,170000]]){
    const t=calculateMonthlyClosing(manual(profit));assert.equal(t.pamCents,pam);assert.equal(t.reserveCents,Math.round(Math.max(0,profit-pam)*.1));
    assert.equal(t.withdrawalCents,profit-pam-t.reserveCents!);
  }
});
test('Thales é custo fixo de 2.073 desde setembro, com término opcional inclusivo',()=>{
  const d=manual(1000000,'2026-11');const t=calculateMonthlyClosing(d);
  assert.equal(t.thalesCents,207300);assert.equal(t.netProfitCents,792700);assert.equal(t.pamCents,170000);assert.equal(t.reserveCents,62270);assert.equal(t.withdrawalCents,560430);
  d.rules.thalesUntil='2026-10';assert.equal(calculateMonthlyClosing(d).thalesCents,0);
  d.rules.thalesUntil='2026-11';assert.equal(calculateMonthlyClosing(d).thalesCents,207300);
  assert.equal(calculateMonthlyClosing(manual(1000000,'2026-08')).thalesCents,0);
});
test('entregas descontam seu custo uma vez; dinheiro e adiantamento só afetam o acerto',()=>{
  const d=manual(1000000);d.couriers=[{id:'courier',date:d.start,name:'Motoboy sintético',quantity:7,rateCents:1000,gasCents:2000,cashCents:13000,advanceCents:0,paidCents:-4000}];
  const t=calculateMonthlyClosing(d);assert.equal(t.courierCostCents,9000);assert.equal(t.courierDueCents,-4000);assert.equal(t.courierBalanceCents,0);assert.equal(t.netProfitCents,991000);
});
test('pagamentos não repetem despesas; crédito e valores ainda não pagos permanecem visíveis',()=>{
  const d=manual(1000000);d.expenses=[{id:'expense',description:'Conta sintética',reference:'2026-06',amountCents:2000,reductionCents:100,dueDate:d.start,paidCents:2000,paidOn:d.start}];
  const t=calculateMonthlyClosing(d);assert.equal(t.expensesCents,1900);assert.equal(t.expensesBalanceCents,-100);assert.equal(t.netProfitCents,998100);
});
test('lucro ERP com custos pendentes não vira zero nem libera fechamento calculado',()=>{
  const d=createMonthlyClosing('2026-11');assert.equal(calculateMonthlyClosing(d).netProfitCents,null);
  d.shop.snapshot={id:'snapshot',start:d.start,end:d.end,capturedAt:new Date().toISOString(),saleCount:2,pendingCostCount:1,profitCents:null,shippingCents:500};
  assert.equal(calculateMonthlyClosing(d).pamCents,null);
  d.shop.snapshot={...d.shop.snapshot,pendingCostCount:0,profitCents:500000};assert.equal(calculateMonthlyClosing(d).shopTotalCents,500500);
  d.shop.snapshot.profitCents=2000000000000000;d.rules.pamBps=3333;
  const total=calculateMonthlyClosing(d);
  assert.equal(total.pamCents,Number((BigInt(total.netProfitCents!)*3333n+5000n)/10000n),'percentuais não perdem centavos em totais grandes');
});
test('folha ponto calcula intervalo, horas extras e turno noturno sem lançar custo nas contas',()=>{
  const row={id:'time',date:'2026-06-01',name:'Pessoa sintética',start:'08:00',end:'18:00',breakMinutes:60,expectedMinutes:480,hourCents:1000,extraHourCents:1500};
  assert.deepEqual(timeEntryTotals(row),{worked:540,extra:60,missing:0,value:9500});
  assert.deepEqual(timeEntryTotals({...row,start:'22:00',end:'06:00',breakMinutes:30,expectedMinutes:480}),{worked:450,extra:0,missing:30,value:7500});
  const d=manual(1000000);d.timeEntries=[row];assert.equal(calculateMonthlyClosing(d).netProfitCents,1000000);assert.equal(calculateMonthlyClosing(d).timeValueCents,9500);
});
test('valida centavos, período, duplicatas e datas de pagamentos antes de salvar',()=>{
  const bad=(mutate:(d:MonthlyClosingData)=>void)=>{const d=manual(10000);mutate(d);assert.throws(()=>calculateMonthlyClosing(d));};
  bad(d=>{d.rules.pamMinimumCents=1.5;});bad(d=>{d.end='2026-02-30';});bad(d=>{d.payments.pamCents=100;});
  bad(d=>{d.shopeeCosts=[{id:'x',date:d.start,description:'Custo',amountCents:100},{id:'x',date:d.start,description:'Outro',amountCents:100}];});
  bad(d=>{d.shop.reason='';});bad(d=>{d.rules.thalesUntil='2026-08';});
});
test('área mensal permanece exclusiva de administrador mesmo com permissões amplas em outros perfis',()=>{
  const base={id:'u',name:'QA',username:'qa',createdAt:'2026-01-01',active:true,permissions:{'module.fechamento_mensal':true,'settings.manage':true,'finance.read':true,'profitability.read':true}};
  for(const role of ['gerencial','financeiro','venda_atendimento','producao','estoque_expedicao'] as const)assert.equal(canAccessTab({...base,role} as User,'fechamento_mensal'),false);
  assert.equal(canAccessTab({...base,role:'admin_gerencial'} as User,'fechamento_mensal'),true);
  assert.equal(canAccessTab({...base,role:'admin_gerencial',active:false} as User,'fechamento_mensal'),false);
});
