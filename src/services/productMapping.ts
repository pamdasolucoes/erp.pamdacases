import type { KitComponentRow, OfficialKitComponent, OfficialProduct, ProductRow } from '../types/productCatalog';
import { isUuid } from './customerEdits';

export function catalogNumber(value: number | string | null, nullable = true): number | null {
  if (value === null && nullable) return null;
  if (typeof value === 'string' && !/^-?\d+(?:\.\d+)?$/.test(value)) throw new Error('Valor numérico incompatível no catálogo oficial.');
  if ((typeof value !== 'number' && typeof value !== 'string') || !Number.isFinite(Number(value))) throw new Error('Valor numérico incompatível no catálogo oficial.');
  return Number(value);
}
export function safeProductImage(value: string | null): string | null {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? value : null; }
  catch { return null; }
}
export function mapProductCatalog(rows: readonly ProductRow[], links: readonly KitComponentRow[]): OfficialProduct[] {
  const byId = new Map<string, OfficialProduct>();
  const codes = new Set<string>(); const skus = new Set<string>();
  for (const row of rows) {
    if (!isUuid(row.id) || typeof row.code !== 'string' || !row.code.trim() || typeof row.sku !== 'string' || !row.sku.trim() ||
        typeof row.name !== 'string' || !['fisico', 'servico', 'kit', 'insumo'].includes(row.type) ||
        typeof row.active !== 'boolean' || typeof row.controls_inventory !== 'boolean' || typeof row.stock_verified !== 'boolean') {
      throw new Error('Schema de produtos incompatível com o cadastro oficial. Confira UUIDs, code TEXT e campos obrigatórios.');
    }
    if (byId.has(row.id) || codes.has(row.code) || skus.has(row.sku)) throw new Error('Produto, código ou SKU repetido durante a leitura. Atualize o catálogo.');
    codes.add(row.code); skus.add(row.sku);
    byId.set(row.id, {
      id: row.id, code: row.code, sku: row.sku, name: row.name, description: row.description,
      category: row.category, brand: row.brand, modelPhone: row.model_phone, type: row.type,
      currentCost: catalogNumber(row.current_cost), managerialCost: catalogNumber(row.managerial_cost), salePrice: catalogNumber(row.sale_price),
      controlsInventory: row.controls_inventory, currentInventory: catalogNumber(row.current_inventory, false)!, minInventory: catalogNumber(row.min_inventory, false)!,
      maxInventory: catalogNumber(row.max_inventory), stockVerified: row.stock_verified, imageUrl: row.image_url, sourceTab: row.source_tab,
      active: row.active, b2bSiteVisible: row.b2b_site_visible, notes: row.notes,
      createdAt: row.created_at, updatedAt: row.updated_at, catalogSource: 'supabase', components: [],
    });
  }
  const componentIds = new Set<string>(); const pairs = new Set<string>();
  const grouped = new Map<string, OfficialKitComponent[]>();
  for (const link of links) {
    const kit = byId.get(link.kit_product_id); const component = byId.get(link.component_product_id);
    const pair = `${link.kit_product_id}/${link.component_product_id}`;
    if (!isUuid(link.id) || componentIds.has(link.id) || pairs.has(pair)) throw new Error('Vínculo de kit inválido ou repetido durante a leitura. Atualize o catálogo.');
    if (!kit || !component || kit.type !== 'kit' || kit.id === component.id) throw new Error('Componente indisponível ou vínculo incompatível. Confira a leitura completa e as permissões.');
    const quantity = catalogNumber(link.quantity, false)!;
    if (quantity <= 0 || !Number.isInteger(link.sort_order)) throw new Error('Quantidade ou ordem de componente inválida.');
    componentIds.add(link.id); pairs.add(pair);
    const list = grouped.get(kit.id) || [];
    list.push({ id: link.id, kitProductId: kit.id, componentProductId: component.id, componentName: component.name,
      componentType: component.type, quantity, currentUnitCost: component.currentCost, controlsInventory: component.controlsInventory,
      sortOrder: link.sort_order, createdAt: link.created_at });
    grouped.set(kit.id, list);
  }
  return [...byId.values()].map(product => ({ ...product, components: (grouped.get(product.id) || []).sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id)) }));
}
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
export function searchProducts(products: readonly OfficialProduct[], query: string): readonly OfficialProduct[] {
  const normalized = normalize(query.trim());
  return normalized ? products.filter(product => [product.code, product.sku, product.name, product.modelPhone || ''].some(value => normalize(value).includes(normalized))) : products;
}
