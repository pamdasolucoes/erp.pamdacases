import {test,expect} from '@playwright/test';
import {setup,selectCatalogProduct} from './support/mockErp';
import {kitId} from '../fixtures/officialProducts';

test('administrador vê custo unitário e total durante a venda',async({page})=>{
 await setup(page);
 await page.getByRole('button',{name:'+ NOVA VENDA',exact:true}).click();
 await selectCatalogProduct(page,kitId(1));
 await expect(page.getByRole('columnheader',{name:'Custo unitário',exact:true})).toBeVisible();
 await expect(page.getByTestId('sale-unit-cost-1')).toContainText('R$');
 await expect(page.getByRole('columnheader',{name:'Custo total',exact:true})).toBeVisible();
});

test('operadora só vê os custos quando o administrador libera a permissão',async({page})=>{
 const {sales}=await setup(page,'venda_atendimento');
 await page.getByRole('navigation').getByRole('button',{name:'Nova Venda',exact:true}).click();
 const customer=page.getByRole('combobox',{name:'Cliente',exact:true});await customer.fill('350');await customer.press('Enter');
 await selectCatalogProduct(page,kitId(1));
 await expect(page.getByRole('columnheader',{name:'Custo unitário',exact:true})).toHaveCount(0);
 sales.permissions['stock.cost']=true;
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(page.getByRole('columnheader',{name:'Custo unitário',exact:true})).toBeVisible();
 sales.permissions['stock.cost']=false;
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(page.getByRole('columnheader',{name:'Custo unitário',exact:true})).toHaveCount(0);
});
