import type { ProductType } from './erp';
import type { SaleFreightSnapshot } from './freight';

// Contrato de preparacao. Nenhum destes tipos habilita gravacao de venda oficial.
export interface ComponentCostSnapshot {
  readonly productId: string;
  readonly productName: string;
  readonly quantity: number;
  readonly unitCostMicros: number | null; // 1 real = 1.000.000 micros
  readonly components: readonly ComponentCostSnapshot[];
}
export interface ProductPricingSnapshot {
  readonly productId: string;
  readonly productCode: string;
  readonly productName: string;
  readonly productType: ProductType | null;
  readonly productSku: string | null;
  readonly productDescription: string | null;
  readonly catalogSource: 'demo' | 'supabase';
  readonly catalogUpdatedAt: string;
  readonly capturedAt: string;
  readonly originalUnitPriceCents: number | null;
  readonly directUnitCostMicros: number | null;
  readonly managerialUnitCostMicros: number | null;
  readonly components: readonly ComponentCostSnapshot[];
}
export interface PricingDraftItem {
  readonly id: string;
  readonly snapshot: ProductPricingSnapshot;
  readonly quantityInput: string;
  readonly priceInput: string;
  readonly reason: string;
  readonly customization?: { readonly model: string; readonly color: string; readonly walletFaces: '' | '1' | '2'; readonly [key:string]:unknown };
}
export interface PricingLine {
  readonly item: PricingDraftItem;
  readonly quantity: number;
  readonly unitPriceCents: number;
  readonly catalogTotalCents: number | null;
  readonly grossCents: number;
  readonly additionalDiscountCents: number;
  readonly netCents: number;
  readonly directCostCents: number | null;
  readonly managerialCostCents: number | null;
  readonly grossProfitCents: number | null;
  readonly grossMarginPercent: number | null;
  readonly managerialResultCents: number | null;
  readonly managerialMarginPercent: number | null;
  readonly belowDirectCost: boolean;
  readonly belowManagerialCost: boolean;
  readonly requiresAuthorization: boolean;
}
export interface PricingCalculation {
  readonly errors: readonly string[];
  readonly lines: readonly PricingLine[];
  readonly totals: null | {
    catalogCents: number | null; negotiatedCents: number; priceDifferenceCents: number | null;
    additionalDiscountCents: number; netCents: number;
    directCostCents: number | null; managerialCostCents: number | null;
    grossProfitCents: number | null; grossMarginPercent: number | null;
    managerialResultCents: number | null; managerialMarginPercent: number | null;
  };
}
export interface PriceDraftReview {
  readonly version: 1;
  readonly revision: string;
  readonly customerId: string | null;
  readonly branchId: string | null;
  readonly scope: 'demo_only';
  readonly items: readonly {
    id: string; snapshot: ProductPricingSnapshot; quantity: number;
    unitPriceCents: number; additionalDiscountCents: number; netCents: number;
    directCostCents: number | null; managerialCostCents: number | null; reason: string;
  }[];
  readonly additionalDiscountCents: number;
  readonly discountReason: string;
}
export interface DemoPriceAuthorization {
  readonly scope: 'demo_only';
  readonly officialSaleAllowed: false;
  readonly revision: string;
  readonly authorizedAt: string;
  readonly authorizedBy: { readonly id: string; readonly username: string };
}
export interface PricePreparationEvent {
  readonly id: string;
  readonly kind: 'price_changed' | 'price_restored' | 'reason_changed' | 'discount_changed' | 'authorization_simulated' | 'freight_changed';
  readonly itemId: string | null;
  readonly productName: string | null;
  readonly productSnapshot: ProductPricingSnapshot | null;
  readonly quantity: number | null;
  readonly actorId: string;
  readonly actorUsername: string;
  readonly recordedAt: string;
  readonly originalUnitPriceCents: number | null;
  readonly previousUnitPriceCents: number | null;
  readonly practicedUnitPriceCents: number | null;
  readonly additionalDiscountCents: number;
  readonly netLineCents: number | null;
  readonly reason: string;
  readonly authorizationRequired: boolean;
  readonly revision: string;
  readonly reviewedDraft?: PriceDraftReview;
  readonly freightSnapshot?: SaleFreightSnapshot;
}
