import {test,expect,type Page} from '@playwright/test';
import {setup,selectCatalogProduct} from './support/mockErp';
import {kitId} from '../fixtures/officialProducts';

async function openNewSale(page:Page){
  await page.getByRole('button',{name:'+ NOVA VENDA',exact:true}).click();
  await expect(page.getByRole('heading',{name:/NOVA VENDA \| Nº 10\.000/})).toBeVisible();
}

test('finaliza em modo TESTE sem movimentar estoque/financeiro e consulta pagamento e recibo no histórico',async({page})=>{
  const {sales}=await setup(page);
  await openNewSale(page);
  const paymentSection=page.getByRole('region',{name:'Pagamento da venda'});
  await expect(paymentSection).toBeVisible();
  await expect(paymentSection.getByText('A divisão é confirmada na finalização de homologação; o rascunho oficial mantém uma única forma de pagamento.')).toBeVisible();
  await expect(paymentSection.getByLabel('Forma de pagamento da venda')).toContainText('Selecione uma opção');
  await selectCatalogProduct(page,kitId(1));
  await paymentSection.getByLabel('Forma de pagamento da venda').selectOption({index:1});
  await paymentSection.getByLabel('Valor da forma de pagamento 1').fill('10,00');
  await paymentSection.getByRole('button',{name:'+ Adicionar forma de pagamento'}).click();
  await paymentSection.getByLabel('Valor da forma de pagamento 2').fill('15,00');
  const paymentPrecedesReceipt=await paymentSection.evaluate(section=>{
    const receipt=[...document.querySelectorAll('button')].find(button=>button.textContent?.includes('Ver / imprimir recibo'));
    return !!receipt&&(section.compareDocumentPosition(receipt)&Node.DOCUMENT_POSITION_FOLLOWING)!==0;
  });
  expect(paymentPrecedesReceipt).toBe(true);
  await page.getByLabel('Frete cobrado (R$)',{exact:true}).fill('0,00');
  await expect(page.getByTestId('sale-save-state')).toHaveText('Salvo · Pendente');
  await page.getByRole('button',{name:'Finalizar venda · TESTE',exact:true}).click();
  const finalization=page.getByRole('dialog',{name:'Finalizar venda - TESTE'});
  await expect(finalization).toBeVisible();
  await expect(finalization.locator('p').filter({hasText:'Frete confirmado'})).toContainText('R$ 0,00');
  await finalization.getByLabel('Status do pagamento 1').selectOption('paid');
  await finalization.getByLabel('Status do pagamento 2').selectOption('paid');
  await expect(finalization.getByText('Soma: R$ 25,00 · Total: R$ 25,00',{exact:true})).toBeVisible();
  page.once('dialog',dialog=>dialog.accept());
  await finalization.getByRole('button',{name:'Finalizar venda - TESTE',exact:true}).click();
  await expect(page.getByText('DOCUMENTO DE TESTE - SEM VALOR FISCAL',{exact:true})).toBeVisible();
  expect(sales.sales[0].status).toBe('confirmed');
  expect(sales.sales[0].is_test).toBe(true);
  expect(sales.testPayments).toHaveLength(2);
  expect(sales.testPayments.map(payment=>Number(payment.amount)).sort((a,b)=>a-b)).toEqual([10,15]);
  expect(sales.testReceipts[0].receipt_number).toBe(sales.sales[0].order_number);
  expect(sales.inventoryWrites).toBe(0);
  expect(sales.financialWrites).toBe(0);

  await page.getByRole('button',{name:'Fechar e editar venda'}).click();
  await page.getByRole('button',{name:'Pendências',exact:true}).click();
  await page.getByRole('button',{name:'Histórico',exact:true}).click();
  await expect(page.getByText('Concluída - TESTE',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Consultar detalhes',exact:true}).click();
  const details=page.getByRole('dialog',{name:'Detalhes da venda'});
  await expect(details.getByText('Pagamentos de TESTE')).toBeVisible();
  await expect(details.getByText('Pago em teste')).toHaveCount(2);
  await details.getByRole('button',{name:'Consultar recibo de TESTE'}).click();
  await expect(page.getByRole('dialog',{name:'Prévia do recibo'})).toBeVisible();
  await expect(page.getByText('DOCUMENTO DE TESTE - SEM VALOR FISCAL',{exact:true})).toBeVisible();
});
