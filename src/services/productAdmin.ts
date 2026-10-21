import type { SupabaseClient } from '@supabase/supabase-js';
import type { User } from '../types/erp';
import type { OfficialProduct } from '../types/productCatalog';

export type ProductMode = 'basic' | 'case' | 'kit' | 'edit' | 'clone' | 'sku' | 'archive';
export interface ProductDraft {
  name: string; sku: string; type: string; category: string; brand: string; model: string;
  description: string; image: string; price: string; kitPrice: string; cost: string;
  managerial: string; kitManagerial: string; reason: string; linkedSku: string; confirmSku: string;
  caseId: string; serviceId: string; confirmed: boolean;
}
export interface PandaModel {
  kit_product_id: string; model_label: string; brand: string; body_url: string | null;
  mask_url: string | null; technical_verified: boolean; published: boolean;
}
export function productDraft(product?: OfficialProduct): ProductDraft {
  const number = (v: number | null | undefined) => v == null ? '' : String(v);
  return { name: product?.name ?? '', sku: '', type: product?.type ?? 'fisico', category: product?.category ?? '',
    brand: product?.brand ?? '', model: product?.modelPhone ?? '', description: product?.description ?? '',
    image: product?.imageUrl ?? '', price: number(product?.salePrice), kitPrice: '', cost: number(product?.currentCost),
    managerial: number(product?.managerialCost), kitManagerial: '',
    reason: '', linkedSku: '', confirmSku: '', caseId: '', serviceId: '', confirmed: false };
}
export function optionalAmount(value: string): number | null {
  if (!value.trim()) return null;
  if (!/^\d+(?:[.,]\d{1,6})?$/.test(value.trim())) throw new Error('Informe valores numéricos positivos, sem separador de milhar.');
  const result = Number(value.replace(',', '.'));
  if (!Number.isFinite(result)) throw new Error('Valor inválido.');
  return result;
}
function required(value: string, label: string) {
  if (value.trim().length < 2) throw new Error(`Informe ${label}.`);
  return value.trim();
}
function imageUrl(value: string): string | null {
  if (!value.trim()) return null;
  try { const url = new URL(value.trim()); if (url.protocol === 'https:' && !url.username && !url.password) return url.href; } catch {}
  throw new Error('A imagem precisa de uma URL HTTPS válida.');
}
export function productCommand(mode: ProductMode, draft: ProductDraft, products: readonly OfficialProduct[], original?: OfficialProduct) {
  const price = optionalAmount(draft.price), cost = optionalAmount(draft.cost), managerial = optionalAmount(draft.managerial);
  if (mode === 'edit') {
    if (!original?.updatedAt) throw new Error('Atualize o produto antes de editar.');
    if (!original.active) throw new Error('Produtos arquivados não podem ser editados.');
    if (original.type === 'kit' && original.b2bSiteVisible && price === null) throw new Error('Despublique o modelo Panda IA antes de remover o preço do kit.');
    if (draft.reason.trim().length < 5) throw new Error('Informe um motivo com pelo menos cinco caracteres.');
    const values = { name: required(draft.name, 'nome'), description: draft.description || null,
      category: required(draft.category, 'categoria'), brand: required(draft.brand, 'marca'), model_phone: draft.model.trim() || null,
      current_cost: cost, managerial_cost: managerial, sale_price: price, image_url: imageUrl(draft.image) };
    const previous = { name: original.name, description: original.description, category: original.category, brand: original.brand,
      model_phone: original.modelPhone, current_cost: original.currentCost, managerial_cost: original.managerialCost,
      sale_price: original.salePrice, image_url: original.imageUrl };
    const changes = Object.fromEntries(Object.entries(values).filter(([key, value]) => value !== previous[key as keyof typeof previous]));
    if (!Object.keys(changes).length) throw new Error('Nenhuma alteração para salvar.');
    return { name: 'pamda_admin_editar_produto', args: { p_produto_id: original.id, p_expected_updated_at: original.updatedAt, p_changes: changes, p_motivo: draft.reason.trim() } };
  }
  if (mode === 'sku' || mode === 'archive') {
    if (!original?.updatedAt || !original.active) throw new Error('Atualize o catálogo e selecione um produto ativo.');
    if (draft.reason.trim().length < 5) throw new Error('Informe um motivo com pelo menos cinco caracteres.');
    if (mode === 'archive' && draft.confirmSku !== original.sku) throw new Error('Digite exatamente o SKU atual para confirmar o arquivamento.');
    if (mode === 'sku' && original.type === 'kit') throw new Error('Altere o SKU pela capa vinculada; kits especiais exigem revisão administrativa.');
    if (mode === 'sku' && original.type !== 'fisico' && dependentKits(products, original.id).length) throw new Error('Componente de kit especial exige revisão administrativa.');
    const args = mode === 'archive'
      ? { sku: undefined, linkedSku: undefined }
      : { sku: required(draft.sku, 'um SKU novo').toUpperCase(), linkedSku: null as string | null };
    const linkedKits = mode === 'sku' && original.type === 'fisico'
      ? products.filter(p => p.type === 'kit' && p.components.some(c => c.componentProductId === original.id))
      : [];
    if (linkedKits.length > 1) throw new Error('Este produto tem vários kits vinculados. A alteração precisa de revisão administrativa.');
    const linkedKit = linkedKits[0];
    if (linkedKit) {
      const components = linkedKit.components;
      if (linkedKit.sku !== `KIT-${original.sku}` || ['CAP-CARTEIRA','CAP-MAGSAFE','CAP-SPACE','CAP-VELUDO'].includes(original.sku) || ['CAP-CARTEIRA','CAP-MAGSAFE','CAP-SPACE','CAP-VELUDO'].includes(args.sku!) ||
          components.length !== 2 || !components.some(c => c.componentProductId === original.id && c.quantity === 1) ||
          !components.some(c => c.componentType === 'servico' && c.quantity === 1 && products.find(p => p.id === c.componentProductId)?.sku === 'SRV-DTF-UV')) throw new Error('Kit especial ou incoerente exige revisão administrativa.');
      args.linkedSku = `KIT-${args.sku}`;
      if (args.linkedSku.length > 100) throw new Error('SKU da capa excede o limite para gerar o SKU do kit.');
    }
    if (mode === 'sku' && draft.linkedSku && draft.linkedSku !== args.linkedSku) throw new Error('SKU do kit deve ser KIT- seguido do SKU da capa.');
    if (mode === 'sku' && args.sku === original.sku.trim().toUpperCase()) throw new Error('Informe um SKU diferente do atual.');
    if (linkedKit && args.linkedSku === linkedKit.sku.trim().toUpperCase()) throw new Error('Informe um SKU diferente do kit atual.');
    if (linkedKit && args.linkedSku === args.sku) throw new Error('A capa e o kit precisam ter SKUs diferentes.');
    if (mode === 'sku' && args.sku && products.some(p =>
      p.id !== original.id && p.id !== linkedKit?.id && p.sku.trim().toUpperCase() === args.sku)) {
      throw new Error('SKU já cadastrado. Escolha uma referência nova.');
    }
    if (linkedKit && args.linkedSku && products.some(p =>
      p.id !== original.id && p.id !== linkedKit.id && p.sku.trim().toUpperCase() === args.linkedSku)) {
      throw new Error('SKU do kit já cadastrado. Escolha uma referência nova.');
    }
    return { name: 'pamda_admin_produto_acao', args: {
      p_produto_id: original.id,
      p_acao: mode === 'sku' ? 'alterar_sku' : 'arquivar',
      p_expected_updated_at: original.updatedAt,
      p_dados: mode === 'sku' ? { sku: args.sku,
        linked_product_id: linkedKit?.id ?? null, expected_linked_updated_at: linkedKit?.updatedAt ?? null } : { confirm_sku: draft.confirmSku },
      p_motivo: draft.reason.trim(),
    } };
  }
  if (mode === 'kit') {
    if (!products.some(p => p.id === draft.caseId && p.type === 'fisico' && p.active) || !products.some(p => p.id === draft.serviceId && p.type === 'servico' && p.active)) throw new Error('Selecione uma capa física e um serviço ativos.');
    if (price === null) throw new Error('Informe o preço real do kit.');
    return { name: 'pamda_cadastrar_kit', args: { p_capa_id: draft.caseId, p_servico_id: draft.serviceId, p_preco_venda: price, p_custo_gerencial: managerial } };
  }
  const sku = required(draft.sku, 'um SKU novo').toUpperCase();
  if (products.some(p => p.sku.trim().toUpperCase() === sku || mode === 'case' && p.sku.trim().toUpperCase() === `KIT-${sku}`)) throw new Error('SKU da capa, produto ou kit já existe. Escolha um SKU novo.');
  if (original && !draft.confirmed) throw new Error('Confirme explicitamente a criação de um novo produto.');
  if (mode === 'case') {
    if (original?.type === 'kit') {
      const physical = original.components.filter(c => c.componentType === 'fisico');
      const services = original.components.filter(c => c.componentType === 'servico');
      const service = products.find(p => p.id === services[0]?.componentProductId);
      if (original.components.length !== 2 || physical.length !== 1 || services.length !== 1 || original.components.some(c => c.quantity !== 1) || service?.sku !== 'SRV-DTF-UV') throw new Error('Este kit tem composição especial. A duplicação automática disponível cria capa + serviço DTF UV. Para outra composição, cadastre os itens e use Novo Kit Composto conforme as regras do servidor.');
    }
    const kitPrice = optionalAmount(draft.kitPrice);
    if (price === null || price <= 0 || kitPrice === null || kitPrice <= 0 || kitPrice < price) throw new Error('Informe preços reais: o kit deve custar pelo menos o valor da capa.');
    return { name: 'pamda_admin_criar_capa_com_kit', args: { p_modelo: required(draft.model, 'modelo'), p_marca: required(draft.brand, 'marca'), p_sku_capa: sku,
      p_preco_capa: price, p_preco_kit: kitPrice, p_custo_capa: cost, p_custo_gerencial_capa: managerial, p_custo_gerencial_kit: optionalAmount(draft.kitManagerial) } };
  }
  if (!['fisico', 'servico', 'insumo'].includes(draft.type)) throw new Error('Para clonar um kit, use Duplicar Produto + Kit e informe o SKU da nova capa.');
  return { name: 'pamda_cadastrar_item_basico', args: { p_tipo: draft.type, p_nome: required(draft.name, 'nome'), p_sku: sku,
    p_categoria: draft.category.trim() || null, p_marca: draft.brand.trim() || null, p_modelo: draft.model.trim() || null,
    p_custo: cost, p_preco: price, p_custo_gerencial: managerial, p_especial: false, p_imagem: imageUrl(draft.image) } };
}
export function dependentKits(products: readonly OfficialProduct[], productId: string) {
  return products.filter(p => p.type === 'kit' && p.components.some(c => c.componentProductId === productId));
}
export function pandaState(model: PandaModel | null) {
  if (model?.published) return 'Publicado';
  if (!model) return 'Em preparação';
  if (!model.body_url || !model.mask_url) return 'Aguardando imagens';
  return model.technical_verified ? 'Em preparação' : 'Aguardando conferência';
}
export function validatePublication(kit: OfficialProduct, model: PandaModel) {
  if (model.published && (!model.body_url || !model.mask_url || !model.technical_verified || !kit.active || kit.salePrice === null)) throw new Error('Para publicar, envie molde e máscara, confirme a conferência técnica e configure kit ativo com preço.');
}
export function validateAssetFile(file: Pick<File, 'size' | 'type'>, mask: boolean) {
  if (!file.size || file.size > 10 * 1024 * 1024) throw new Error('Cada arquivo deve ter até 10 MB e não pode estar vazio.');
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Envie imagens PNG, JPEG ou WebP.');
  if (mask && file.type !== 'image/png') throw new Error('A máscara deve ser PNG com transparência alfa.');
}
export class ProductAdminService {
  constructor(private client: SupabaseClient | null, private currentUser: () => User | null, private invalidate: () => void) {}
  private async admin() {
    const user = this.currentUser();
    if (!this.client || !user?.active || user.role !== 'admin_gerencial') throw new Error('Somente administrador ativo pode alterar produtos.');
    const identity = await this.client.auth.getUser();
    if (identity.error || identity.data.user?.id !== user.id || this.currentUser()?.id !== user.id || this.currentUser()?.role !== 'admin_gerencial' || !this.currentUser()?.active) throw new Error('A sessão mudou. Entre novamente.');
    return this.client;
  }
  async save(mode: ProductMode, draft: ProductDraft, products: readonly OfficialProduct[], original?: OfficialProduct) {
    const command = productCommand(mode, draft, products, original);
    const client = await this.admin();
    const { data, error } = await client.rpc(command.name, command.args);
    if (error) throw adminError(error);
    this.invalidate(); return data;
  }
  async model(kitId: string): Promise<PandaModel | null> {
    const client = await this.admin();
    const { data, error } = await client.from('erp_panda_ia_phone_models').select('kit_product_id,model_label,brand,body_url,mask_url,technical_verified,published').eq('kit_product_id', kitId).maybeSingle();
    if (error) throw adminError(error); return data;
  }
  async saveModel(kit: OfficialProduct, model: PandaModel) {
    validatePublication(kit, model);
    const client = await this.admin();
    const { error } = await client.rpc('pamda_admin_salvar_modelo_panda_ia', { p_kit_id: kit.id, p_nome: required(model.model_label, 'nome apresentado no site'), p_marca: required(model.brand, 'marca'),
      p_imagem_url: imageUrl(model.body_url || ''), p_mascara_url: imageUrl(model.mask_url || ''), p_conferido: model.technical_verified, p_publicar: model.published });
    if (error) throw adminError(error); this.invalidate();
  }
  async upload(kitId: string, file: File, mask: boolean) {
    validateAssetFile(file, mask);
    const client = await this.admin();
    const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[file.type];
    const path = `${kitId}/${mask ? 'mask' : 'body'}-${crypto.randomUUID()}.${extension}`;
    const bucket = client.storage.from('panda-ia-modelos');
    const { error } = await bucket.upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw adminError(error);
    return bucket.getPublicUrl(path).data.publicUrl;
  }
}
export function adminError(error: { code?: string; message: string }) {
  if (/fetch|network|timeout|connection/i.test(error.message)) return new Error('Falha de conexão. Atualize o catálogo para conferir se a operação foi concluída antes de tentar novamente.');
  if (error.code === '23505' || /SKU.*existe/i.test(error.message)) return new Error('SKU ou kit já cadastrado. Atualize o catálogo e escolha uma nova referência.');
  if (error.code === '42501') return new Error('Acesso restrito ao administrador ativo.');
  if (/outra sess|concorr/i.test(error.message)) return new Error('Este produto foi alterado em outra sessão. Feche o formulário, atualize o catálogo e revise as alterações.');
  return new Error(error.message || 'Não foi possível salvar. Confira a conexão e tente novamente.');
}
