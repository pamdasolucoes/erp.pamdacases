import { expect, test, type Page } from '@playwright/test';
import { setup } from './support/mockErp';
import { kitId, officialProduct, productId } from '../fixtures/officialProducts';
import { uuid } from '../fixtures/customerRows';

const open = async (page: Page) => { await page.getByRole('button', { name: 'Produtos & Serviços', exact: true }).click(); await expect(page.getByText(/637 itens oficiais/)).toBeVisible(); };
async function adminBackend(page: Page) {
  const context = await setup(page);
  const calls: { name: string; args: any }[] = [], uploads: string[] = [];
  let model: any = null, conflict = false;
  await page.route('**/rest/v1/rpc/pamda_*', async route => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)!;
    if (!['pamda_admin_criar_capa_com_kit','pamda_cadastrar_item_basico','pamda_cadastrar_kit','pamda_admin_editar_produto','pamda_admin_produto_acao','pamda_admin_salvar_modelo_panda_ia'].includes(name)) return route.fallback();
    const args = route.request().postDataJSON(); calls.push({ name, args });
    const respond = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (name === 'pamda_admin_criar_capa_com_kit') {
      const capa = officialProduct(uuid(800001), { code: '1500', sku: args.p_sku_capa, name: `Capa TPU transparente - ${args.p_modelo}`, model_phone: args.p_modelo, brand: args.p_marca, sale_price: args.p_preco_capa, current_cost: args.p_custo_capa });
      const kit = officialProduct(uuid(800002), { code: '21500', sku: `KIT-${args.p_sku_capa}`, name: `Kit - ${args.p_modelo}`, model_phone: args.p_modelo, type: 'kit', sale_price: args.p_preco_kit });
      context.products.push(capa, kit);
      context.components.push(...[capa, context.products.find(p => p.type === 'servico')!].map((p, i) => ({ id: uuid(800010 + i), kit_product_id: kit.id, component_product_id: p.id, quantity: 1, sort_order: i, created_at: kit.created_at })));
      return respond({ case_id: capa.id, kit_id: kit.id, case_code: capa.code, kit_code: kit.code });
    }
    if (name === 'pamda_admin_editar_produto') {
      if (conflict) return respond({ code: 'P0001', message: 'Produto foi alterado em outra sessão. Atualize a página' }, 400);
      Object.assign(context.products.find(p => p.id === args.p_produto_id)!, args.p_changes, { updated_at: new Date().toISOString() }); return respond({ id: args.p_produto_id });
    }
    if (name === 'pamda_admin_produto_acao') {
      if (conflict) return respond({ code: 'P0001', message: 'Produto foi alterado em outra sessão. Atualize a página' }, 400);
      const product = context.products.find(p => p.id === args.p_produto_id)!;
      if (args.p_acao === 'alterar_sku') {
        product.sku = args.p_dados.sku;
        product.updated_at = new Date().toISOString();
        if (args.p_dados.linked_product_id) {
          const kit = context.products.find(p => p.id === args.p_dados.linked_product_id)!;
          kit.sku = `KIT-${args.p_dados.sku}`;
          kit.updated_at = product.updated_at;
        }
      } else if (args.p_acao === 'arquivar') {
        product.active = false;
        product.updated_at = new Date().toISOString();
      }
      return respond({ action: args.p_acao, id: product.id, active: product.active, sku: product.sku });
    }
    if (name === 'pamda_admin_salvar_modelo_panda_ia') {
      model = { kit_product_id: args.p_kit_id, model_label: args.p_nome, brand: args.p_marca, body_url: args.p_imagem_url, mask_url: args.p_mascara_url, technical_verified: args.p_conferido, published: args.p_publicar };
      context.products.find(p => p.id === args.p_kit_id)!.b2b_site_visible = args.p_publicar; return respond({ model });
    }
    return respond({ produto_id: uuid(800020) });
  });
  await page.route('**/rest/v1/erp_panda_ia_phone_models?**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(model) }));
  const files = new Map<string, Buffer>();
  await page.route('**/storage/v1/object/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'POST') { uploads.push(path); return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ Key: path, Id: uuid(800030) }) }); }
    const buffer = [...files.entries()].find(([key]) => path.includes(key))?.[1] ?? files.get('body');
    return route.fulfill({ contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: buffer! });
  });
  return { ...context, calls, uploads, files, setConflict: (value: boolean) => { conflict = value; } };
}

test('administrador cria capa+kit, atualiza catálogo e recebe código do servidor; SKU duplicado não grava', async ({ page }) => {
  const ctx = await adminBackend(page); const before = structuredClone(ctx.products);
  await open(page); await page.getByRole('button', { name: 'Nova Capa + Kit', exact: true }).click();
  await page.getByLabel('Marca', { exact: true }).fill('Samsung'); await page.getByLabel('Modelo', { exact: true }).fill('Samsung A18');
  await page.getByLabel('SKU novo', { exact: true }).fill(before[0].sku);
  await page.getByLabel('Preço da capa (R$)', { exact: true }).fill('12,50'); await page.getByLabel('Preço do kit (R$)', { exact: true }).fill('30');
  await page.getByRole('button', { name: 'Confirmar e salvar' }).click(); await expect(page.getByRole('alert')).toContainText('SKU'); expect(ctx.calls).toHaveLength(0);
  await page.getByLabel('SKU novo', { exact: true }).fill('CAP-UI-ISOLADO'); await page.getByRole('button', { name: 'Confirmar e salvar' }).click();
  await expect(page.getByText(/639 itens oficiais/)).toBeVisible();
  expect(ctx.calls[0].name).toBe('pamda_admin_criar_capa_com_kit'); expect(ctx.calls[0].args.p_custo_capa).toBeNull(); expect(ctx.calls[0].args.p_code).toBeUndefined();
  await page.getByRole('textbox', { name: 'Buscar produtos por nome, SKU ou código' }).fill('21500');
  await expect(page.getByRole('table')).toContainText('2 componentes'); await expect(page.getByRole('table')).toContainText('KIT-CAP-UI-ISOLADO');
  expect(ctx.products.slice(0, 637)).toEqual(before); expect(ctx.state.pageErrors).toEqual([]);
});

test('edição usa versão e motivo; clonagem exige SKU novo e confirmação', async ({ page }) => {
  const ctx = await adminBackend(page); await open(page);
  await page.getByRole('button', { name: 'Produtos Físicos', exact: true }).click();
  await page.getByTestId(`product-${productId(1)}`).getByRole('button', { name: /^Editar / }).click();
  await page.getByLabel('Nome', { exact: true }).fill('Nome revisado'); await page.getByLabel('Motivo da alteração').fill('Correção aprovada');
  ctx.setConflict(true); await page.getByRole('button', { name: 'Confirmar e salvar' }).click();
  await expect(page.getByRole('alert')).toContainText('outra sessão');
  expect(ctx.calls[0].args.p_expected_updated_at).toBe('2026-10-16T10:00:00Z'); expect(ctx.calls[0].args.p_changes).toEqual({ name: 'Nome revisado' });
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByTestId(`product-${productId(1)}`).getByRole('button', { name: /^Clonar / }).click();
  await expect(page.getByLabel('SKU novo', { exact: true })).toHaveValue(''); await expect(page.getByLabel('Nome', { exact: true })).toHaveValue('Capa TPU transparente');
  await page.getByLabel('SKU novo', { exact: true }).fill('CAP-CLONE-ISOLADO');
  await page.getByRole('button', { name: 'Confirmar e salvar' }).click(); expect(ctx.calls).toHaveLength(1);
  await page.getByLabel(/Confirmo criar um novo produto/).check(); await page.getByRole('button', { name: 'Confirmar e salvar' }).click();
  await expect(page.getByText(/Produto salvo no PAMDA CORE/)).toBeVisible();
  expect(ctx.calls[1].name).toBe('pamda_cadastrar_item_basico'); expect(ctx.calls[1].args.p_sku).toBe('CAP-CLONE-ISOLADO'); expect(ctx.calls[1].args.p_current_inventory).toBeUndefined();
});

test('Alterar SKU usa ação própria para capa/kit; excluir arquiva sem remover o registro', async ({ page }) => {
  const ctx = await adminBackend(page);
  const physical = ctx.products.find(p => p.id === productId(2))!;
  const kit = ctx.products.find(p => p.id === kitId(2))!;
  kit.sku = `KIT-${physical.sku}`;
  const component = ctx.components.find(c => c.kit_product_id === kit.id && c.component_product_id !== physical.id)!;
  ctx.products.find(p => p.id === component.component_product_id)!.sku = 'SRV-DTF-UV';
  await open(page);
  const expectedKitVersion = kit.updated_at;
  await page.getByRole('button', { name: 'Produtos Físicos', exact: true }).click();
  await page.getByTestId(`product-${physical.id}`).getByRole('button', { name: /^Arquivar produto / }).click();
  const impact = page.getByRole('region', { name: 'Impacto do arquivamento' });
  await expect(impact).toContainText('Kits dependentes (1)');
  await expect(impact).toContainText(kit.sku); await expect(impact).toContainText(kit.name);
  await expect(impact).toContainText('Ativo: bloqueia o arquivamento');
  await expect(page.getByText(/Nenhum kit dependente será arquivado ou despublicado automaticamente/)).toBeVisible();
  await page.getByLabel('Motivo da alteração', { exact: true }).fill('Produto descontinuado');
  await page.getByLabel('Digite o SKU atual para confirmar', { exact: true }).fill('ERRADO');
  await page.getByRole('button', { name: 'Arquivar produto', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Digite exatamente o SKU atual'); expect(ctx.calls).toHaveLength(0);
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByTestId(`product-${physical.id}`).getByRole('button', { name: /^Alterar SKU de / }).click();
  await page.getByLabel(`Novo SKU de ${physical.name}`, { exact: true }).fill('CAPA-NOVA-UI');
  await expect(page.getByLabel('Novo SKU do kit vinculado', { exact: true })).toHaveCount(0);
  await expect(page.getByText(/O servidor atualizará o SKU do kit vinculado/)).toContainText('KIT-CAPA-NOVA-UI');
  await page.getByLabel('Motivo da alteração', { exact: true }).fill('SKU corrigido conforme solicitação');
  await page.getByRole('button', { name: 'Alterar SKU', exact: true }).last().click();
  await expect(page.getByText(/Produto salvo no PAMDA CORE/)).toBeVisible();
  expect(ctx.calls[0].name).toBe('pamda_admin_produto_acao');
  expect(ctx.calls[0].args.p_acao).toBe('alterar_sku');
  expect(ctx.calls[0].args.p_dados).toEqual({
    sku: 'CAPA-NOVA-UI', linked_product_id: kit.id,
    expected_linked_updated_at: expectedKitVersion,
  });
  expect(physical.sku).toBe('CAPA-NOVA-UI'); expect(kit.sku).toBe('KIT-CAPA-NOVA-UI');

  await page.getByRole('button', { name: 'Todos', exact: true }).click();
  await page.getByRole('textbox', { name: 'Buscar produtos por nome, SKU ou código' }).fill('KIT-CAPA-NOVA-UI');
  await page.getByTestId(`product-${kit.id}`).getByRole('button', { name: /^Arquivar produto / }).click();
  await expect(page.getByText(/sem exclusão física/)).toBeVisible();
  await page.getByLabel('Motivo da alteração', { exact: true }).fill('Kit arquivado para teste isolado');
  await page.getByRole('button', { name: 'Arquivar produto', exact: true }).click();
  expect(ctx.calls).toHaveLength(1);
  await page.getByLabel('Digite o SKU atual para confirmar', { exact: true }).fill(kit.sku);
  await page.getByRole('button', { name: 'Arquivar produto', exact: true }).click();
  await expect.poll(() => ctx.calls.length).toBe(2);
  await expect(page.getByText(/Produto salvo no PAMDA CORE/)).toBeVisible();
  expect(ctx.calls[1].args.p_acao).toBe('arquivar'); expect(ctx.calls[1].args.p_dados).toEqual({ confirm_sku: kit.sku });
  expect(ctx.products.some(p => p.id === kit.id)).toBe(true);
  expect(ctx.products.find(p => p.id === kit.id)?.active).toBe(false);
  await expect(page.getByTestId(`product-${kit.id}`)).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Situação dos produtos', exact: true }).selectOption('arquivados');
  await expect(page.getByTestId(`product-${kit.id}`)).toContainText('Inativo');
  expect(ctx.state.pageErrors).toEqual([]);
});

test('preço de kit publicado não pode ser removido nem causa despublicação automática', async ({ page }) => {
  const ctx = await adminBackend(page);
  const kit = ctx.products.find(p => p.id === kitId(2))!; kit.b2b_site_visible = true;
  await open(page);
  await page.getByRole('textbox', { name: 'Buscar produtos por nome, SKU ou código' }).fill(kit.code);
  await page.getByTestId(`product-${kit.id}`).getByRole('button', { name: /^Editar / }).click();
  await page.getByLabel('Preço de venda (R$)', { exact: true }).fill('');
  await page.getByLabel('Motivo da alteração', { exact: true }).fill('Tentativa de remover preço');
  await page.getByRole('button', { name: 'Confirmar e salvar' }).click();
  await expect(page.getByRole('alert')).toContainText('Despublique o modelo Panda IA antes de remover o preço');
  expect(ctx.calls).toHaveLength(0); expect(kit.sale_price).toBe(25); expect(kit.b2b_site_visible).toBe(true);
});

test('Alterar SKU pelo kit abre a capa base e envia a alteração conjunta ao servidor', async ({ page }) => {
  const ctx=await adminBackend(page);
  const base=ctx.products.find(p=>p.id===productId(2))!, kit=ctx.products.find(p=>p.id===kitId(2))!;
  kit.sku=`KIT-${base.sku}`;
  const serviceLink=ctx.components.find(c=>c.kit_product_id===kit.id && c.component_product_id!==base.id)!;
  ctx.products.find(p=>p.id===serviceLink.component_product_id)!.sku='SRV-DTF-UV';
  await open(page);
  await page.getByTestId(`product-${kit.id}`).getByRole('button',{name:/^Alterar SKU de /}).click();
  await expect(page.getByText(/Kit selecionado:/)).toContainText(kit.sku);
  await page.getByLabel(`Novo SKU de ${base.name}`,{exact:true}).fill('CAPA-PELO-KIT');
  await page.getByLabel('Motivo da alteração',{exact:true}).fill('Alteração do par via kit');
  await page.getByRole('button',{name:'Alterar SKU',exact:true}).last().click();
  await expect.poll(()=>ctx.calls.length).toBe(1);
  expect(ctx.calls[0].args.p_produto_id).toBe(base.id);
  expect(ctx.calls[0].args.p_dados.linked_product_id).toBe(kit.id);
  await expect(page.getByTestId(`product-${kit.id}`)).toContainText('KIT-CAPA-PELO-KIT');
  expect(ctx.state.pageErrors).toEqual([]);
});

test('modelo técnico carrega só no detalhe, valida transparência, upload e publicação explícita', async ({ page }, testInfo) => {
  const ctx = await adminBackend(page); await open(page);
  let technicalReads = 0; page.on('request', req => { if (req.url().includes('/erp_panda_ia_phone_models')) technicalReads++; });
  expect(technicalReads).toBe(0);
  await page.getByRole('textbox', { name: 'Buscar produtos por nome, SKU ou código' }).fill('20201');
  await page.getByTestId(`product-${kitId(1)}`).getByRole('button', { name: /^Consultar / }).click();
  await expect(page.getByText('Modelo técnico | Panda IA', { exact: true })).toBeVisible();
  await expect(page.getByText('Estado: Em preparação')).toBeVisible(); expect(technicalReads).toBe(1);
  const png = async (transparent: boolean, width = 4) => Buffer.from(await page.evaluate(({ transparent, width }) => { const c = document.createElement('canvas'); c.width = width; c.height = 4; const x = c.getContext('2d')!; x.fillStyle = '#000'; x.fillRect(0, 0, transparent ? 2 : width, 4); return c.toDataURL('image/png').split(',')[1]; }, { transparent, width }), 'base64');
  const body = await png(false), mask = await png(true), opaque = await png(false);
  ctx.files.set('body', body); ctx.files.set('mask', mask);
  await page.getByLabel('Imagem do molde', { exact: true }).setInputFiles({ name: 'body.png', mimeType: 'image/png', buffer: body });
  await page.getByLabel('Máscara de câmera', { exact: true }).setInputFiles({ name: 'opaque.png', mimeType: 'image/png', buffer: opaque });
  await page.getByRole('button', { name: 'Salvar modelo técnico', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('transparentes'); expect(ctx.uploads).toHaveLength(0);
  await page.getByLabel('Máscara de câmera', { exact: true }).setInputFiles({ name: 'size-mismatch.png', mimeType: 'image/png', buffer: await png(true, 8) });
  await page.getByRole('button', { name: 'Salvar modelo técnico', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('mesmas dimensões'); expect(ctx.uploads).toHaveLength(0);
  await page.getByLabel('Máscara de câmera', { exact: true }).setInputFiles({ name: 'mask.png', mimeType: 'image/png', buffer: mask });
  await expect(page.getByText('Estado: Em preparação')).toBeVisible();
  await page.getByLabel('Publicar no Panda IA', { exact: true }).check();
  await page.getByRole('button', { name: 'Salvar modelo técnico', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('conferência'); expect(ctx.uploads).toHaveLength(0);
  await page.getByLabel(/Confirmo a conferência técnica/).check();
  // Checking verification deliberately clears the publishing choice; publishing stays explicit.
  await expect(page.getByLabel('Publicar no Panda IA', { exact: true })).not.toBeChecked();
  await page.getByLabel('Publicar no Panda IA', { exact: true }).check();
  await page.screenshot({ path: testInfo.outputPath('modelo-tecnico.png') });
  await page.getByRole('button', { name: 'Salvar modelo técnico', exact: true }).click();
  await expect(page.getByText(/Modelo técnico salvo. Catálogo/)).toBeVisible(); expect(ctx.uploads).toHaveLength(2);
  expect(ctx.uploads[0]).toMatch(/body-[\w-]+\.png$/); expect(ctx.uploads[1]).toMatch(/mask-[\w-]+\.png$/);
  const saved = ctx.calls.find(c => c.name === 'pamda_admin_salvar_modelo_panda_ia')!;
  expect(saved.args.p_kit_id).toBe(kitId(1)); expect(saved.args.p_conferido).toBe(true); expect(saved.args.p_publicar).toBe(true);
  await expect(page.getByText('Estado: Publicado', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText('Modelo técnico | Panda IA', { exact: true })).toHaveCount(0);
  await page.getByTestId(`product-${kitId(1)}`).getByRole('button', { name: /^Consultar / }).click();
  await expect(page.getByText('Estado: Publicado', { exact: true })).toBeVisible(); expect(ctx.state.pageErrors).toEqual([]);
});

test('funcionário consulta produtos sem ações de alteração nem acesso aos modelos técnicos', async ({ page }) => {
  const ctx = await setup(page, 'venda_atendimento'); await open(page);
  await page.getByRole('button', { name: 'Produtos Físicos', exact: true }).click();
  for (const name of ['Novo Produto','Nova Capa + Kit','Novo Kit Composto','Duplicar Produto + Kit']) await expect(page.getByRole('button', { name, exact: true })).toBeDisabled();
  await expect(page.getByTestId(`product-${productId(1)}`).getByRole('button', { name: /^Editar / })).toBeDisabled();
  await expect(page.getByTestId(`product-${productId(1)}`).getByRole('button', { name: /^Alterar SKU de / })).toBeDisabled();
  await expect(page.getByTestId(`product-${productId(1)}`).getByRole('button', { name: /^Arquivar produto / })).toBeDisabled();
  await page.getByTestId(`product-${productId(1)}`).getByRole('button', { name: /^Consultar / }).click();
  await expect(page.getByText('Preço: R$ 10,00')).toBeVisible(); await expect(page.getByRole('button', { name: 'Editar Produto', exact: true })).toHaveCount(0);
  expect(ctx.state.writes).toEqual([]);
});

test('kit composto usa UUIDs oficiais e duplicação preenche capa e kit sem reaproveitar SKU', async ({ page }) => {
  const ctx = await adminBackend(page);
  const physical = ctx.products.find(p => p.id === productId(1))!;
  const service = ctx.products.find(p => p.type === 'servico')!; service.sku = 'SRV-DTF-UV';
  await open(page);
  await page.getByRole('button', { name: 'Novo Kit Composto', exact: true }).click();
  await page.getByLabel('Capa física', { exact: true }).selectOption(physical.id);
  await page.getByLabel('Serviço', { exact: true }).selectOption(service.id);
  await page.getByLabel('Preço de venda (R$)', { exact: true }).fill('32,50');
  await page.getByRole('button', { name: 'Confirmar e salvar' }).click();
  await expect(page.getByText(/Produto salvo no PAMDA CORE/)).toBeVisible();
  expect(ctx.calls[0]).toEqual({ name: 'pamda_cadastrar_kit', args: { p_capa_id: physical.id, p_servico_id: service.id, p_preco_venda: 32.5, p_custo_gerencial: null } });
  await page.getByRole('button', { name: 'Duplicar Produto + Kit', exact: true }).click();
  await page.getByLabel('Produto original').selectOption(kitId(1));
  await expect(page.getByLabel('Modelo', { exact: true })).toHaveValue('iPhone 11');
  await expect(page.getByLabel('SKU novo', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Preço da capa (R$)', { exact: true })).toHaveValue('10');
  await expect(page.getByLabel('Preço do kit (R$)', { exact: true })).toHaveValue('25');
  await page.getByLabel('SKU novo', { exact: true }).fill('CAP-DUPLICADO-ISOLADO');
  await page.getByLabel(/Confirmo criar um novo produto/).check();
  await page.getByRole('button', { name: 'Confirmar e salvar' }).click();
  await expect(page.getByText(/639 itens oficiais/)).toBeVisible();
  expect(ctx.calls[1].name).toBe('pamda_admin_criar_capa_com_kit');
  expect(ctx.calls[1].args.p_sku_capa).toBe('CAP-DUPLICADO-ISOLADO'); expect(ctx.calls[1].args.p_preco_kit).toBe(25);
});
