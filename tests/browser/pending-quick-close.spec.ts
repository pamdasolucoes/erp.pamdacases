import {test,expect,type Page} from '@playwright/test';
import {setup,selectCatalogProduct} from './support/mockErp';
import {kitId} from '../fixtures/officialProducts';
import {uuid} from '../fixtures/customerRows';

async function prepare(page:Page){
 await page.getByRole('navigation').getByRole('button',{name:'Nova Venda',exact:true}).click();
 const customer=page.getByRole('combobox',{name:'Cliente',exact:true});await customer.fill('350');await customer.press('Enter');
 await selectCatalogProduct(page,kitId(1));
 await expect(page.getByTestId('sale-save-state')).toHaveText('Salvo · Pendente');
 await page.getByRole('button',{name:'Pendências',exact:true}).click();
}

test('admin fecha direto da lista com pagamentos divididos, sem abrir a venda, e atualiza os totais',async({page},testInfo)=>{
 const {sales,admin}=await setup(page);await prepare(page);
 const sale=sales.sales[0];sale.payment_method_id=uuid(5501);const calls:any[]=[];
 admin.methods.push({id:uuid(5501),code:'dinheiro',name:'Dinheiro',active:true,created_at:'2026-01-01T00:00:00Z'});
 await page.getByRole('checkbox',{name:'Selecionar pedido 10000',exact:true}).check();
 await page.route('**/rest/v1/rpc/pamda_finalize_sale',async route=>{
  const body=route.request().postDataJSON();calls.push(body);expect(body.p_sale_id).toBe(sale.id);
  sale.status='confirmed';sale.is_test=false;sale.confirmed_at=new Date().toISOString();
  await route.fulfill({json:{sale_id:sale.id,status:'confirmed'}});
 });
 await page.getByRole('button',{name:'Fechar pedido',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Finalizar venda',exact:true});
 await expect(dialog).toContainText('Finalizar pedido 10000');await expect(dialog).toContainText('350');
 await expect(dialog.getByRole('combobox')).toHaveValue('dinheiro');await expect(dialog.getByRole('spinbutton')).toHaveValue('25');
 await expect(page.getByTestId('sale-save-state')).toHaveCount(0);
 await dialog.getByRole('spinbutton').fill('10');await expect(dialog.getByRole('button',{name:'Confirmar venda',exact:true})).toBeDisabled();
 await dialog.getByRole('button',{name:'Adicionar pagamento',exact:true}).click();
 await dialog.getByRole('combobox').nth(1).selectOption('pix');await dialog.getByRole('spinbutton').nth(1).fill('15');
 await page.screenshot({path:testInfo.outputPath('fechar-pedido-na-lista.png')});
 await dialog.getByRole('button',{name:'Confirmar venda',exact:true}).click();
 await expect(page.getByText('Pedido 10000 fechado com sucesso.',{exact:true})).toBeVisible();
 await expect(dialog).toHaveCount(0);await expect(page.getByTestId('pending-visible-total')).toContainText('0,00');
 await expect(page.getByTestId('pending-selected-total')).toContainText('0,00');
 expect(calls).toHaveLength(1);expect(calls[0].p_payments).toEqual([
  {method_code:'dinheiro',amount:10,status:'paid',channel:'erp'},
  {method_code:'pix',amount:15,status:'paid',channel:'erp'},
 ]);
 await expect(page.getByRole('button',{name:'Fechar pedido',exact:true})).toHaveCount(0);
});

test('operadora autorizada fecha pedido de outro responsável sem permissão financeira geral',async({page})=>{
 const {sales}=await setup(page,'venda_atendimento',{permissions:{'sales.confirm':true}});sales.permissions['sales.confirm']=true;
 await prepare(page);const sale=sales.sales[0];sale.created_by=uuid(99000);
 let submitted=false;
 await page.route('**/rest/v1/rpc/pamda_finalize_sale',async route=>{
  submitted=true;sale.status='confirmed';sale.is_test=false;sale.confirmed_at=new Date().toISOString();
  await route.fulfill({json:{sale_id:sale.id,status:'confirmed'}});
 });
 await page.getByRole('button',{name:'Fechar pedido',exact:true}).click();
 await page.getByRole('dialog',{name:'Finalizar venda'}).getByRole('button',{name:'Confirmar venda',exact:true}).click();
 await expect(page.getByText('Pedido 10000 fechado com sucesso.',{exact:true})).toBeVisible();expect(submitted).toBe(true);
});

test('usuário sem sales.confirm não recebe o botão de fechamento',async({page})=>{
 await setup(page,'venda_atendimento',{permissions:{'sales.confirm':false}});await prepare(page);
 await expect(page.getByRole('button',{name:'Fechar pedido',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Pedido 10000',exact:true})).toBeVisible();
});

test('cancelar a janela não altera o pedido e permite abri-lo novamente',async({page})=>{
 const {sales}=await setup(page);await prepare(page);const before=JSON.stringify(sales.writes);
 await page.getByRole('button',{name:'Fechar pedido',exact:true}).click();
 await page.getByRole('dialog',{name:'Finalizar venda'}).getByRole('button',{name:'Voltar',exact:true}).click();
 expect(sales.sales[0].status).toBe('draft');expect(JSON.stringify(sales.writes)).toBe(before);
 await page.getByRole('button',{name:'Fechar pedido',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Finalizar venda'})).toBeVisible();
});

test('revalida a permissão ao abrir e mantém o pedido acessível se faltarem dados',async({page})=>{
 const {sales}=await setup(page);await prepare(page);const sale=sales.sales[0];sale.shipping_confirmed=false;
 await page.getByRole('button',{name:'Fechar pedido',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('frete confirmado');
 await expect(page.getByRole('dialog',{name:'Finalizar venda'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Pedido 10000',exact:true})).toBeVisible();
 sale.shipping_confirmed=true;sales.permissions['sales.confirm']=false;
 await page.getByRole('button',{name:'Fechar pedido',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('não tem permissão');
 await expect(page.getByRole('button',{name:'Fechar pedido',exact:true})).toHaveCount(0);
 expect(sale.status).toBe('draft');
});

test('revogação no servidor impede fechar uma janela já aberta e não anuncia sucesso',async({page})=>{
 const {sales}=await setup(page);await prepare(page);
 await page.getByRole('button',{name:'Fechar pedido',exact:true}).click();
 await page.route('**/rest/v1/rpc/pamda_finalize_sale',route=>route.fulfill({status:403,json:{code:'42501',message:'Permissão revogada'}}));
 const dialog=page.getByRole('dialog',{name:'Finalizar venda'});
 await dialog.getByRole('button',{name:'Confirmar venda',exact:true}).click();
 await expect(dialog.getByRole('alert')).toContainText('não tem permissão');
 await expect(page.getByText('Pedido 10000 fechado com sucesso.',{exact:true})).toHaveCount(0);
 expect(sales.sales[0].status).toBe('draft');
});
