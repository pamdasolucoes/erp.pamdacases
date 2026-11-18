import {test,expect} from '@playwright/test';
import {setup} from './support/mockErp';
import {mockMonthlyClosing} from './support/mockMonthlyClosing';

async function settleScreenshot(page:import('@playwright/test').Page){
  await page.evaluate(async()=>{window.scrollTo(0,0);await new Promise(requestAnimationFrame);await Promise.all(document.getAnimations().map(animation=>animation.finished.catch(()=>{})));});
}

test('administrador registra contas, Shopee, motoboy e ponto; salva, fecha, consulta e reabre',async({page},testInfo)=>{
  await page.clock.setFixedTime(new Date('2026-11-18T12:00:00-03:00'));
  const {state,sales}=await setup(page,'admin_gerencial',{stayOnDashboard:true});const backend=await mockMonthlyClosing(page);
  await page.getByRole('button',{name:'Fechamento mensal',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Fechamento mensal',exact:true})).toBeVisible();
  await page.getByRole('tab',{name:'Resumo',exact:true}).focus();await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab',{name:'Contas',exact:true})).toHaveAttribute('aria-selected','true');await page.keyboard.press('Home');
  await expect(page.getByRole('button',{name:'Fechar mês',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Atualizar lucro das lojas',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Lucro dos produtos e frete');
  await page.getByRole('tab',{name:'Contas',exact:true}).click();await page.getByRole('button',{name:'Adicionar contas',exact:true}).click();
  await page.getByLabel('Conta descrição 1',{exact:true}).fill('Aluguel sintético');await page.getByLabel('Conta valor 1',{exact:true}).fill('1000,00');
  await page.getByLabel('Conta pago 1',{exact:true}).fill('400,00');await page.getByLabel('Conta pago em 1',{exact:true}).fill('2026-11-10');
  await page.getByLabel('Thales pago',{exact:true}).fill('2073,00');await page.getByLabel('Thales pago em',{exact:true}).fill('2026-11-05');
  await page.getByRole('tab',{name:'Shopee',exact:true}).click();await page.getByRole('button',{name:'Adicionar recebimentos shopee',exact:true}).click();
  await page.getByLabel('Recebimentos Shopee descrição 1',{exact:true}).fill('Saque Pamda sintético');await page.getByLabel('Recebimentos Shopee valor 1',{exact:true}).fill('2000,00');
  await page.getByRole('button',{name:'Adicionar custos shopee',exact:true}).click();await page.getByLabel('Custos Shopee descrição 1',{exact:true}).fill('Custo sintético');await page.getByLabel('Custos Shopee valor 1',{exact:true}).fill('500,00');
  await page.getByRole('tab',{name:'Entregas',exact:true}).click();await page.getByRole('button',{name:'Adicionar entregas',exact:true}).click();
  await page.getByLabel('Entrega motoboy 1',{exact:true}).fill('Motoboy sintético');await page.getByLabel('Entrega quantidade 1',{exact:true}).fill('3');
  await page.getByLabel('Entrega combustível 1',{exact:true}).fill('20,00');await page.getByLabel('Entrega dinheiro recebido 1',{exact:true}).fill('40,00');await page.getByLabel('Entrega pago (+) / recebido (-) 1',{exact:true}).fill('10,00');
  await page.getByRole('tab',{name:'Folha ponto',exact:true}).click();await page.getByRole('button',{name:'Adicionar folha ponto',exact:true}).click();
  await page.getByLabel('Ponto nome 1',{exact:true}).fill('Pessoa sintética');await page.getByLabel('Ponto saída 1',{exact:true}).fill('18:00');await page.getByLabel('Ponto valor hora 1',{exact:true}).fill('10,00');await page.getByLabel('Ponto valor hora extra 1',{exact:true}).fill('15,00');
  await expect(page.getByRole('cell',{name:'9h 00min',exact:true})).toBeVisible();
  await page.getByRole('tab',{name:'Resumo',exact:true}).click();await page.getByLabel('PAM pago',{exact:true}).fill('1000,00');await page.getByLabel('PAM pago em',{exact:true}).fill('2026-11-18');
  await page.getByRole('button',{name:'Salvar rascunho',exact:true}).click();await expect(page.getByRole('status')).toContainText('Fechamento mensal salvo');
  const record=backend.records.get('2026-11')!;
  expect(record.totals).toMatchObject({thalesCents:207300,netProfitCents:857700,pamCents:171540,pamBalanceCents:71540,reserveCents:68616,withdrawalCents:617544,courierCostCents:5000,courierBalanceCents:0,timeValueCents:9500,expensesBalanceCents:60000});
  await settleScreenshot(page);await page.screenshot({path:testInfo.outputPath('monthly-closing-desktop.png'),fullPage:true});
  await page.getByRole('button',{name:'Fechar mês',exact:true}).click();
  await expect(page.getByRole('button',{name:'Confirmar fechamento',exact:true})).toBeFocused();await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('dialog',{name:'Fechar mês',exact:true}).getByRole('button',{name:'Voltar',exact:true})).toBeFocused();
  await page.getByRole('button',{name:'Confirmar fechamento',exact:true}).click();await expect(page.getByRole('status')).toContainText('Mês fechado');
  await page.reload();await expect(page.getByRole('button',{name:'Reabrir mês',exact:true})).toBeVisible();
  await expect(page.getByLabel('PAM pago',{exact:true})).toBeDisabled();expect(backend.profitReads).toBe(1);
  await page.getByRole('button',{name:'Reabrir mês',exact:true}).click();await page.getByLabel('Motivo da reabertura',{exact:true}).fill('Conferir despesas');await page.getByRole('button',{name:'Confirmar reabertura',exact:true}).click();
  await expect(page.getByLabel('PAM pago',{exact:true})).toBeEnabled();
  await page.setViewportSize({width:390,height:844});await settleScreenshot(page);await page.screenshot({path:testInfo.outputPath('monthly-closing-mobile.png'),fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(sales.writes).toEqual([]);expect(state.writes).toEqual([]);expect(state.pageErrors).toEqual([]);
});

test('novo mês copia apenas contas e vencimentos; regras e pagamentos do anterior permanecem preservados',async({page})=>{
  await page.clock.setFixedTime(new Date('2026-11-18T12:00:00-03:00'));
  await setup(page,'admin_gerencial',{stayOnDashboard:true});const backend=await mockMonthlyClosing(page);
  await page.getByRole('button',{name:'Fechamento mensal',exact:true}).click();await page.getByLabel('Mês de referência',{exact:true}).fill('2026-10');
  await page.getByRole('tab',{name:'Contas',exact:true}).click();await page.getByRole('button',{name:'Adicionar contas',exact:true}).click();
  await page.getByLabel('Conta descrição 1',{exact:true}).fill('Aluguel sintético');await page.getByLabel('Conta valor 1',{exact:true}).fill('1000,00');await page.getByLabel('Conta redução 1',{exact:true}).fill('10,00');
  await page.getByLabel('Conta vencimento 1',{exact:true}).fill('2026-10-31');await page.getByLabel('Conta pago 1',{exact:true}).fill('400,00');await page.getByLabel('Conta pago em 1',{exact:true}).fill('2026-10-20');
  await page.getByRole('tab',{name:'Regras',exact:true}).click();await page.getByLabel('Thales último mês',{exact:true}).fill('2026-10');
  await page.getByRole('button',{name:'Salvar rascunho',exact:true}).click();await expect(page.getByRole('status')).toContainText('Fechamento mensal salvo');
  const original=structuredClone(backend.records.get('2026-10'));
  await page.getByLabel('Mês de referência',{exact:true}).fill('2026-11');await page.getByRole('tab',{name:'Contas',exact:true}).click();
  await page.getByRole('button',{name:'Copiar contas do mês anterior',exact:true}).click();await expect(page.getByRole('status')).toContainText('Contas copiadas');
  await expect(page.getByLabel('Conta descrição 1',{exact:true})).toHaveValue('Aluguel sintético');await expect(page.getByLabel('Conta vencimento 1',{exact:true})).toHaveValue('2026-11-30');
  await expect(page.getByLabel('Conta pago 1',{exact:true})).toHaveValue('0,00');await expect(page.getByLabel('Conta redução 1',{exact:true})).toHaveValue('0,00');
  await page.getByRole('button',{name:'Salvar rascunho',exact:true}).click();await expect(page.getByRole('status')).toContainText('Fechamento mensal salvo');
  expect(backend.records.get('2026-11')?.totals.thalesCents).toBe(0);expect(backend.records.get('2026-10')).toEqual(original);
});

test('não administrador não vê a área e a chamada direta também é negada',async({page})=>{
  await setup(page,'financeiro',{stayOnDashboard:true,permissions:{'settings.manage':true,'module.fechamento_mensal':true}});await mockMonthlyClosing(page,false);
  await expect(page.getByRole('button',{name:'Fechamento mensal',exact:true})).toHaveCount(0);
  const code=await page.evaluate(async()=>{const path='/src/services/supabase.ts';const {supabase}=await import(path);const {error}=await supabase.rpc('pamda_monthly_closing_read',{p_month:'2026-11'});return error?.code;});
  expect(code).toBe('42501');
});

test('custos pendentes bloqueiam fechamento; resposta perdida mantém edição e repete sem duplicar',async({page})=>{
  await page.clock.setFixedTime(new Date('2026-11-18T12:00:00-03:00'));
  await setup(page,'admin_gerencial',{stayOnDashboard:true});const backend=await mockMonthlyClosing(page);backend.pendingCosts=1;
  await page.getByRole('button',{name:'Fechamento mensal',exact:true}).click();await page.getByRole('button',{name:'Atualizar lucro das lojas',exact:true}).click();
  await expect(page.getByRole('button',{name:'Fechar mês',exact:true})).toBeDisabled();
  backend.pendingCosts=0;await page.getByRole('button',{name:'Atualizar lucro das lojas',exact:true}).click();
  await page.getByLabel('Observações do fechamento',{exact:true}).fill('Preservar anotação');backend.failAfterSave=true;
  await page.getByRole('button',{name:'Salvar rascunho',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Resultado não confirmado');
  await expect(page.getByLabel('Observações do fechamento',{exact:true})).toHaveValue('Preservar anotação');
  await page.getByRole('button',{name:'Salvar rascunho',exact:true}).click();await expect(page.getByRole('status')).toContainText('Fechamento mensal salvo');
  expect(backend.records.get('2026-11')?.version).toBe(1);expect(backend.requests[0].p_request_key).toBe(backend.requests[1].p_request_key);
  const before=backend.reads;await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));});
  expect(backend.reads).toBe(before);expect(backend.profitReads).toBe(2);
});
