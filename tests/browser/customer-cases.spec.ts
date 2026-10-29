import {test,expect} from '@playwright/test';
import {setup,selectCatalogProduct} from './support/mockErp';
import {serviceId} from '../fixtures/officialProducts';

test('capas do cliente preservam vários modelos e cores na pendência e no recibo',async({page})=>{
 const {products}=await setup(page);
 products.find(p=>p.id===serviceId(1))!.name='Impressão DTF UV em Capa Fornecida pelo Cliente';
 await page.getByRole('button',{name:'+ NOVA VENDA',exact:true}).click();
 await selectCatalogProduct(page,serviceId(1));
 await page.getByText('Personalização (opcional)',{exact:true}).click();
 await expect(page.getByLabel('Faces da carteira do item 1')).toHaveCount(0);
 await expect(page.getByLabel('Motivo da alteração do item 1')).toHaveCount(0);
 await page.getByLabel('Quantidade do item 1',{exact:true}).fill('2');
 await page.getByLabel('Modelo informado do item 1',{exact:true}).fill('Samsung A26');
 await page.getByLabel('Cor informada do item 1',{exact:true}).fill('Preta');
 await page.getByRole('button',{name:'Adicionar modelo e cor',exact:true}).click();
 await page.getByLabel('Modelo informado do item 1 capa 2').fill('Moto G56');
 await page.getByLabel('Cor informada do item 1 capa 2').fill('Azul');
 await expect(page.getByTestId('sale-save-state')).toHaveText('Salvo · Pendente');
 await page.reload();
 await page.getByText('Personalização (opcional)',{exact:true}).click();
 await expect(page.getByLabel('Modelo informado do item 1 capa 2')).toHaveValue('Moto G56');
 await page.getByRole('button',{name:'Ver / imprimir recibo',exact:true}).click();
 await expect(page.getByText('Moto G56 · Azul',{exact:true}).first()).toBeVisible();
});
