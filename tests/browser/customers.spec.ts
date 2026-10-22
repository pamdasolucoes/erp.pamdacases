import { expect, test } from '@playwright/test';
import { uuid } from '../fixtures/customerRows';
import { setup, selectCatalogProduct } from './support/mockErp';
import { kitId } from '../fixtures/officialProducts';

test('busca central, unidades reais, historico pendente e nova venda vazia com contexto UUID', async ({ page }) => {
  const { state }=await setup(page);
  const search=page.getByPlaceholder('Código, nome, razão social ou CPF/CNPJ');
  await search.fill('000001'); await expect(page.getByRole('heading',{ name:'Loja Árvore' })).toBeVisible();
  await search.fill('arvore'); await expect(page.getByText('1 de 384 clientes')).toBeVisible();
  await search.fill('12345678901'); await expect(page.getByText('1 de 384 clientes')).toBeVisible();
  await expect(page.getByText('Unidades cadastradas (1)')).toBeVisible();
  await page.getByRole('button',{ name:'CONSULTAR VENDAS',exact:true }).click();
  await expect(page.getByRole('heading',{name:'Todas as Vendas'})).toBeVisible();
  await expect(page.getByText('Nenhuma pendência encontrada.')).toBeVisible();
  await page.getByRole('button',{ name:'Voltar ao cliente' }).click();
  await expect(page.getByRole('heading',{ name:'Loja Árvore' })).toBeVisible();
  await page.getByRole('button',{ name:'+ NOVA VENDA',exact:true }).click();
  await expect(page.getByRole('combobox',{name:'Cliente',exact:true})).toHaveValue('000001 - Loja Árvore');
  await expect(page.getByText('Adicione um produto para começar.')).toBeVisible();
  await expect(page.getByRole('button',{name:'Finalizar venda · TESTE',exact:true})).toBeVisible();
  await page.getByRole('combobox',{name:'Unidade / Filial',exact:true}).selectOption(uuid(1001));
  await expect(page.getByText('Endereço sinalizado para revisão.',{exact:true})).toBeVisible();
  await page.getByRole('combobox',{name:'Cliente',exact:true}).fill('000384');
  await page.getByRole('combobox',{name:'Cliente',exact:true}).press('Enter');
  await expect(page.getByRole('combobox',{name:'Cliente',exact:true})).toHaveValue('000384 - Cliente 384');
  await expect(page.getByRole('combobox',{name:'Unidade / Filial',exact:true})).toHaveValue(uuid(1384));
  await selectCatalogProduct(page,kitId(1));
  await expect(page.getByLabel('Quantidade do item 1')).toHaveValue('1');
  await page.locator('form').evaluate(form=>(form as HTMLFormElement).requestSubmit());
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Finalizar venda · TESTE',exact:true})).toBeVisible();
  expect(state.writes).toEqual([]);
  expect(state.reads).toBeGreaterThan(20);
});

test('edita telefone e endereco, exige revisao explicita e confirma valores apos recarga', async ({ page }) => {
  const { state,customers,branches }=await setup(page);
  await page.getByRole('button',{ name:'Editar cadastro',exact:true }).click();
  const form=page.locator('form');
  await expect(form.getByLabel('Código comercial',{exact:true})).toHaveAttribute('readonly','');
  await expect(form.getByLabel('UUID interno',{exact:true})).toHaveAttribute('readonly','');
  await form.getByLabel('Telefone',{exact:true}).fill('(41) 99999-4321');
  await form.getByLabel('Endereço',{exact:true}).fill('Rua Testada');
  await form.getByLabel('Cidade',{exact:true}).fill('Curitiba');
  await form.getByLabel('Estado',{exact:true}).fill('PR');
  await form.getByLabel('CEP',{exact:true}).fill('80000-000');
  await form.getByLabel('Conferi este endereço',{exact:false}).check();
  await page.getByRole('button',{name:'Salvar alterações'}).click();
  await expect(page.getByText('Cadastro atualizado e confirmado pelo PAMDA CORE.')).toBeVisible();
  expect(customers[0].customer_code).toBe('000001'); expect(customers[0].notes).toBe('  legado  ');
  expect(branches[0].address_needs_review).toBe(false);
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0].body.p_customer_id).toBe(uuid(1));
  await page.reload();
  await expect(page.getByText('384 clientes acessíveis')).toBeVisible();
  await expect(page.getByText('(41) 99999-4321',{exact:true})).toBeVisible();
  await expect(page.getByText('Rua Testada',{exact:true})).toBeVisible();
  await expect(page.getByLabel('Código comercial',{exact:true})).toHaveValue('000001');
});

test('erro de rede e negacao do servidor mantem formulario sem anunciar sucesso', async ({ page }) => {
  const { state,customers }=await setup(page);
  await page.getByRole('button',{ name:'Editar cadastro',exact:true }).click();
  await page.locator('form').getByLabel('Telefone',{exact:true}).fill('9999');
  state.editError='42501';
  await page.getByRole('button',{name:'Salvar alterações'}).click();
  await expect(page.getByRole('alert')).toContainText('não tem permissão');
  expect(customers[0].phone).toBe('');
  state.editError='network';
  await page.getByRole('button',{name:'Salvar alterações'}).click();
  await expect(page.getByRole('alert')).toContainText('Não foi possível');
  await expect(page.getByRole('heading',{name:'Editar cliente e unidades'})).toBeVisible();
  await page.getByRole('button',{name:'Cancelar',exact:true}).click();
  state.listError='42501';
  await page.getByRole('button',{name:'Atualizar lista'}).click();
  await expect(page.getByRole('alert')).toContainText('bloqueou a leitura');
  await expect(page.getByText('384 clientes acessíveis')).toHaveCount(0);
  state.listError='network';
  await page.getByRole('button',{name:'Tentar novamente',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('conexão',{timeout:15000});
  state.listError='';
  await page.getByRole('button',{name:'Tentar novamente',exact:true}).click();
  await expect(page.getByText('384 clientes acessíveis')).toBeVisible();
});

test('botoes do cliente permanecem utilizaveis no celular', async ({ page }, testInfo) => {
  await page.setViewportSize({width:390,height:844});
  await setup(page);
  for (const name of ['Editar cadastro','CONSULTAR VENDAS','+ NOVA VENDA']) {
    const button=page.getByRole('button',{name,exact:true});
    await button.scrollIntoViewIfNeeded();
    const bounds=await button.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(390);
  }
  await page.screenshot({ path:testInfo.outputPath('cliente-mobile.png') });
  await page.getByRole('button',{name:'+ NOVA VENDA',exact:true}).click();
  await expect(page.getByText('Adicione um produto para começar.')).toBeVisible();
});
