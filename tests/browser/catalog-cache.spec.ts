import { test, expect } from '@playwright/test';
import { setup } from './support/mockErp';
import { uuid } from '../fixtures/customerRows';

test('catálogos não repetem consultas na navegação e atualização manual consulta o servidor', async ({ page }) => {
  const { state, customers } = await setup(page, 'admin_gerencial', { strictMode: true });
  expect(state.reads).toBe(22);
  await page.getByRole('complementary').getByRole('button', { name: 'Produtos & Serviços', exact: true }).click();
  await expect(page.getByText(/637 itens oficiais/)).toBeVisible(); expect(state.productReads).toBe(36);
  const counts = { customers: state.reads, products: state.productReads };
  await page.getByRole('complementary').getByRole('button', { name: 'Nova Venda', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Adicionar produto do catálogo oficial', exact: true })).toBeEnabled();
  await page.getByRole('complementary').getByRole('button', { name: 'Clientes e Unidades', exact: true }).click();
  await expect(page.getByText('384 clientes acessíveis')).toBeVisible();
  expect(state.reads).toBe(counts.customers); expect(state.productReads).toBe(counts.products);
  customers[0].name = 'Cadastro confirmado no servidor';
  await page.getByRole('button', { name: 'Atualizar lista', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Cadastro confirmado no servidor', exact: true })).toBeVisible();
  expect(state.reads).toBe(counts.customers + 22); expect(state.pageErrors).toEqual([]);
});

test('retorno à aplicação revalida RLS e descarta catálogo após negação', async ({ page }) => {
  const { state } = await setup(page);
  state.listError = '42501'; await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('alert')).toContainText('política RLS');
  await expect(page.getByRole('region', { name: 'Lista de clientes' })).toHaveCount(0);
  const cached = await page.evaluate(async () => { const path = '/src/services/catalogResources.ts'; const resources = await import(path); return resources.customerCatalog.getSnapshot().data; });
  expect(cached).toBeNull();
});

test('logout limpa memória e outro usuário recebe apenas seu catálogo', async ({ page }) => {
  const { employee, customers, branches, state } = await setup(page);
  await page.getByRole('button', { name: 'Sair do ERP', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Bem-vindo ao PAMDA ERP' })).toBeVisible();
  const empty = await page.evaluate(async () => { const path = '/src/services/catalogResources.ts'; const resources = await import(path); return [resources.customerCatalog.getSnapshot().data, resources.productCatalog.getSnapshot().data]; });
  expect(empty).toEqual([null, null]);
  employee.id = uuid(9001); customers.splice(2); branches.splice(2); customers[0].name = 'Acesso do segundo usuário';
  const previousReads = state.reads;
  await page.getByLabel('E-mail', { exact: true }).fill('outro@example.invalid');
  await page.locator('#login-password').fill('synthetic-password');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByRole('main').getByRole('button', { name: 'Clientes e Unidades', exact: true }).click();
  await expect(page.getByText('2 clientes acessíveis', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Acesso do segundo usuário', exact: true })).toBeVisible();
  expect(state.reads).toBe(previousReads + 2);
});

test('listagens progressivas pesquisam registros fora dos primeiros 80 e permitem expandir', async ({ page }) => {
  await setup(page);
  const list = page.getByRole('region', { name: 'Lista de clientes' });
  await expect(list.locator('[data-testid^="customer-row-"]')).toHaveCount(80);
  await list.getByRole('button', { name: /Mostrar mais clientes/ }).click();
  await expect(list.locator('[data-testid^="customer-row-"]')).toHaveCount(160);
  await page.getByRole('searchbox').fill('000384');
  await expect(page.getByRole('heading', { name: 'Cliente 384', exact: true })).toBeVisible();
  await page.getByRole('complementary').getByRole('button', { name: 'Produtos & Serviços', exact: true }).click();
  await expect(page.locator('[data-testid^="product-"]')).toHaveCount(80);
  await page.getByRole('button', { name: /Mostrar mais produtos/ }).click();
  await expect(page.locator('[data-testid^="product-"]')).toHaveCount(160);
  await page.getByLabel('Buscar produtos por nome, SKU ou código').fill('40201');
  await expect(page.locator('[data-testid^="product-"]')).toHaveCount(1);
});

test('filial mostra vínculo, valida campos, preserva matriz e não unifica clientes Cristal', async ({ page }, testInfo) => {
  const { state, customers, branches, admin } = await setup(page);
  Object.assign(customers[0], { name: 'CRISTAL CELL', customer_code: '481' });
  Object.assign(customers[1], { name: 'CRISTAL CELL - MARECHAL', customer_code: '1586' });
  branches[0].is_primary = true;
  await page.getByRole('button', { name: 'Atualizar lista', exact: true }).click();
  await page.getByRole('searchbox').fill('481');
  await page.getByRole('group', { name: 'Ações do cliente' }).getByRole('button', { name: '+ Adicionar filial', exact: true }).click();
  const form = page.getByRole('form', { name: 'Adicionar filial', exact: true });
  await expect(form.getByLabel('Cliente vinculado', { exact: true })).toHaveValue('CRISTAL CELL');
  await expect(form.getByLabel('Código comercial do cliente', { exact: true })).toHaveValue('481');
  await expect(form.getByLabel('Código comercial do cliente', { exact: true })).toHaveAttribute('readonly', '');
  for (const label of ['Nome da filial', 'Endereço', 'Cidade', 'Estado']) await expect(form.getByLabel(label, { exact: true })).toHaveAttribute('required', '');
  await form.getByRole('button', { name: 'Cadastrar filial' }).click(); expect(admin.writes).toHaveLength(0);
  const reads = state.reads;
  await form.getByRole('button', { name: 'Cancelar', exact: true }).click(); expect(state.reads).toBe(reads); expect(admin.writes).toHaveLength(0);
  await page.getByRole('region', { name: 'Unidades cadastradas', exact: true }).getByRole('button', { name: '+ Adicionar filial', exact: true }).click();
  await form.getByLabel('Nome da filial', { exact: true }).fill('Unidade conferida');
  await form.getByLabel('Endereço', { exact: true }).fill('Rua da conferência');
  await form.getByLabel('Cidade', { exact: true }).fill('Curitiba'); await form.getByLabel('Estado', { exact: true }).fill('PR');
  await page.screenshot({ path: testInfo.outputPath('adicionar-filial.png'), fullPage: true });
  await form.getByRole('button', { name: 'Cadastrar filial' }).click();
  await expect(page.getByText('Filial cadastrada com sucesso', { exact: true })).toBeVisible();
  expect(state.reads - reads).toBe(2); expect(customers).toHaveLength(384);
  expect(branches.find(row => row.id === uuid(1001))?.is_primary).toBe(true);
  expect(branches.find(row => row.name === 'Unidade conferida')?.customer_id).toBe(customers[0].id);
  expect(branches.filter(row => row.customer_id === customers[1].id)).toHaveLength(1);
  expect(admin.writes.at(-1)?.name).toBe('pamda_admin_cadastrar_filial');
});

test('filial indica salvamento, preserva dados após erro específico e permite cancelar sem gravar', async ({ page }) => {
  const { admin, branches } = await setup(page);
  let finish!: () => void;
  const response = new Promise<void>(resolve => { finish = resolve; });
  await page.route('**/rest/v1/rpc/pamda_admin_cadastrar_filial', async route => {
    await response; await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'P0001', message: 'Endereço da filial precisa ser conferido.' }) });
  });
  await page.getByRole('group', { name: 'Ações do cliente' }).getByRole('button', { name: '+ Adicionar filial', exact: true }).click();
  const form = page.getByRole('form', { name: 'Adicionar filial' });
  for (const [label, value] of [['Nome da filial', 'Unidade com erro'], ['Endereço', 'Rua informada'], ['Cidade', 'Curitiba'], ['Estado', 'PR']]) await form.getByLabel(label, { exact: true }).fill(value);
  await form.getByRole('button', { name: 'Cadastrar filial' }).click();
  await expect(form.getByRole('status')).toHaveText('Salvando...');
  await expect(form.getByRole('button', { name: 'Cancelar', exact: true })).toBeDisabled();
  finish(); await expect(form.getByRole('alert')).toHaveText('Endereço da filial precisa ser conferido.');
  await expect(form.getByLabel('Nome da filial', { exact: true })).toHaveValue('Unidade com erro');
  await form.getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect(admin.writes).toHaveLength(0); expect(branches).toHaveLength(384);
});
