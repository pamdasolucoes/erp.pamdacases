import type { OfficialProduct } from '../types/productCatalog';
import type { PricingDraftItem } from '../types/salePricing';

export function checkDraftStock(items: readonly PricingDraftItem[], products: readonly OfficialProduct[]) {
  const errors = new Set<string>(); const warnings = new Set<string>(); const required = new Map<string, number>();
  function expand(id: string, quantity: number, path: Set<string>) {
    const product = products.find(value => value.id === id);
    if (!product || !product.active) { errors.add('Há um produto indisponível no cadastro oficial.'); return; }
    if (path.has(id)) { errors.add('A composição de um kit precisa ser revisada.'); return; }
    if (product.controlsInventory) required.set(id, (required.get(id) || 0) + quantity);
    if (product.type === 'kit') {
      if (!product.components.length) warnings.add(`Composição de ${product.name} pendente de conferência.`);
      for (const component of product.components) expand(component.componentProductId, quantity * component.quantity, new Set(path).add(id));
    }
  }
  for (const item of items) {
    const quantity = Number(item.quantityInput);
    if (Number.isSafeInteger(quantity) && quantity > 0) expand(item.snapshot.productId, quantity, new Set());
  }
  for (const [id, quantity] of required) {
    const product = products.find(value => value.id === id)!;
    if (!product.stockVerified) warnings.add(`Estoque de ${product.name} não conferido; disponibilidade a confirmar.`);
    else if (product.currentInventory < quantity) errors.add(`Estoque conferido insuficiente: ${product.name} (${product.currentInventory} disponível).`);
  }
  return { errors: [...errors], warnings: [...warnings] };
}
