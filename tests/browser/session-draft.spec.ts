import {test,expect,type Page} from '@playwright/test';
import {setup,selectCatalogProduct} from './support/mockErp';
import {uuid,branchRow} from '../fixtures/customerRows';
import {kitId} from '../fixtures/officialProducts';

test('login inicia no dashboard independentemente da navegação armazenada',async({page})=>{
  await page.addInitScript(key=>sessionStorage.setItem(key,'nova_venda'),`pamda_navigation:https://pamda-test.invalid:${uuid(9000)}`);
  await setup(page,'admin_gerencial',{stayOnDashboard:true});
  await expect(page.getByText('Dashboard Geral',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Nova Venda',exact:true}).last()).toBeVisible();
});

async function refresh(page:Page){
  await page.evaluate(async()=>{
    const path='/src/services/supabase.ts'; const {supabase}=await import(path);
    const {error}=await supabase.auth.refreshSession(); if(error) throw new Error('Synthetic refresh failed');
  });
}
async function reopenSale(page:Page){
  await page.getByRole('button',{name:'Nova Venda',exact:true}).first().click();
  await expect(page.getByRole('heading',{name:/NOVA VENDA \|/})).toBeVisible();
}
async function prepare(page:Page){
  await page.getByRole('button',{name:'+ NOVA VENDA',exact:true}).click();
  await expect(page.getByRole('combobox',{name:'Unidade / Filial',exact:true})).toHaveValue(uuid(1001));
  await selectCatalogProduct(page,kitId(1));
  await page.getByLabel('Valor unitário do item 1').fill('19,99');
  await page.getByLabel('Quantidade do item 1').fill('2');
  await page.getByLabel('Frete cobrado (R$)',{exact:true}).fill('0,00');
  await page.getByLabel('DESCONTO GERENCIAL (R$)',{exact:true}).fill('5,00');
  await page.getByLabel('Motivo do desconto',{exact:true}).fill('Negociação');
  await page.getByLabel('OBSERVAÇÕES',{exact:true}).fill('Preservar preparação');
  await page.locator('details').first().locator('summary').click();
  await page.getByLabel('Modelo informado do item 1').fill('Modelo especial');
}
async function preserved(page:Page){
  await expect(page.getByRole('heading',{name:/NOVA VENDA \|/})).toBeVisible();
  await expect(page.getByRole('combobox',{name:'Cliente',exact:true})).toHaveValue('000001 - Loja Árvore');
  await expect(page.getByRole('combobox',{name:'Unidade / Filial',exact:true})).toHaveValue(uuid(1001));
  await expect(page.getByLabel('Valor unitário do item 1')).toHaveValue('19,99');
  await expect(page.getByLabel('Quantidade do item 1')).toHaveValue('2');
  await expect(page.getByLabel('Frete cobrado (R$)',{exact:true})).toHaveValue('0,00');
  await expect(page.getByLabel('DESCONTO GERENCIAL (R$)',{exact:true})).toHaveValue('5,00');
  await expect(page.getByLabel('Motivo do desconto',{exact:true})).toHaveValue('Negociação');
  await expect(page.getByLabel('OBSERVAÇÕES',{exact:true})).toHaveValue('Preservar preparação');
  const customization=page.locator('details').first();
  if (!await customization.evaluate(element => (element as HTMLDetailsElement).open)) {
    await customization.locator('summary').click();
  }
  await expect(page.getByLabel('Modelo informado do item 1')).toHaveValue('Modelo especial');
  await expect(page.getByTestId('pricing-total')).toContainText('34,98');
}

test('unidade única automática, várias sem marcador exigem escolha e escolha manual sobrevive recarga',async({page})=>{
  const {branches,state}=await setup(page);
  branches.push(branchRow(900,{customer_id:uuid(350),name:'Matriz sem marcador',import_source_customer_code:null}));
  await page.getByRole('button',{name:'Atualizar lista',exact:true}).click();
  await expect(page.getByText('385 unidades',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'+ NOVA VENDA',exact:true}).click();
  const branch=page.getByRole('combobox',{name:'Unidade / Filial',exact:true});
  await expect(branch).toHaveValue(uuid(1001));
  const customer=page.getByRole('combobox',{name:'Cliente',exact:true});
  await customer.fill('350'); await customer.press('Enter'); await expect(branch).toHaveValue('');
  await expect(page.getByText('Selecione a unidade desejada.')).toBeVisible();
  await branch.selectOption(uuid(1900)); await refresh(page); await expect(branch).toHaveValue(uuid(1900));
  await page.reload(); await reopenSale(page); await expect(page.getByRole('combobox',{name:'Unidade / Filial',exact:true})).toHaveValue(uuid(1900));
  await customer.fill('351');await customer.press('Enter');await expect(branch).toHaveValue(uuid(1351));
  expect(state.writes).toEqual([]);
});

test('recarga, navegação e Nova Venda repetida preservam toda a preparação',async({page})=>{
  const {state,sales}=await setup(page); await prepare(page);await expect(page.getByTestId('sale-save-state')).toHaveText('Salvo · Pendente');
  expect(sales.sales[0].first_product_at).not.toBeNull();
  await page.getByRole('button',{name:'Nova Venda',exact:true}).first().click(); await preserved(page);
  await page.getByRole('button',{name:'Produtos & Serviços',exact:true}).click();
  await reopenSale(page); await preserved(page);
  await page.reload(); await reopenSale(page); await preserved(page);
  await expect(page.getByRole('button',{name:'Finalizar venda · TESTE',exact:true})).toBeVisible();
  expect(state.writes).toEqual([]);expect(state.pageErrors).toEqual([]);
});

test('StrictMode não duplica o ciclo de Auth nem perde a preparação em remontagem',async({page})=>{
  const {state}=await setup(page,'admin_gerencial',{strictMode:true});await prepare(page);
  await refresh(page);await preserved(page);await page.reload();await reopenSale(page);await preserved(page);
  expect(state.tokenRequests).toBe(2); // One sign-in and one explicit refresh.
  expect(state.writes).toEqual([]);expect(state.pageErrors).toEqual([]);
});

test('refresh real do SDK e eventos entre abas mantêm navegação e rascunhos independentes',async({page,context})=>{
  const first=await setup(page); await prepare(page);
  const other=await context.newPage();const second=await setup(other,'admin_gerencial',{reuseSession:true});
  await other.getByRole('button',{name:'+ NOVA VENDA',exact:true}).click();
  await expect(other.getByText('Adicione um produto para começar.')).toBeVisible();
  await other.getByLabel('OBSERVAÇÕES',{exact:true}).fill('Somente outra aba');
  for(let i=0;i<4;i++){await other.bringToFront();await refresh(other);await page.bringToFront();await refresh(page);await preserved(page);}
  await expect(other.getByLabel('OBSERVAÇÕES',{exact:true})).toHaveValue('Somente outra aba');
  expect(first.state.refreshRequests).toBeGreaterThanOrEqual(4);expect(second.state.refreshRequests).toBeGreaterThanOrEqual(4);
  expect(first.state.writes).toEqual([]);expect(second.state.writes).toEqual([]);await other.close();
});

test('uso prolongado com auto refresh mantém a preparação (duas horas de relógio simulado)',async({page})=>{
  await page.clock.install();
  const {state}=await setup(page);await prepare(page);
  state.authLifetimeSeconds=120;await refresh(page);
  let count=state.refreshRequests;
  state.serverClockSeconds=90;await page.clock.fastForward(90_000);
  await expect.poll(()=>state.refreshRequests).toBeGreaterThan(count);await preserved(page);
  for(let i=1;i<=12;i++){
    count=state.refreshRequests;state.serverClockSeconds=90+i*600;
    await page.clock.fastForward(600_000);await expect.poll(()=>state.refreshRequests).toBeGreaterThan(count);
    await preserved(page);
  }
  expect(state.writes).toEqual([]);
});

test('falha transitória bloqueia sem apagar; negação de perfil e logout real continuam bloqueando',async({page})=>{
  const {state}=await setup(page);await prepare(page);
  state.profileError='network';await refresh(page);
  await expect(page.getByRole('alertdialog',{name:'Validação da sessão pendente'})).toBeVisible();
  state.profileError='';await page.getByRole('button',{name:'Tentar validar novamente'}).click();await preserved(page);
  state.profileActive=false;await refresh(page);
  await expect(page.getByRole('heading',{name:'Bem-vindo ao PAMDA ERP'})).toBeVisible();
  await expect(page.getByLabel('Valor unitário do item 1')).toHaveCount(0);
  state.profileActive=true;
  await page.getByLabel('E-mail',{exact:true}).fill('ui-test@example.invalid');
  await page.locator('#login-password').fill('synthetic-only');await page.getByRole('button',{name:'Entrar',exact:true}).click();
  await reopenSale(page);await preserved(page); expect(state.writes).toEqual([]);
});

test('logout entre abas não é ignorado, outro usuário não recupera rascunho e nova venda preserva a pendência anterior',async({page,context})=>{
  const {employee,state,sales}=await setup(page);await prepare(page);
  const other=await context.newPage();await setup(other,'admin_gerencial',{reuseSession:true});
  await other.getByRole('button',{name:'Sair do ERP',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Bem-vindo ao PAMDA ERP'})).toBeVisible();await other.close();
  employee.id=uuid(9001);
  await page.getByLabel('E-mail',{exact:true}).fill('another@example.invalid');await page.locator('#login-password').fill('synthetic-only');
  await page.getByRole('button',{name:'Entrar',exact:true}).click();
  await page.getByRole('button',{name:'Nova Venda',exact:true}).last().click();
  await expect(page.getByText('Adicione um produto para começar.')).toBeVisible();
  await expect(page.getByLabel('OBSERVAÇÕES',{exact:true})).toHaveValue('');
  const customer=page.getByRole('combobox',{name:'Cliente',exact:true});
  await customer.fill('350');await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(1);await customer.press('Enter');
  await selectCatalogProduct(page,kitId(1));
  await page.getByLabel('Frete cobrado (R$)',{exact:true}).fill('0,00');
  await expect(page.getByTestId('sale-save-state')).toHaveText('Salvo · Pendente');
  const previous=sales.sales.find(sale=>sale.created_by===employee.id)!;
  await page.getByRole('button',{name:'Nova venda',exact:true}).click();
  await expect(page.getByText('Adicione um produto para começar.')).toBeVisible();await page.reload();await reopenSale(page);
  await expect(page.getByText('Adicione um produto para começar.')).toBeVisible();
  expect(sales.sales.find(sale=>sale.id===previous.id)?.status).toBe('draft');
  expect(sales.writes.filter(write=>write.name==='pamda_cancelar_venda')).toEqual([]);
  expect(state.writes).toEqual([]);
});
