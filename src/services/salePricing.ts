import type { PricingProduct } from '../types/productCatalog';
import type { ComponentCostSnapshot, PricingCalculation, PricingDraftItem, PricingLine, ProductPricingSnapshot, PriceDraftReview } from '../types/salePricing';

export const centsInput = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');
export const formatMoney = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export function parsePriceInput(input: string): number | null {
  if (!/^\d+(?:[.,]\d{0,2})?$/.test(input.trim())) return null;
  const [whole, fraction = ''] = input.trim().replace(',', '.').split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : null;
}
function checked(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Valor fora da precisão monetária suportada.');
  return value;
}
function micros(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && Number.isSafeInteger(Math.round(value * 1e6))
    ? Math.round(value * 1e6) : null;
}
function costSnapshot(product: PricingProduct, catalog: readonly PricingProduct[], seen: Set<string>): { direct: number | null; components: ComponentCostSnapshot[] } {
  if (seen.has(product.id)) return { direct: null, components: [] };
  if (product.type !== 'kit') return { direct: micros(product.currentCost), components: [] };
  if (!product.components?.length) return { direct: null, components: [] };
  const path = new Set(seen).add(product.id);
  const components = product.components.map(component => {
    const source = catalog.find(value => value.id === component.componentProductId);
    const cost = source ? costSnapshot(source, catalog, path) : { direct: null, components: [] };
    return { productId: component.componentProductId, productName: source?.name || component.componentName,
      quantity: component.quantity, unitCostMicros: cost.direct, components: cost.components };
  });
  if (components.some(component => component.unitCostMicros === null || !Number.isFinite(component.quantity) || component.quantity <= 0 || micros(component.quantity) === null || micros(component.quantity)! / 1e6 !== component.quantity)) return { direct: null, components };
  let sum = 0n;
  for (const component of components) sum += (BigInt(component.unitCostMicros!) * BigInt(micros(component.quantity)! ) + 500000n) / 1000000n;
  return { direct: checked(Number(sum)), components };
}
export function captureProductPricing(product: PricingProduct, catalog: readonly PricingProduct[], capturedAt: string): ProductPricingSnapshot {
  const cents = typeof product.salePrice === 'number' ? parsePriceInput(String(product.salePrice)) : null;
  if (product.salePrice !== null && cents === null) throw new Error('O produto não possui preço de catálogo válido com até duas casas decimais.');
  const cost = costSnapshot(product, catalog, new Set());
  return { productId: product.id, productCode: product.code, productName: product.name, productType: product.type,
    productSku: product.sku ?? null, productDescription: product.description ?? null,
    catalogSource: product.catalogSource || 'demo', catalogUpdatedAt: product.updatedAt, capturedAt, originalUnitPriceCents: cents,
    directUnitCostMicros: cost.direct, managerialUnitCostMicros: micros(product.managerialCost), components: cost.components };
}
const margin = (profit: number | null, revenue: number) => profit !== null && revenue > 0 ? profit / revenue * 100 : null;
const lineCost = (unitMicros: number | null, quantity: number) => unitMicros === null ? null : checked(Number((BigInt(unitMicros) * BigInt(quantity) + 5000n) / 10000n));

// Desconto adicional absoluto, rateado uma unica vez em centavos (maiores restos).
// A diferenca para o catalogo e apenas informativa: o preco negociado ja a inclui.
export function calculateSalePricing(items: readonly PricingDraftItem[], discountInput: string): PricingCalculation {
  const errors: string[] = [];
  try {
    const discount = parsePriceInput(discountInput);
    if (discount === null) errors.push('Informe um desconto adicional válido, sem valor negativo e com até duas casas decimais.');
    const valid = items.map((item, index) => {
      const price = parsePriceInput(item.priceInput);
      const quantity = /^\d+$/.test(item.quantityInput) ? Number(item.quantityInput) : NaN;
      if (price === null) errors.push(`Item ${index + 1}: informe um preço válido, sem valor negativo e com até duas casas decimais.`);
      if (!Number.isSafeInteger(quantity) || quantity < 1) errors.push(`Item ${index + 1}: informe uma quantidade inteira positiva.`);
      return { item, price: price ?? 0, quantity };
    });
    if (errors.length) return { errors, lines: [], totals: null };
    const gross = valid.map(({ price, quantity }) => checked(price * quantity));
    const negotiated = gross.reduce((sum, value) => checked(sum + value), 0);
    if (discount! > negotiated) return { errors: ['O desconto adicional não pode exceder o subtotal negociado.'], lines: [], totals: null };
    const shares = gross.map(value => negotiated ? Number(BigInt(discount!) * BigInt(value) / BigInt(negotiated)) : 0);
    let remainder = discount! - shares.reduce((sum, value) => sum + value, 0);
    const order = gross.map((value, index) => ({ index, rest: negotiated ? BigInt(discount!) * BigInt(value) % BigInt(negotiated) : 0n }))
      .sort((left, right) => left.rest === right.rest ? left.index - right.index : left.rest > right.rest ? -1 : 1);
    for (const row of order) if (remainder > 0) { shares[row.index]++; remainder--; }
    const lines: PricingLine[] = valid.map(({ item, price, quantity }, index) => {
      const net = gross[index] - shares[index];
      const direct = lineCost(item.snapshot.directUnitCostMicros, quantity);
      const managerial = lineCost(item.snapshot.managerialUnitCostMicros, quantity);
      const profit = direct === null ? null : net - direct;
      const result = managerial === null ? null : net - managerial;
      const belowDirectCost = direct !== null && net < direct;
      const belowManagerialCost = managerial !== null && net < managerial;
      return { item, quantity, unitPriceCents: price, catalogTotalCents: item.snapshot.originalUnitPriceCents === null ? null : checked(item.snapshot.originalUnitPriceCents * quantity), grossCents: gross[index],
        additionalDiscountCents: shares[index], netCents: net, directCostCents: direct, managerialCostCents: managerial,
        grossProfitCents: profit, grossMarginPercent: margin(profit, net), managerialResultCents: result, managerialMarginPercent: margin(result, net),
        belowDirectCost, belowManagerialCost, requiresAuthorization: belowDirectCost || belowManagerialCost || direct === null };
    });
    const sumCost = (field: 'directCostCents' | 'managerialCostCents') => lines.some(line => line[field] === null) ? null : lines.reduce((sum, line) => checked(sum + line[field]!), 0);
    const direct = sumCost('directCostCents'); const managerial = sumCost('managerialCostCents');
    const net = negotiated - discount!;
    const profit = direct === null ? null : net - direct;
    const result = managerial === null ? null : net - managerial;
    const catalog = lines.some(line => line.catalogTotalCents === null) ? null : lines.reduce((sum, line) => checked(sum + line.catalogTotalCents!), 0);
    return { errors, lines, totals: { catalogCents: catalog, negotiatedCents: negotiated, priceDifferenceCents: catalog === null ? null : negotiated - catalog,
      additionalDiscountCents: discount!, netCents: net, directCostCents: direct, managerialCostCents: managerial,
      grossProfitCents: profit, grossMarginPercent: margin(profit, net), managerialResultCents: result, managerialMarginPercent: margin(result, net) } };
  } catch { return { errors: ['Valores fora da precisão suportada. Revise preços, quantidades e custos.'], lines: [], totals: null }; }
}

export function buildPriceReview(calculation: PricingCalculation, revision: string, discountReason: string, customerId: string | null = null, branchId: string | null = null): PriceDraftReview {
  if (!calculation.totals || !calculation.lines.length || calculation.errors.length) throw new Error('Corrija os valores e adicione ao menos um item antes de solicitar autorização.');
  if (calculation.lines.some(line => line.item.snapshot.catalogSource !== 'demo')) throw new Error('Autorizações para o catálogo oficial ainda dependem da integração comercial. Nenhuma venda será confirmada.');
  if (calculation.lines.some(line => line.item.snapshot.originalUnitPriceCents === null)) throw new Error('O preço original não está configurado. A autorização de demonstração exige uma referência de catálogo conhecida.');
  if (calculation.lines.some(line => line.directCostCents === null)) throw new Error('Não é possível autorizar sem custo direto conhecido. Confira o catálogo e a composição do kit.');
  if (calculation.lines.some(line => line.requiresAuthorization && !line.item.reason.trim()) ||
      (calculation.totals.additionalDiscountCents > 0 && !discountReason.trim())) throw new Error('Informe o motivo da negociação e do desconto adicional antes de solicitar autorização.');
  return { version: 1, revision, customerId, branchId, scope: 'demo_only', items: calculation.lines.map(line => ({ id: line.item.id, snapshot: line.item.snapshot,
    quantity: line.quantity, unitPriceCents: line.unitPriceCents, additionalDiscountCents: line.additionalDiscountCents, netCents: line.netCents,
    directCostCents: line.directCostCents, managerialCostCents: line.managerialCostCents, reason: line.item.reason.trim() })),
    additionalDiscountCents: calculation.totals.additionalDiscountCents, discountReason: discountReason.trim() };
}
