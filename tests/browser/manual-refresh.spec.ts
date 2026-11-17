import {test,expect,type Page} from '@playwright/test';
import {setup,selectCatalogProduct} from './support/mockErp';
import {kitId} from '../fixtures/officialProducts';
import {uuid} from '../fixtures/customerRows';

async function returnToTab(page:Page){
  await page.evaluate(async()=>{
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('online'));
    document.dispatchEvent(new Event('visibilitychange'));
    const path='/src/services/auth.ts';const {authService}=await import(path);await authService.refresh();
    // Covers App's debounced access validation, without requesting business data.
    await new Promise(resolve=>setTimeout(resolve,250));
  });
}

test('pendências só recarregam ao abrir pelo menu, atualizar vendas ou recarregar a página',async({page})=>{
  let pendingReads=0;
  page.on('request',request=>{if(new URL(request.url()).pathname==='/rest/v1/erp_pending_sales')pendingReads++;});
  const {sales,state}=await setup(page);
  await page.getByRole('button',{name:'+ NOVA VENDA',exact:true}).click();await selectCatalogProduct(page,kitId(1));
  await expect(page.getByTestId('sale-save-state')).toHaveText('Salvo · Pendente');
  const menu=page.getByRole('navigation').getByRole('button',{name:'Pendências',exact:true});
  await menu.click();await expect(page.getByRole('button',{name:'Pedido 10000',exact:true})).toBeVisible();
  const first=pendingReads;
  const add=(index:number)=>sales.sales.push({...sales.sales[0],id:uuid(99000+index),draft_key:uuid(98000+index),order_number:10000+index});
  add(1);await returnToTab(page);
  expect(pendingReads).toBe(first);await expect(page.getByRole('button',{name:'Pedido 10001',exact:true})).toHaveCount(0);
  await menu.click();await expect(page.getByRole('button',{name:'Pedido 10001',exact:true})).toBeVisible();expect(pendingReads).toBe(first+1);
  add(2);await page.getByRole('button',{name:'Atualizar vendas',exact:true}).click();
  await expect(page.getByRole('button',{name:'Pedido 10002',exact:true})).toBeVisible();expect(pendingReads).toBe(first+2);
  add(3);await page.reload();await expect(page.getByRole('button',{name:'Pedido 10003',exact:true})).toBeVisible();
  expect(pendingReads).toBe(first+3);expect(state.pageErrors).toEqual([]);
});

test('venda aberta mantém os dados e os controles ao voltar à aba ou renovar a sessão',async({page})=>{
  const {state,sales}=await setup(page);
  await page.getByRole('button',{name:'+ NOVA VENDA',exact:true}).click();await selectCatalogProduct(page,kitId(1));
  await page.getByLabel('OBSERVAÇÕES',{exact:true}).fill('Manter minha edição');
  await expect(page.getByTestId('sale-save-state')).toHaveText('Salvo · Pendente');
  const before={customers:state.reads,products:state.productReads,writes:sales.writes.length};
  let details=0;page.on('request',request=>{if(new URL(request.url()).pathname==='/rest/v1/erp_sales')details++;});
  await returnToTab(page);
  expect({customers:state.reads,products:state.productReads,writes:sales.writes.length}).toEqual(before);
  expect(details).toBe(0);
  await expect(page.getByLabel('OBSERVAÇÕES',{exact:true})).toHaveValue('Manter minha edição');
  await expect(page.getByLabel('Frete cobrado (R$)',{exact:true})).toBeEnabled();
  await expect(page.getByTestId('sale-save-state')).toHaveText('Salvo · Pendente');
  expect(state.pageErrors).toEqual([]);
});
