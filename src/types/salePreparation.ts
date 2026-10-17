import type { PricingDraftItem, PricePreparationEvent } from './salePricing';

export interface PricingPreparation {
  items: PricingDraftItem[];
  discount: string;
  discountReason: string;
  notes: string;
  freight: string;
  freightReason: string;
  manualFreight: boolean;
  events: PricePreparationEvent[];
}
export interface SalePreparation {
  version: 1;
  userId: string;
  customerId: string;
  branchId: string;
  pricing: PricingPreparation;
  paymentMethodId?:string|null;
  paymentTermId?:string|null;
  remote?: {
    draftKey:string; saleId:string|null; initialCustomerId:string; initialBranchId:string;
    savedFingerprint:string|null; status:'draft'|'confirmed'|'cancelled'; sellerName?:string;
  };
}
