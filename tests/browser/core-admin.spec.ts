import { test, expect } from '@playwright/test';
import { setup, selectCatalogProduct } from './support/mockErp';
import { uuid } from '../fixtures/customerRows';
import { kitId } from '../fixtures/officialProducts';

test('cria cliente com matriz, preserva código TEXT e relê após atualizar a página', async ({ page }) => {
  const { admin, customers } = await setup(page);
  await page.getByRole('button', { name: 'Novo cliente', exact: true }).click();
  const form = page.getByRole('form', { name: 'Novo cliente e matriz' });
  await form.getByLabel('Código comercial', { exact: true }).fill('000048-A');
  await form.getByLabel('Nome do cliente', { exact: true }).fill('Cliente oficial teste isolado');
  await form.getByLabel('Endereço', { exact: true }).fill('Rua conferida');
  await form.getByRole('button', { name: 'Salvar cadastro' }).click();
  await expect(page.getByRole('heading', { name: 'Cliente oficial teste isolado', exact: true, level: 2 })).toBeVisible();
  await expect(page.getByLabel('Código comercial', { exact: true })).toHaveValue('000048-A');
  await expect(page.getByLabel('Código comercial', { exact: true })).toHaveAttribute('readonly', '');
  expect(customers.at(-1)?.customer_code).toBe('000048-A'); expect(admin.writes).toHaveLength(1);
  await page.reload();
  await page.getByRole('searchbox').fill('000048-A');
  await expect(page.getByRole('heading', { name: 'Cliente oficial teste isolado', exact: true, level: 2 })).toBeVisible();
  expect(admin.writes).toHaveLength(1);
});

test('cria e edita filial, confirma matriz e Nova Venda usa a unidade marcada', async ({ page }) => {
  const { admin, branches } = await setup(page);
  await page.getByRole('button', { name: '+ Adicionar filial', exact: true }).first().click();
  let form = page.getByRole('form', { name: 'Adicionar filial' });
  await form.getByLabel('Nome da filial', { exact: true }).fill('Unidade Norte');
  await form.getByLabel('Endereço', { exact: true }).fill('Rua Norte');
  await form.getByLabel('Cidade', { exact: true }).fill('Curitiba');
  await form.getByLabel('Estado', { exact: true }).fill('PR');
  await form.getByRole('button', { name: 'Cadastrar filial' }).click();
  const card = page.locator('div.rounded-xl').filter({ has: page.getByRole('heading', { name: 'Unidade Norte', exact: true }) }).last();
  await card.getByRole('button', { name: 'Editar unidade', exact: true }).click();
  form = page.getByRole('form', { name: 'Editar unidade' });
  await form.getByLabel('Número', { exact: true }).fill('500');
  await form.getByRole('button', { name: 'Salvar cadastro' }).click();
  await expect(form).toHaveCount(0);
  page.once('dialog', dialog => dialog.accept());
  await card.getByRole('button', { name: 'Definir matriz', exact: true }).click();
  await expect(card.getByText('Matriz', { exact: true })).toBeVisible();
  const branch = branches.find(row => row.name === 'Unidade Norte')!;
  expect(branch.customer_id).toBe(uuid(1)); expect(branch.number).toBe('500');
  expect(admin.writes.map(row => row.name)).toEqual(['pamda_admin_cadastrar_filial', 'pamda_admin_atualizar_filial', 'pamda_admin_definir_matriz']);
  await page.getByRole('button', { name: '+ NOVA VENDA', exact: true }).click();
  await expect(page.getByLabel('Unidade / Filial', { exact: true })).toHaveValue(branch.id);
});

test('resposta perdida na criação exige revisar lista e não repete a operação automaticamente', async ({ page }) => {
  const { admin, customers } = await setup(page); admin.failure = 'lost';
  await page.getByRole('button', { name: 'Novo cliente', exact: true }).click();
  const form = page.getByRole('form', { name: 'Novo cliente e matriz' });
  await form.getByLabel('Código comercial', { exact: true }).fill('00099999');
  await form.getByLabel('Nome do cliente', { exact: true }).fill('Resposta perdida');
  await form.getByRole('button', { name: 'Salvar cadastro' }).click();
  await expect(form.getByRole('alert')).toContainText('Resultado não confirmado');
  await expect(form.getByRole('button', { name: 'Salvar cadastro' })).toBeDisabled();
  expect(customers).toHaveLength(385); expect(admin.writes).toHaveLength(1);
  admin.failure = '';
  await form.getByRole('button', { name: 'Fechar e revisar a lista' }).click();
  await page.getByRole('searchbox').fill('00099999');
  await expect(page.getByRole('heading', { name: 'Resposta perdida', exact: true, level: 2 })).toBeVisible();
  expect(admin.writes).toHaveLength(1);
});

test('pagamentos oficiais persistem na pendência e a prévia mantém o layout aprovado', async ({ page }, testInfo) => {
  const { admin, state, sales } = await setup(page);
  await page.getByLabel('Forma padrão do cliente', { exact: true }).selectOption(uuid(7101));
  await page.getByLabel('Prazo padrão do cliente', { exact: true }).selectOption(uuid(7201));
  await page.getByRole('button', { name: 'Salvar pagamento do cliente', exact: true }).click();
  await expect.poll(() => admin.customerSettings[uuid(1)]?.default_method_id).toBe(uuid(7101));
  expect(admin.customerSettings[uuid(1)].credit_limit).toBeNull();
  state.customerShipping[uuid(1)] = 0;
  await page.getByRole('button', { name: '+ NOVA VENDA', exact: true }).click();
  await expect(page.getByLabel('Forma de pagamento da venda', { exact: true })).toHaveValue(uuid(7101));
  await expect(page.getByLabel('Prazo de pagamento da venda', { exact: true })).toHaveValue(uuid(7201));
  await selectCatalogProduct(page, kitId(1));
  await expect(page.getByTestId('sale-save-state')).toHaveText('Salvo · Pendente');
  await expect.poll(() => sales.sales[0]?.payment_method_id).toBe(uuid(7101));
  expect(sales.sales[0].payment_term_id).toBe(uuid(7201));
  await page.reload();
  await expect(page.getByLabel('Forma de pagamento da venda', { exact: true })).toHaveValue(uuid(7101));
  await expect(page.getByLabel('Prazo de pagamento da venda', { exact: true })).toHaveValue(uuid(7201));
  await page.getByRole('button', { name: 'Ver / imprimir recibo', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Prévia do recibo', exact: true })).toBeVisible();
  await expect(page.locator('#pamda-receipt-preview-paper .receipt-heading strong')).toHaveText('RECIBO Nº TESTE');
  await page.screenshot({ path: testInfo.outputPath('pagamento-recibo.png'), fullPage: true });
  expect(sales.sales).toHaveLength(1); expect(sales.sales[0].status).toBe('draft');
});

test('formas inativas ficam fora das opções e vínculo salvo indisponível não é trocado por à vista', async ({ page }) => {
  const { admin, state, sales } = await setup(page);
  admin.customerSettings[uuid(1)] = { customer_id: uuid(1), default_method_id: uuid(7102), default_term_id: null, credit_limit: null, notes: null };
  state.customerShipping[uuid(1)] = 0;
  await page.getByRole('button', { name: '+ NOVA VENDA', exact: true }).click();
  const select = page.getByLabel('Forma de pagamento da venda', { exact: true });
  await expect(select).toHaveValue(uuid(7102));
  await expect(select.locator('option', { hasText: 'Condição salva indisponível' })).toHaveAttribute('disabled', '');
  await expect(select.locator('option', { hasText: 'Forma inativa' })).toHaveCount(0);
  await expect(page.getByLabel('Prazo de pagamento da venda', { exact: true })).toHaveValue('');
  await expect.poll(() => sales.sales[0]?.payment_method_id).toBe(uuid(7102));
  await page.reload(); await expect(select).toHaveValue(uuid(7102));
});

test('admin gerencia catálogo por RPC, sem escrever tabelas diretamente', async ({ page }) => {
  const { admin } = await setup(page);
  await page.getByRole('button', { name: 'Gerenciar catálogo de pagamentos' }).click();
  const form = page.getByRole('form', { name: 'Catálogo de pagamentos' });
  await form.getByLabel('Código do pagamento').fill('metodo_aprovado');
  await form.getByLabel('Nome do pagamento').fill('Método homologado');
  await form.getByRole('button', { name: 'Salvar pagamento', exact: true }).click();
  await expect(page.getByLabel('Forma padrão do cliente', { exact: true }).locator('option', { hasText: 'Método homologado' })).toHaveCount(1);
  expect(admin.writes.at(-1)?.name).toBe('pamda_admin_salvar_forma_pagamento');
  expect(admin.writes.at(-1)?.args).toEqual({ p_code: 'metodo_aprovado', p_name: 'Método homologado', p_active: true });
  await page.getByRole('button', { name: 'Gerenciar catálogo de pagamentos' }).click();
  await form.getByLabel('Tipo de catálogo').selectOption('terms');
  await form.getByLabel('Código do pagamento').fill('prazo_aprovado');
  await form.getByLabel('Nome do pagamento').fill('Prazo homologado');
  await form.getByLabel('Dias de prazo').fill('15');
  await form.getByLabel('Parcelas', { exact: true }).fill('1');
  await form.getByRole('button', { name: 'Salvar pagamento', exact: true }).click();
  await expect(page.getByLabel('Prazo padrão do cliente', { exact: true }).locator('option', { hasText: 'Prazo homologado' })).toHaveCount(1);
  expect(admin.writes.at(-1)?.args).toEqual({ p_code: 'prazo_aprovado', p_name: 'Prazo homologado', p_due_days: 15, p_installments: 1, p_notes: null, p_active: true });
});

test('pagamento da filial prevalece no contexto e limite explícito zero permanece diferente de NULL', async ({ page }) => {
  const { admin, state } = await setup(page);
  state.financialPermission = true;
  admin.methods.push({ id: uuid(7103), code: 'boleto', name: 'Boleto conferido', active: true, created_at: '2026-10-19T00:00:00Z' });
  await page.reload();
  await page.getByLabel('Forma padrão do cliente', { exact: true }).selectOption(uuid(7101));
  await page.getByLabel('Limite de crédito (R$)', { exact: true }).fill('0,00');
  await page.getByRole('button', { name: 'Salvar pagamento do cliente', exact: true }).click();
  await expect.poll(() => admin.customerSettings[uuid(1)]?.credit_limit).toBe(0);
  await page.getByLabel('Forma específica da unidade', { exact: true }).selectOption(uuid(7103));
  await page.getByRole('button', { name: 'Salvar pagamento da unidade', exact: true }).click();
  await expect.poll(() => admin.branchSettings[uuid(1001)]?.default_method_id).toBe(uuid(7103));
  await expect(page.getByText('Boleto conferido', { exact: true }).filter({ visible: true })).toBeVisible();
  await page.getByRole('button', { name: '+ NOVA VENDA', exact: true }).click();
  await expect(page.getByLabel('Forma de pagamento da venda', { exact: true })).toHaveValue(uuid(7103));
});
