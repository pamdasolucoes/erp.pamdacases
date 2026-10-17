import {test,expect,type Page} from '@playwright/test';
import {setup,selectCatalogProduct} from './support/mockErp';
import {kitId} from '../fixtures/officialProducts';
import {uuid} from '../fixtures/customerRows';

async function openCustomerSale(page:Page){await page.getByRole('button',{name:'+ NOVA VENDA',exact:true}).click();}
async function saved(page:Page){await expect(page.getByTestId('sale-save-state')).toHaveText('Salvo · Pendente');}
async function pendingList(page:Page){await page.getByRole('button',{name:'Todas as Vendas',exact:true}).click();await expect(page.getByRole('heading',{name:'Pedidos & Pendências'})).toBeVisible();}

test('abrir página sem cliente não cria venda; cliente e unidade criam mesmo sem itens e sair mantém pendência',async({page})=>{
  const {sales,state}=await setup(page);
  await page.getByRole('button',{name:'Nova Venda',exact:true}).last().click();expect(sales.writes).toEqual([]);
  const customer=page.getByRole('combobox',{name:'Cliente',exact:true});await customer.fill('350');await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(1);await customer.press('Enter');
  await pendingList(page);
  await expect(page.getByRole('row').filter({hasText:'Cristal Centro'})).toContainText('Pendente');
  expect(sales.sales).toHaveLength(1);expect(sales.items).toHaveLength(0);expect(sales.sales[0].shipping_confirmed).toBe(false);
  expect(sales.sales[0].status).toBe('draft');expect(sales.events.filter(e=>e.event_type==='sale_started')).toHaveLength(1);
  expect(sales.inventoryWrites).toBe(0);expect(sales.financialWrites).toBe(0);expect(state.writes).toEqual([]);
});

test('início com resposta perdida repete a mesma chave sem duplicar e preserva cliente original da tentativa',async({page})=>{
  const {sales}=await setup(page);sales.failStartAfterCommit=true;
  await openCustomerSale(page);await expect(page.getByTestId('sale-save-state')).toHaveText('Erro ao salvar');
  const first=sales.writes.find(write=>write.name==='pamda_iniciar_venda')!;
  await page.reload();await saved(page);
  const starts=sales.writes.filter(write=>write.name==='pamda_iniciar_venda');
  expect(starts.length).toBeGreaterThanOrEqual(2);expect(starts.every(write=>write.body.p_draft_key===first.body.p_draft_key)).toBe(true);
  expect(sales.sales).toHaveLength(1);expect(sales.events.filter(e=>e.event_type==='sale_started')).toHaveLength(1);
  expect(sales.writes.filter(write=>write.name==='pamda_salvar_rascunho_venda').every(write=>write.body.p_venda_id===sales.sales[0].id)).toBe(true);
});

test('salva preços, personalização, frete e desconto serialmente e retoma itens oficiais após recarregar',async({page})=>{
  const {sales,products}=await setup(page);await openCustomerSale(page);await saved(page);sales.saveDelay=80;
  await selectCatalogProduct(page,kitId(1));await page.getByLabel('Quantidade do item 1').fill('2');
  await page.getByLabel('Valor unitário do item 1').fill('20,00');
  await page.getByLabel('DESCONTO GERENCIAL (R$)',{exact:true}).fill('5,00');
  await page.getByLabel('Motivo do desconto',{exact:true}).fill('Negociação aprovada');
  await page.getByLabel('Frete cobrado (R$)',{exact:true}).fill('0,00');
  await page.getByLabel('OBSERVAÇÕES',{exact:true}).fill('Persistir observação');
  await page.locator('details').first().locator('summary').click();
  await page.getByLabel('Modelo informado do item 1').fill('iPhone 11');await page.getByLabel('Cor informada do item 1').fill('Preto');
  await page.getByLabel('Faces da carteira do item 1').selectOption('2');await saved(page);
  expect(sales.maxConcurrent).toBe(1);expect(sales.sales[0].total).toBe(35);expect(sales.items).toHaveLength(1);
  expect(sales.items[0].customization).toMatchObject({model:'iPhone 11',color:'Preto',walletFaces:'2'});
  expect(products.find(p=>p.id===kitId(1))!.sale_price).toBe(25);
  await page.reload();await saved(page);
  await expect(page.getByLabel('Valor unitário do item 1')).toHaveValue('20,00');await expect(page.getByLabel('Quantidade do item 1')).toHaveValue('2');
  await expect(page.getByLabel('OBSERVAÇÕES',{exact:true})).toHaveValue('Persistir observação');await expect(page.getByTestId('pricing-total')).toContainText('35,00');
  await page.getByRole('button',{name:'Remover item 1',exact:true}).click();
  await page.getByLabel('DESCONTO GERENCIAL (R$)',{exact:true}).fill('0,00');await saved(page);
  expect(sales.sales).toHaveLength(1);expect(sales.items).toHaveLength(0);expect(sales.sales[0].status).toBe('draft');
});

test('lista oficial recupera uma pendência sem depender do armazenamento local',async({page})=>{
  const {sales}=await setup(page);await openCustomerSale(page);await selectCatalogProduct(page,kitId(1));
  await page.getByLabel('Frete cobrado (R$)',{exact:true}).fill('0,00');await page.getByLabel('OBSERVAÇÕES',{exact:true}).fill('Salvo no servidor');await saved(page);
  await pendingList(page);await page.evaluate(()=>sessionStorage.clear());await page.reload();
  await page.getByRole('button',{name:'Todas as Vendas',exact:true}).click();
  await page.getByRole('button',{name:'Continuar venda',exact:true}).click();await saved(page);
  await expect(page.getByLabel('Quantidade do item 1')).toHaveValue('1');await expect(page.getByLabel('OBSERVAÇÕES',{exact:true})).toHaveValue('Salvo no servidor');
  expect(sales.sales).toHaveLength(1);expect(sales.writes.filter(write=>write.name==='pamda_iniciar_venda')).toHaveLength(1);
});

test('vendedor só continua suas pendências e não cancela; servidor rejeita tentativa sem permissão',async({page})=>{
  const {sales}=await setup(page,'venda_atendimento');
  await page.getByRole('button',{name:'Nova Venda',exact:true}).last().click();
  const customer=page.getByRole('combobox',{name:'Cliente',exact:true});await customer.fill('350');await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(1);await customer.press('Enter');await saved(page);
  await pendingList(page);await expect(page.getByRole('button',{name:'Continuar venda',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Cancelar venda',exact:true})).toHaveCount(0);
  const result=await page.evaluate(async id=>{
    const path='/src/services/supabase.ts';const {supabase}=await import(path);const {error}=await supabase.rpc('pamda_cancelar_venda',{p_venda_id:id,p_motivo:'Tentativa sem permissão'});return error?.code;
  },sales.sales[0].id);
  expect(result).toBe('42501');expect(sales.sales[0].status).toBe('draft');
});

test('administrador cancela com motivo, histórico permanece e venda cancelada fica bloqueada',async({page},testInfo)=>{
  const {sales}=await setup(page);await openCustomerSale(page);await saved(page);await pendingList(page);
  await page.screenshot({path:testInfo.outputPath('lista-pendencias.png')});
  await page.getByRole('button',{name:'Cancelar venda',exact:true}).click();
  await expect(page.getByRole('button',{name:'Confirmar cancelamento',exact:true})).toBeDisabled();
  await page.getByLabel('Motivo do cancelamento',{exact:true}).fill('Solicitação do cliente');
  await page.getByRole('button',{name:'Confirmar cancelamento',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Detalhes da venda'})).toContainText('Solicitação do cliente');
  await expect(page.getByRole('dialog',{name:'Detalhes da venda'})).toContainText('Teste isolado');
  await page.screenshot({path:testInfo.outputPath('cancelamento-historico.png')});
  expect(sales.sales).toHaveLength(1);expect(sales.sales[0].status).toBe('cancelled');
  await page.getByRole('button',{name:'Fechar detalhes'}).click();await page.getByRole('button',{name:'Histórico',exact:true}).click();
  await expect(page.getByRole('row').filter({hasText:'Loja Árvore'})).toContainText('Cancelada');
  await page.getByRole('button',{name:'Nova Venda',exact:true}).last().click();
  await expect(page.getByLabel('OBSERVAÇÕES',{exact:true})).toBeDisabled();
  expect(sales.inventoryWrites).toBe(0);expect(sales.financialWrites).toBe(0);
});

test('permissão individual habilita cancelar e revogação no servidor continua sendo respeitada',async({page})=>{
  const {sales}=await setup(page,'venda_atendimento');sales.permissions['sales.cancel']=true;
  await page.getByRole('button',{name:'Nova Venda',exact:true}).last().click();const customer=page.getByRole('combobox',{name:'Cliente',exact:true});await customer.fill('350');await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(1);await customer.press('Enter');await saved(page);
  await pendingList(page);await page.getByRole('button',{name:'Cancelar venda',exact:true}).click();
  sales.permissions['sales.cancel']=false;
  await page.getByLabel('Motivo do cancelamento',{exact:true}).fill('Permissão revogada');await page.getByRole('button',{name:'Confirmar cancelamento',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'não tem permissão'})).toBeVisible();expect(sales.sales[0].status).toBe('draft');
});

test('venda confirmada não oferece cancelamento e RPC rejeita estorno indevido',async({page})=>{
  const {sales}=await setup(page);await openCustomerSale(page);await saved(page);sales.sales[0].status='confirmed';sales.sales[0].confirmed_at=new Date().toISOString();
  await pendingList(page);await page.getByRole('button',{name:'Histórico',exact:true}).click();
  await expect(page.getByRole('button',{name:'Cancelar venda',exact:true})).toHaveCount(0);
  const code=await page.evaluate(async id=>{const path='/src/services/supabase.ts';const {supabase}=await import(path);const {error}=await supabase.rpc('pamda_cancelar_venda',{p_venda_id:id,p_motivo:'Não permitido'});return error?.code;},sales.sales[0].id);
  expect(code).toBe('P0001');expect(sales.sales[0].status).toBe('confirmed');
});

test('troca de cliente durante início mantém uma venda e serializa a mudança de contexto',async({page})=>{
  const {sales}=await setup(page);sales.startDelay=180;await openCustomerSale(page);
  const customer=page.getByRole('combobox',{name:'Cliente',exact:true});
  await customer.fill('350');await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(1);await customer.press('Enter');
  await saved(page);expect(sales.sales).toHaveLength(1);expect(sales.sales[0].customer_id).toBe(uuid(350));
  expect(sales.writes.filter(write=>write.name==='pamda_iniciar_venda')).toHaveLength(1);
  expect(sales.writes[0].body.p_cliente_id).toBe(uuid(1));
});

test('salvamento negado não anuncia sucesso, conserva edição e não descarta pendência ao tentar outra venda',async({page})=>{
  const {sales}=await setup(page,'venda_atendimento');await page.getByRole('button',{name:'Nova Venda',exact:true}).last().click();
  const customer=page.getByRole('combobox',{name:'Cliente',exact:true});await customer.fill('350');await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(1);await customer.press('Enter');await saved(page);
  await page.getByLabel('Frete cobrado (R$)',{exact:true}).fill('15,00');
  await expect(page.getByTestId('sale-save-state')).toHaveText('Erro ao salvar');
  await page.getByRole('button',{name:'Nova venda',exact:true}).click();
  await expect(page.getByLabel('Frete cobrado (R$)',{exact:true})).toHaveValue('15,00');expect(sales.sales[0].shipping_confirmed).toBe(false);
  sales.permissions['sales.shipping.override']=true;await page.getByRole('button',{name:'Tentar salvar novamente',exact:true}).click();await saved(page);
  expect(sales.sales[0].shipping_charged).toBe(15);expect(sales.sales).toHaveLength(1);
});
