import { expect, test, type Page } from '@playwright/test';
import { setup, selectCatalogProduct } from './support/mockErp';
import { kitId, productId } from '../fixtures/officialProducts';

async function openPricing(page: Page, role: 'admin_gerencial' | 'venda_atendimento' = 'admin_gerencial') {
  // Um catalogo local propositalmente diferente deve ser ignorado.
  await page.addInitScript(()=>localStorage.setItem('pamda_products',JSON.stringify([{id:'fake',code:'FAKE',name:'Produto fictício que não pode aparecer',salePrice:999}])));
  const backend=await setup(page,role);
  await page.getByRole('button',{name:'Nova Venda',exact:true}).last().click();
  await selectCatalogProduct(page,kitId(1));
  if(role==='admin_gerencial')await page.getByLabel('Frete cobrado (R$)',{exact:true}).fill('0,00');
  return backend;
}
test('precos e frete continuam utilizaveis no celular',async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});
  await setup(page);
  await page.getByRole('button',{name:'+ NOVA VENDA',exact:true}).click();
  await selectCatalogProduct(page,kitId(1));
  const price=page.getByLabel('Valor unitário do item 1'); await price.fill('19,99'); await price.blur();
  await page.getByLabel('Frete cobrado (R$)',{exact:true}).fill('10,00');
  await expect(page.getByTestId('pricing-total')).toHaveText(/29,99/);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByLabel('Frete cobrado (R$)',{exact:true}).scrollIntoViewIfNeeded();
  await page.screenshot({path:testInfo.outputPath('frete-mobile.png')});
});
test('negocia, restaura e calcula desconto unico sem expor dados gerenciais na tela comercial',async({page})=>{
  const {state,products}=await openPricing(page);
  const price=page.getByLabel('Valor unitário do item 1');
  await expect(price).toHaveValue('25,00');
  await price.fill('20,00'); await page.getByLabel('Quantidade do item 1').fill('2');
  await page.getByLabel('DESCONTO GERENCIAL (R$)',{exact:true}).fill('5,00');
  await expect(page.getByText('Preço negociado',{exact:true})).toBeVisible();
  await expect(page.getByTestId('negotiated-subtotal')).toHaveText(/40,00/);
  await expect(page.getByTestId('pricing-total')).toHaveText(/35,00/);
  for (const testId of ['direct-cost','gross-profit','gross-margin','managerial-result','managerial-margin']) {
    await expect(page.getByTestId(testId)).toHaveCount(0);
  }
  expect(products.find(product=>product.id===kitId(1))!.sale_price).toBe(25);
  await page.getByRole('button',{name:'Restaurar preço do item 1'}).click();
  await expect(price).toHaveValue('25,00'); await expect(page.getByTestId('pricing-total')).toHaveText(/45,00/);
  await expect(page.getByText('Preço negociado',{exact:true})).toHaveCount(0);
  expect(state.writes).toEqual([]); expect(state.pageErrors).toEqual([]);
});
test('rejeita precos e fretes invalidos e permite zero explicito',async({page})=>{
  await openPricing(page);
  const price=page.getByLabel('Valor unitário do item 1');
  for(const value of ['-1','abc','1,001','']) { await price.fill(value); await expect(price).toHaveAttribute('aria-invalid','true'); await expect(page.getByTestId('pricing-total')).toHaveText('Valor inválido'); }
  await price.fill('0'); await price.blur(); await expect(price).toHaveValue('0,00');
  await expect(page.getByTestId('gross-margin')).toHaveCount(0);
  const freight=page.getByLabel('Frete cobrado (R$)',{exact:true});
  for(const value of ['-1','abc','1,001','']) { await freight.fill(value); await expect(page.getByTestId('pricing-total')).toHaveText('Informe um frete válido'); }
  await freight.fill('0,00'); await expect(page.getByTestId('pricing-total')).toHaveText(/0,00/);
  await expect(page.getByRole('button',{name:'Finalizar venda · TESTE',exact:true})).toBeVisible();
});
test('catalogo oficial nao usa autorizacao de demonstracao nem permite confirmar vendas',async({page})=>{
  const {state}=await openPricing(page);
  await page.getByLabel('Valor unitário do item 1').fill('4,00');
  await expect(page.getByRole('button',{name:'Simular autorização gerencial'})).toHaveCount(0);
  await expect(page.getByText(/custo|margem|autorização simulada/i)).toHaveCount(0);
  await page.locator('form').evaluate(form=>(form as HTMLFormElement).requestSubmit());
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Finalizar venda · TESTE',exact:true})).toBeVisible();
  expect(state.writes).toEqual([]);
});
test('perfil vendedor prepara preco e frete sem obter custos restritos na interface',async({page})=>{
  const {state,sales}=await openPricing(page,'venda_atendimento');
  await expect(page.getByLabel('Frete cobrado (R$)',{exact:true})).toBeDisabled();
  sales.permissions['sales.shipping.override']=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.getByLabel('Valor unitário do item 1').fill('4,00');
  await expect(page.getByText(/requer análise gerencial antes de concluir/)).toBeVisible();
  await expect(page.getByTestId('direct-cost')).toHaveCount(0);
  await page.getByLabel('Frete cobrado (R$)',{exact:true}).fill('15,00');
  await expect(page.getByTestId('pricing-total')).toHaveText(/19,00/);
  expect(state.writes).toEqual([]);
});
test('NULL de preco e custo permanece desconhecido, sem aplicar referencia ficticia',async({page})=>{
  const {state}=await openPricing(page);
  await page.getByRole('button',{name:'Remover item 1'}).click();
  await selectCatalogProduct(page,productId(3));
  const price=page.getByLabel('Valor unitário do item 1'); await expect(price).toHaveValue('');
  await price.fill('12,00');
  await expect(page.getByTestId('pricing-total')).toHaveText(/12,00/);
  await page.getByRole('button',{name:'Restaurar preço do item 1'}).click(); await expect(price).toHaveValue('');
  await page.getByRole('button',{name:'Remover item 1'}).click();
  await selectCatalogProduct(page,productId(2));
  await expect(page.getByTestId('direct-cost')).toHaveCount(0);
  await expect(page.getByTestId('gross-profit')).toHaveCount(0);
  expect(state.writes).toEqual([]);
});
test('frete vale so para preparacao e nao altera cadastro do cliente',async({page})=>{
  const {state,customers}=await openPricing(page);
  const before=structuredClone(customers);
  const freight=page.getByLabel('Frete cobrado (R$)',{exact:true});
  for(const [value,total] of [['10,00','35,00'],['0,00','25,00'],['15,00','40,00']]) {
    await freight.fill(value); await freight.blur(); await expect(page.getByTestId('pricing-total')).toHaveText(new RegExp(total));
  }
  expect(customers).toEqual(before); expect(state.writes).toEqual([]);
});
