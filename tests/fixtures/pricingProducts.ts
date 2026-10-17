import type { Product } from '../../src/types/erp';
import type { PricingDraftItem } from '../../src/types/salePricing';
import { captureProductPricing } from '../../src/services/salePricing';
import { uuid } from './customerRows';
export function draft(price='25,00', quantity='1', id=uuid(1)): PricingDraftItem {
  const catalog=pricingCatalog();
  return { id,snapshot:captureProductPricing(catalog[2],catalog,'2026-10-15T12:00:00Z'),priceInput:price,quantityInput:quantity,reason:'Negociacao conferida' };
}
export function product(id = 'simple', overrides: Partial<Product> = {}): Product {
  return { id, code:id, sku:id, name:`Produto ${id}`, description:'Teste sintetico', category:'Teste', brand:'Teste',
    type:'fisico', currentCost:2.5, salePrice:10, controlsInventory:true, currentInventory:100, minInventory:0,
    active:true, b2bSiteVisible:true, createdAt:'2026-10-01T00:00:00Z', updatedAt:'2026-10-15T00:00:00Z', ...overrides };
}
export function pricingCatalog() {
  const physical=product('physical');
  const service=product('service',{ type:'servico', currentCost:1.8, salePrice:20, controlsInventory:false });
  const kit=product('kit',{ type:'kit',currentCost:999,managerialCost:5,salePrice:25,components:[
    { id:'component1',componentProductId:physical.id,componentName:physical.name,componentType:physical.type,quantity:1,currentUnitCost:999,controlsInventory:true,sortOrder:1 },
    { id:'component2',componentProductId:service.id,componentName:service.name,componentType:service.type,quantity:1,currentUnitCost:999,controlsInventory:false,sortOrder:2 },
  ] });
  return [physical, service, kit];
}
