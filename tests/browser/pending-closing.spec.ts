import {test,expect} from '@playwright/test';
import {setup,selectCatalogProduct} from './support/mockErp';
import {kitId} from '../fixtures/officialProducts';
import {uuid} from '../fixtures/customerRows';

test('operadora autorizada abre produtos e pedido de outro responsável e seleciona mesclagem',async({page})=>{
 const {sales}=await setup(page,'venda_atendimento');sales.permissions['sales.confirm']=true;
 await page.getByRole('navigation').getByRole('button',{name:'Nova Venda',exact:true}).click();const customer=page.getByRole('combobox',{name:'Cliente',exact:true});await customer.fill('350');await customer.press('Enter');
 await selectCatalogProduct(page,kitId(1));
 await expect(page.getByTestId('sale-save-state')).toHaveText('Salvo · Pendente');
 const source=sales.sales[0];source.created_by=uuid(99000);
 const second={...source,id:uuid(99001),order_number:10001,draft_key:uuid(99002)};sales.sales.push(second);
 sales.items.push({...sales.items[0],id:uuid(99003),sale_id:second.id});
 await page.getByRole('button',{name:'Pendências',exact:true}).click();
 await page.getByRole('button',{name:`Ver produtos do pedido ${source.order_number}`,exact:true}).click();
 await expect(page.getByRole('columnheader',{name:'Produto / modelo'})).toBeVisible();
 await page.getByRole('checkbox',{name:`Selecionar pedido ${source.order_number}`,exact:true}).check();
 await page.getByRole('checkbox',{name:'Selecionar pedido 10001',exact:true}).check();
 await page.getByRole('button',{name:'Mesclar para fechamento',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Mesclar pedidos',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Voltar',exact:true}).click();
 await page.getByRole('button',{name:`Pedido ${source.order_number}`,exact:true}).click();
 await expect(page.getByLabel('Quantidade do item 1')).toHaveValue('1');
});

test('seleção de clientes distintos impede abrir confirmação de mesclagem',async({page})=>{
 const {sales}=await setup(page);
 await page.getByRole('button',{name:'+ NOVA VENDA',exact:true}).click();await selectCatalogProduct(page,kitId(1));
 await expect(page.getByTestId('sale-save-state')).toHaveText('Salvo · Pendente');
 sales.sales.push({...sales.sales[0],id:uuid(99001),customer_id:uuid(99999),order_number:10001,draft_key:uuid(99002)});
 await page.getByRole('button',{name:'Pendências',exact:true}).click();
 await page.getByRole('checkbox',{name:'Selecionar pedido 10000',exact:true}).check();
 await expect(page.getByRole('checkbox',{name:'Selecionar pedido 10001',exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'Mesclar para fechamento',exact:true})).toBeDisabled();
 await page.getByRole('checkbox',{name:'Selecionar pedido 10000',exact:true}).uncheck();
 await expect(page.getByRole('checkbox',{name:'Selecionar pedido 10001',exact:true})).toBeEnabled();
 await expect(page.getByRole('dialog',{name:'Mesclar pedidos'})).toHaveCount(0);
});


test('mescla três originais, preserva 5+5+0 de frete e permite consultar números e horários',async({page})=>{
 const {sales}=await setup(page);await page.getByRole('button',{name:'+ NOVA VENDA',exact:true}).click();
 await selectCatalogProduct(page,kitId(1));await page.getByLabel('Frete cobrado (R$)',{exact:true}).fill('5,00');
 await expect(page.getByTestId('sale-save-state')).toHaveText('Salvo · Pendente');
 const first=sales.sales[0];first.created_at='2026-11-10T13:15:00Z';
 for(const [index,freight] of [[9,5],[10,0]]){
  const second={...first,id:uuid(99000+index),order_number:10000+index,draft_key:uuid(98000+index),shipping_charged:freight,total:Number(first.subtotal)+freight};sales.sales.push(second);
  sales.items.push({...sales.items[0],id:uuid(97000+index),sale_id:second.id});
 }
 await page.getByRole('button',{name:'Pendências',exact:true}).click();
 for(const number of [10000,10009,10010])await page.getByRole('checkbox',{name:'Selecionar pedido '+number,exact:true}).check();
 await page.getByRole('button',{name:'Mesclar para fechamento',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Mesclar pedidos'})).toContainText('10,00');
 await page.getByRole('button',{name:'Mesclar e abrir fechamento',exact:true}).click();
 await expect(page.getByRole('heading',{name:/FECHAMENTO DE PEDIDOS/})).toBeVisible();
 await expect(page.getByLabel('Frete cobrado (R$)',{exact:true})).toHaveValue('10,00');
 await expect(page.getByLabel('Frete cobrado (R$)',{exact:true})).toBeDisabled();
 await expect(page.getByRole('combobox',{name:'Cliente',exact:true})).toBeDisabled();
 await expect(page.getByLabel('Quantidade do item 1')).toBeDisabled();
 await page.getByRole('button',{name:'Pendências',exact:true}).click();
 await expect(page.getByText('Fechamento · 3 pedidos originais',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Ver pedidos originais',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Consultar pedido'});
 for(const number of [10000,10009,10010])await expect(dialog.getByRole('button',{name:'Pedido '+number,exact:true})).toBeVisible();
 await dialog.getByRole('button',{name:'Pedido 10000',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Consultar pedido'})).toContainText('10/11/2026, 10:15:00');
 await expect(page.getByText('Pedido original preservado',{exact:true})).toBeVisible();
});
