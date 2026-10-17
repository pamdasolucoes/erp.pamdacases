import type { ProductType } from './erp';

// Schema oficial informado pela Pamda em 16/10/2026; nao usa a migration antiga.
export interface ProductRow {
  id: string; code: string; sku: string; name: string; description: string | null;
  category: string; brand: string; model_phone: string | null; type: ProductType;
  current_cost: number | string | null; managerial_cost: number | string | null; sale_price: number | string | null;
  controls_inventory: boolean; current_inventory: number | string; min_inventory: number | string;
  max_inventory: number | string | null; stock_verified: boolean; image_url: string | null;
  source_tab: string | null; active: boolean; b2b_site_visible: boolean; notes: string | null;
  created_at: string; updated_at: string;
}
export interface KitComponentRow {
  id: string; kit_product_id: string; component_product_id: string;
  quantity: number | string; sort_order: number; created_at: string;
}
export interface PricingComponent {
  readonly componentProductId: string;
  readonly componentName: string;
  readonly quantity: number;
}
export interface PricingProduct {
  readonly sku?: string; readonly description?: string | null;
  readonly id: string; readonly code: string; readonly name: string; readonly type: ProductType;
  readonly currentCost: number | null; readonly managerialCost?: number | null; readonly salePrice: number | null;
  readonly updatedAt: string; readonly catalogSource?: 'demo' | 'supabase';
  readonly components?: readonly PricingComponent[];
}
export interface OfficialKitComponent extends PricingComponent {
  readonly id: string; readonly kitProductId: string; readonly componentType: ProductType;
  readonly currentUnitCost: number | null; readonly controlsInventory: boolean;
  readonly sortOrder: number; readonly createdAt: string;
}
export interface OfficialProduct extends PricingProduct {
  readonly sku: string; readonly description: string | null; readonly category: string; readonly brand: string;
  readonly modelPhone: string | null; readonly managerialCost: number | null;
  readonly controlsInventory: boolean; readonly currentInventory: number; readonly minInventory: number;
  readonly maxInventory: number | null; readonly stockVerified: boolean;
  readonly imageUrl: string | null; readonly sourceTab: string | null;
  readonly active: boolean; readonly b2bSiteVisible: boolean; readonly notes: string | null;
  readonly createdAt: string; readonly catalogSource: 'supabase';
  readonly components: readonly OfficialKitComponent[];
}
