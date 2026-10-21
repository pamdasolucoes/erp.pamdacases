import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ProductAdminService, productCommand, productDraft, optionalAmount, validateAssetFile, validatePublication, pandaState } from '../src/services/productAdmin';
import { mapProductCatalog } from '../src/services/productMapping';
import { officialCatalogFixture } from './fixtures/officialProducts';
import type { User } from '../src/types/erp';

const fixture = officialCatalogFixture();
const products = mapProductCatalog(fixture.products, fixture.components);
test('comandos usam RPCs oficiais, valores NULL, SKU novo e somente campos editáveis', () => {
  const draft = { ...productDraft(), model: 'Samsung A18', brand: 'Samsung', sku: 'CAP-ISOLATED', price: '10,50', kitPrice: '30' };
  const command = productCommand('case', draft, products);
  assert.equal(command.name, 'pamda_admin_criar_capa_com_kit');
  assert.equal(command.args.p_preco_capa, 10.5); assert.equal(command.args.p_custo_capa, null);
  assert.ok(!JSON.stringify(command.args).includes('code'));
  assert.throws(() => productCommand('case', { ...draft, sku: products[0].sku.toLowerCase() }, products), /SKU/);
  assert.throws(() => productCommand('clone', { ...productDraft(products[0]), sku: 'NEW-SKU' }, products, products[0]), /Confirme/);
  const clone = productCommand('clone', { ...productDraft(products[0]), sku: 'NEW-SKU', confirmed: true }, products, products[0]);
  assert.equal(clone.name, 'pamda_cadastrar_item_basico');
  assert.ok(!('p_current_inventory' in clone.args)); assert.ok(!('p_code' in clone.args));
  const edit = productCommand('edit', { ...productDraft(products[0]), name: 'Nome revisado', reason: 'Correção do nome' }, products, products[0]);
  assert.equal(edit.args.p_expected_updated_at, products[0].updatedAt);
  assert.deepEqual(edit.args.p_changes, { name: 'Nome revisado' });
  assert.ok(!('active' in edit.args.p_changes));
  const fullEdit = productCommand('edit', { ...productDraft(products[0]), name: 'Nome revisado', description: 'Descrição', category: 'Categoria revisada',
    brand: 'Marca revisada', model: 'Modelo X', cost: '8,50', managerial: '3', price: '20', image: 'https://images.invalid/product.png', reason: 'Dados corrigidos' }, products, products[0]);
  assert.deepEqual(fullEdit.args.p_changes, { name: 'Nome revisado', description: 'Descrição', category: 'Categoria revisada', brand: 'Marca revisada',
    model_phone: 'Modelo X', current_cost: 8.5, managerial_cost: 3, sale_price: 20, image_url: 'https://images.invalid/product.png' });
  const nullEdit = productCommand('edit', { ...productDraft(products[1]), name: 'Produto revisado', reason: 'Dados corrigidos' }, products, products[1]);
  assert.deepEqual(nullEdit.args.p_changes, { name: 'Produto revisado' });
  const skuItem = products.find(p => p.type === 'fisico' && p.components.length === 0 && products.filter(k => k.type === 'kit' && k.components.some(c => c.componentProductId === p.id)).length === 1)!;
  const skuKit = products.find(p => p.type === 'kit' && p.components.some(c => c.componentProductId === skuItem.id))!;
  const serviceId = skuKit.components.find(c => c.componentType === 'servico')!.componentProductId;
  const skuProducts = products.map(p => p.id === skuKit.id ? { ...p, sku: `KIT-${skuItem.sku}` } : p.id === serviceId ? { ...p, sku: 'SRV-DTF-UV' } : p);
  const sku = productCommand('sku', { ...productDraft(skuItem), sku: 'NEW-CASE', reason: 'Correção SKU solicitada' }, skuProducts, skuItem);
  assert.equal(sku.name, 'pamda_admin_produto_acao');
  assert.deepEqual(sku.args.p_dados, { sku: 'NEW-CASE', linked_product_id: skuKit.id, expected_linked_updated_at: skuKit.updatedAt });
  assert.throws(() => productCommand('sku', { ...productDraft(skuItem), sku: 'NEW-CASE', linkedSku: 'ARBITRARIO', reason: 'Correção SKU solicitada' }, skuProducts, skuItem), /SKU do kit deve ser KIT-/);
  assert.throws(() => productCommand('sku', { ...productDraft(skuKit), sku: 'NEW-KIT', reason: 'Correção SKU solicitada' }, skuProducts, skuKit), /pela capa vinculada/);
  assert.throws(() => productCommand('sku', { ...productDraft(skuItem), sku: 'NEW-CASE', reason: 'Correção SKU solicitada' }, products, skuItem), /especial ou incoerente/);
  for (const confirmSku of ['', 'ERRADO', skuItem.sku.toLowerCase(), `${skuItem.sku} `]) {
    assert.throws(() => productCommand('archive', { ...productDraft(skuItem), confirmSku, reason: 'Produto descontinuado' }, products, skuItem), /Digite exatamente o SKU atual/);
  }
  const archive = productCommand('archive', { ...productDraft(skuItem), confirmSku: skuItem.sku, reason: 'Produto descontinuado' }, products, skuItem);
  assert.equal(archive.args.p_acao, 'arquivar'); assert.deepEqual(archive.args.p_dados, { confirm_sku: skuItem.sku });
  assert.throws(() => productCommand('edit', { ...productDraft(skuKit), price: '', reason: 'Remover preço' }, products, { ...skuKit, b2bSiteVisible: true }), /Despublique.*remover o preço/);
  assert.equal(optionalAmount(''), null); assert.equal(optionalAmount('0'), 0);
  for (const value of ['-1', 'NaN', '1.000,50']) assert.throws(() => optionalAmount(value));
});
test('serviço restringe administrador ativo, identidade e falhas; invalida cache apenas em sucesso', async () => {
  let user = { id: 'user-test', active: true, role: 'venda_atendimento' } as User;
  const calls: any[] = []; let invalidations = 0, failure: { code?: string; message: string } | null = null;
  const client = { auth: { getUser: async () => ({ data: { user: { id: 'user-test' } }, error: null }) },
    rpc: async (name: string, args: object) => { calls.push({ name, args }); return { data: { produto_id: 'new-id' }, error: failure }; } } as unknown as SupabaseClient;
  const service = new ProductAdminService(client, () => user, () => invalidations++);
  const draft = { ...productDraft(), name: 'Produto isolado', sku: 'NEW-SKU' };
  await assert.rejects(service.save('basic', draft, products), /administrador/); assert.equal(calls.length, 0);
  user = { ...user, role: 'admin_gerencial' };
  await service.save('basic', draft, products); assert.equal(invalidations, 1);
  user = { ...user, active: false };
  await assert.rejects(service.save('basic', draft, products), /administrador ativo/); assert.equal(invalidations, 1);
  user = { ...user, active: true };
  failure = { code: '23505', message: 'duplicate' };
  await assert.rejects(service.save('basic', draft, products), /SKU/); assert.equal(invalidations, 1);
  failure = { message: 'TypeError: fetch failed' };
  await assert.rejects(service.save('basic', draft, products), /Falha de conexão/); assert.equal(invalidations, 1);
  user = { ...user, id: 'other-user' }; await assert.rejects(service.save('basic', draft, products), /sessão mudou/);
});
test('arquivos e estados técnicos: tamanho, formato, máscara e requisitos de publicação', () => {
  validateAssetFile({ size: 10 * 1024 * 1024, type: 'image/png' }, true);
  for (const file of [{ size: 10 * 1024 * 1024 + 1, type: 'image/png' }, { size: 10, type: 'image/svg+xml' }, { size: 0, type: 'image/png' }]) assert.throws(() => validateAssetFile(file, false));
  assert.throws(() => validateAssetFile({ size: 10, type: 'image/jpeg' }, true), /PNG/);
  const kit = products.find(p => p.type === 'kit')!;
  const model = { kit_product_id: kit.id, model_label: 'Teste', brand: 'Marca', body_url: null, mask_url: null, technical_verified: false, published: false };
  assert.equal(pandaState(null), 'Em preparação'); assert.equal(pandaState(model), 'Aguardando imagens');
  const assets = { ...model, body_url: 'https://test.invalid/body.png', mask_url: 'https://test.invalid/mask.png' };
  assert.equal(pandaState(assets), 'Aguardando conferência');
  assert.throws(() => validatePublication(kit, { ...assets, published: true }), /conferência/);
  validatePublication(kit, { ...assets, technical_verified: true, published: true });
  assert.throws(() => validatePublication({ ...kit, active: false }, { ...assets, technical_verified: true, published: true }), /ativo/);
});
