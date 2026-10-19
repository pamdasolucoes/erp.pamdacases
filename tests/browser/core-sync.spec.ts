import { test, expect } from '@playwright/test';
import { setup } from './support/mockErp';
import { branchRow, uuid } from '../fixtures/customerRows';

test('dashboard usa resumo oficial, distingue NULL de zero e não mostra faturamento sem permissão', async ({ page }, testInfo) => {
  const { state } = await setup(page, 'admin_gerencial', { stayOnDashboard: true });
  await expect(page.getByTestId('summary-catalog_active')).toHaveText('637');
  await expect(page.getByTestId('summary-physical_stock_verified')).toHaveText('0');
  await expect(page.getByTestId('summary-production_queue_count')).toHaveText('Não configurado');
  await expect(page.getByTestId('summary-confirmed_revenue_today')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Zerar|Carregar Exemplo/ })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('dashboard-oficial.png'), fullPage: true });
  state.coreError = '42501'; await page.getByRole('button', { name: 'Atualizar painel' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByTestId('summary-catalog_active')).toHaveText('Indisponível');
  expect(state.writes).toEqual([]);
});

for (const role of ['financeiro', 'estoque_expedicao'] as const) {
  test(`perfil ${role} entra no dashboard e não recebe ações comerciais ou administração`, async ({ page }) => {
    await setup(page, role, { stayOnDashboard: true });
    await expect(page.getByRole('heading', { name: 'Dashboard Geral', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nova Venda', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Usuários & Acessos', exact: true })).toHaveCount(0);
    await expect(page.getByTestId('summary-confirmed_revenue_today')).toHaveCount(0);
    await page.getByRole('button', { name: role === 'financeiro' ? 'Contas a Receber' : 'Estoque & Movimentos', exact: true }).click();
    await expect(page.getByTestId('unavailable-module')).toContainText('Operação oficial indisponível');
  });
}

test('receitas dependem do perfil validado e desaparecem após revogação', async ({ page }) => {
  const { state } = await setup(page, 'admin_gerencial', { stayOnDashboard: true });
  const refresh = () => page.evaluate(async () => { const path = '/src/services/supabase.ts'; const { supabase } = await import(path); await supabase.auth.refreshSession(); });
  state.financialPermission = true; await refresh();
  await expect(page.getByTestId('summary-confirmed_revenue_today')).toContainText('123,45');
  state.financialPermission = false; await refresh();
  await expect(page.getByTestId('summary-confirmed_revenue_today')).toHaveCount(0);
  expect(state.writes).toEqual([]);
});

test('módulos sem backend mantêm navegação e bloqueiam operações sem chamadas locais ou Edge Function', async ({ page }) => {
  const { state } = await setup(page, 'admin_gerencial', { stayOnDashboard: true });
  const sidebar = page.getByRole('complementary');
  for (const name of ['Fila de Produção', 'Estoque & Movimentos', 'Contas a Receber', 'Fechamentos', 'Despesas', 'Compras & Entradas', 'Auditoria & Logs', 'Usuários & Acessos']) {
    await sidebar.getByRole('button', { name, exact: true }).click();
    await expect(page.getByTestId('unavailable-module')).toContainText('Operação oficial indisponível');
    for (const button of await page.getByTestId('unavailable-module').getByRole('button').all()) await expect(button).toBeDisabled();
  }
  expect(state.writes).toEqual([]); expect(state.pageErrors).toEqual([]);
});

test('matriz marcada fora da primeira posição herda frete; zero da filial prevalece e troca limpa negociação anterior', async ({ page }) => {
  const { state, branches, sales } = await setup(page);
  branches.push(branchRow(800, { customer_id: uuid(1), name: 'Matriz oficial', is_primary: true, import_source_customer_code: null }));
  state.customerShipping[uuid(1)] = 12.5; state.branchShipping[uuid(1800)] = 0;
  await page.getByRole('button', { name: '+ NOVA VENDA', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Unidade / Filial', exact: true })).toHaveValue(uuid(1800));
  await expect(page.getByLabel('Frete cobrado (R$)', { exact: true })).toHaveValue('0,00');
  await page.getByLabel('Frete cobrado (R$)', { exact: true }).fill('7,25');
  await page.getByRole('combobox', { name: 'Unidade / Filial', exact: true }).selectOption(uuid(1001));
  await expect(page.getByLabel('Frete cobrado (R$)', { exact: true })).toHaveValue('12,50');
  await expect(page.getByTestId('sale-save-state')).toHaveText('Salvo · Pendente');
  expect(sales.sales).toHaveLength(1); expect(sales.sales[0].shipping_charged).toBe(12.5);
});

test('frete padrão e da unidade são gravados por RPC e relidos; vazio e zero permanecem diferentes', async ({ page }) => {
  const { state } = await setup(page);
  await page.getByLabel('Frete padrão do cliente (R$)', { exact: true }).fill('12,50');
  await page.getByLabel('Motivo da alteração de frete').fill('Tabela revisada');
  await page.getByRole('button', { name: 'Salvar frete do cliente', exact: true }).click();
  await expect.poll(() => state.customerShipping[uuid(1)]).toBe(12.5);
  await expect(page.getByRole('status').filter({ hasText: 'Frete confirmado' })).toBeVisible();
  await page.getByLabel('Frete da unidade (R$)', { exact: true }).fill('0,00');
  await page.getByLabel('Motivo da alteração de frete').fill('Retirada na loja');
  await page.getByRole('button', { name: 'Salvar frete da unidade', exact: true }).click();
  await expect.poll(() => state.branchShipping[uuid(1001)]).toBe(0);
  await expect(page.getByLabel('Frete da unidade (R$)', { exact: true })).toHaveValue('0,00');
  await page.getByLabel('Frete da unidade (R$)', { exact: true }).fill('');
  await page.getByLabel('Motivo da alteração de frete').fill('Voltar à tabela do cliente');
  await page.getByRole('button', { name: 'Salvar frete da unidade', exact: true }).click();
  await expect.poll(() => state.branchShipping[uuid(1001)]).toBeNull();
});

test('administrador revisa pendência legada sem número e só confirma descarte após resposta protegida', async ({ page }) => {
  const { sales, employee } = await setup(page);
  await sales.handle('/rest/v1/rpc/pamda_iniciar_venda', new URL('https://synthetic.invalid/'), { p_cliente_id: uuid(1), p_filial_id: uuid(1001), p_draft_key: uuid(8888) });
  const sale = sales.sales[0]; sale.order_number = null; sale.customer_snapshot = { code: '000001', name: 'Legado oficial' };
  await page.getByRole('button', { name: 'Todas as Vendas', exact: true }).click();
  await expect(page.getByText('Sem número · revisar', { exact: true })).toBeVisible();
  await expect(page.getByText('Código: 000001', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Editar pendência', exact: true }).click();
  await expect(page.getByTestId('sale-save-state')).toHaveText('Salvo · Pendente');
  await page.getByRole('button', { name: 'Todas as Vendas', exact: true }).click();
  await expect(page.getByText('Sem número · revisar', { exact: true })).toBeVisible();
  expect(sales.sales).toHaveLength(1);
  await page.getByRole('button', { name: 'Revisar descarte', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Revisar descarte de pendência' })).toBeVisible();
  expect(sale.created_by).toBe(employee.id); expect(sales.sales).toHaveLength(1);
  await page.getByRole('button', { name: 'Confirmar descarte protegido', exact: true }).click();
  await expect(page.getByText(/Descarte confirmado pelo PAMDA CORE/)).toBeVisible();
  expect(sales.sales).toHaveLength(0);
});
