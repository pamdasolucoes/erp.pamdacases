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
 await page.getByRole('checkbox',{name:'Selecionar pedido 10000',exact:true}).check();await page.getByRole('checkbox',{name:'Selecionar pedido 10001',exact:true}).check();
 await page.getByRole('button',{name:'Mesclar para fechamento',exact:true}).click();
 await expect(page.getByRole('alert')).toHaveText('Selecione somente pendências do mesmo cliente.');
 await expect(page.getByRole('dialog',{name:'Mesclar pedidos'})).toHaveCount(0);
});
