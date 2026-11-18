import {test,expect} from '@playwright/test';import {setup} from './support/mockErp';import {mockMonthlyClosing} from './support/mockMonthlyClosing';import {mockRecurringAccounts} from './support/mockRecurringAccounts';
import type {RecurringAccountData} from '../../src/types/recurringAccounts';
const rent:RecurringAccountData={name:'Aluguel sintético',kind:'account',category:'fixed',amountCents:100000,variable:true,dueDay:10,remindDays:5,active:true,fromMonth:'2026-11',untilMonth:null,notes:'Conferir boleto mensal'};
async function ready(page:import('@playwright/test').Page,initial:RecurringAccountData[]=[]){
 await page.clock.setFixedTime(new Date('2026-11-18T12:00:00-03:00'));
 const first=page.waitForResponse(r=>new URL(r.url()).pathname==='/rest/v1/rpc/pamda_monthly_accounts_alerts');
 const app=await setup(page,'admin_gerencial',{stayOnDashboard:true});await first;
 const closing=await mockMonthlyClosing(page),accounts=await mockRecurringAccounts(page,closing.records,initial);return {app,closing,accounts};
}
test('aviso no ERP abre as contas corretas; pagamento parcial e valor mensal não alteram cadastro',async({page},testInfo)=>{
 const {closing,accounts,app}=await ready(page,[rent]);
 const notice=page.getByRole('region',{name:'Lembretes de contas'});await expect(notice).toContainText('1 atrasada');await notice.getByRole('button',{name:'Ver contas a pagar'}).click();
 await expect(page.getByLabel('Conta descrição 1',{exact:true})).toHaveValue(rent.name);
 await page.getByLabel('Conta valor 1',{exact:true}).fill('1250,00');await page.getByLabel('Conta pago 1',{exact:true}).fill('500,00');await page.getByLabel('Conta pago em 1',{exact:true}).fill('2026-11-18');
 await page.getByRole('button',{name:'Salvar rascunho',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Fechamento mensal salvo'})).toBeVisible();
 expect(closing.records.get('2026-11')?.data.expenses[0]).toMatchObject({amountCents:125000,paidCents:50000,amountConfirmed:true,dueDate:'2026-11-10'});expect([...accounts.items.values()][0].data.amountCents).toBe(100000);
 await page.getByLabel('Conta pago 1',{exact:true}).fill('1250,00');await page.getByRole('button',{name:'Salvar rascunho',exact:true}).click();await expect(notice).toHaveCount(0);
 const reads=accounts.alertReads;await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));});expect(accounts.alertReads).toBe(reads);
 await page.getByRole('button',{name:'Contas fixas',exact:true}).click();await page.getByRole('button',{name:'Editar Aluguel sintético',exact:true}).click();
 await page.getByLabel('Valor previsto do cadastro',{exact:true}).fill('1300,00');await page.getByLabel('Dia do vencimento',{exact:true}).fill('20');await page.getByRole('button',{name:'Salvar cadastro',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Cadastro de conta fixa'})).toHaveCount(0);
 await page.getByLabel('Mês de referência',{exact:true}).fill('2026-12');await page.getByRole('button',{name:'Lançamentos',exact:true}).click();
 await expect(page.getByLabel('Conta valor 1',{exact:true})).toHaveValue('1300,00');await expect(page.getByLabel('Conta vencimento 1',{exact:true})).toHaveValue('2026-12-20');await expect(page.getByLabel('Conta pago 1',{exact:true})).toHaveValue('0,00');
 expect(closing.records.get('2026-11')?.data.expenses[0].amountCents).toBe(125000);
 await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:testInfo.outputPath('recurring-accounts-desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Contas fixas',exact:true}).click();await page.getByRole('button',{name:'Novo cadastro',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:testInfo.outputPath('recurring-accounts-mobile.png'),fullPage:true});await page.getByRole('button',{name:'Voltar',exact:true}).click();
 expect(app.state.pageErrors).toEqual([]);
});
test('folha organiza faltas, VT, VR e adiantamento nas mesmas contas do fechamento',async({page})=>{
 const payroll={name:'Pessoa sintética',baseSalaryCents:170000,advanceCents:70000,extraCents:0,otherReductionCents:0,divisorDays100:0,absenceDays100:0,vtDays100:2300,vtRateCents:1200,vrDays100:2000,vrRateCents:2000,dueDays:{salary:5,advance:20,vt:1,vr:1}};
 const {closing,app}=await ready(page,[{...rent,name:payroll.name,kind:'payroll',category:'salary',payroll}]);
 await page.getByRole('button',{name:'Fechamento mensal',exact:true}).click();await page.getByRole('tab',{name:'Contas',exact:true}).click();await page.getByRole('button',{name:'Folha de pagamento',exact:true}).click();
 await page.getByLabel('Pessoa sintética Dias de falta',{exact:true}).fill('1.5');await expect(page.getByText('Informe os dias-base do mês para descontar as faltas.',{exact:true}).first()).toBeVisible();
 await page.getByLabel('Pessoa sintética Dias-base para faltas',{exact:true}).fill('21');await expect(page.getByText('R$ 121,43',{exact:true})).toBeVisible();
 await page.getByRole('checkbox',{name:'Folha de Pessoa sintética conferida',exact:true}).check();await page.getByRole('button',{name:'Lançamentos',exact:true}).click();
 await expect(page.getByLabel('Conta valor 1',{exact:true})).toBeDisabled();await expect(page.getByLabel('Conta redução 1',{exact:true})).toHaveValue('121,43');
 await page.getByLabel('Conta pago 1',{exact:true}).fill('500,00');await page.getByLabel('Conta pago em 1',{exact:true}).fill('2026-11-18');
 await page.getByRole('button',{name:'Salvar rascunho',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Fechamento mensal salvo'})).toBeVisible();
 expect(closing.records.get('2026-11')?.totals.expensesCents).toBe(225457);expect(closing.records.get('2026-11')?.data.expenses).toHaveLength(4);
 expect(app.state.pageErrors).toEqual([]);
});
test('cadastro com resposta perdida mantém chave e identificador sem criar conta duplicada',async({page})=>{
 const {accounts}=await ready(page);await page.getByRole('button',{name:'Fechamento mensal',exact:true}).click();await page.getByRole('tab',{name:'Contas',exact:true}).click();await page.getByRole('button',{name:'Contas fixas',exact:true}).click();
 await page.getByRole('button',{name:'Novo cadastro',exact:true}).click();await page.getByLabel('Nome do cadastro',{exact:true}).fill('Conta sintética');await page.getByLabel('Valor previsto do cadastro',{exact:true}).fill('250,00');await page.getByLabel('Dia do vencimento',{exact:true}).fill('20');
 accounts.failAfterSave=true;await page.getByRole('button',{name:'Salvar cadastro',exact:true}).click();await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Resultado não confirmado');
 await page.getByRole('button',{name:'Salvar cadastro',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 expect(accounts.items.size).toBe(1);expect(accounts.writes[0].p_id).toBe(accounts.writes[1].p_id);expect(accounts.writes[0].p_request_key).toBe(accounts.writes[1].p_request_key);
});
