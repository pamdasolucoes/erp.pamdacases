import { expect, test } from '@playwright/test';
import { setup } from './support/mockErp';
import { officialProduct, productId } from '../fixtures/officialProducts';
import { uuid } from '../fixtures/customerRows';

for (const allowed of [true,false]) test('gerencial: Novo Produto com products.manage=' + allowed, async ({page}) => {
 const ctx=await setup(page,'gerencial',{stayOnDashboard:true,permissions:{'products.manage':allowed,'sales.read':true,'module.produtos':true}});
 const calls: any[]=[];
 await page.route('**/rest/v1/rpc/pamda_cadastrar_item_basico', async route => {
  const args=route.request().postDataJSON(); calls.push(args);
  ctx.products.push(officialProduct(uuid(899001),{code:'1800',sku:args.p_sku,name:args.p_nome}));
  await route.fulfill({contentType:'application/json',body:JSON.stringify([{produto_id:uuid(899001),codigo:'1800',sku:args.p_sku}])});
 });
 await page.getByRole('button',{name:'Produtos & Serviços',exact:true}).click();
 await page.getByRole('button',{name:'Produtos Físicos',exact:true}).click();
 const create=page.getByRole('button',{name:'Novo Produto',exact:true});
 await expect(page.getByRole('button',{name:'Nova Capa + Kit',exact:true})).toBeDisabled();
 await expect(page.getByTestId('product-'+productId(1)).getByRole('button',{name:/^Editar /})).toBeDisabled();
 if(!allowed){await expect(create).toBeDisabled();expect(calls).toHaveLength(0);return;}
 await create.click(); await page.getByLabel('Nome',{exact:true}).fill('Produto Nilu isolado');
 await page.getByLabel('SKU novo',{exact:true}).fill('NILU-UI-TEST');
 await page.getByRole('button',{name:'Confirmar e salvar',exact:true}).click();
 await expect(page.getByText(/Produto salvo no PAMDA CORE/)).toBeVisible();
 await page.getByRole('textbox',{name:'Buscar produtos por nome, SKU ou código'}).fill('NILU-UI-TEST');
 await expect(page.getByRole('table')).toContainText('Produto Nilu isolado');
 expect(calls).toHaveLength(1); expect(calls[0].p_code).toBeUndefined(); expect(ctx.state.pageErrors).toEqual([]);
});
