export interface CustomerCommercialContext {
  customerId: string;
  branchId: string;
  isPrimary: boolean | null;
  customerShippingCents: number | null;
  branchShippingCents: number | null;
  effectiveShippingCents: number | null;
  freightSource: string | null;
  paymentMethodId: string | null;
  paymentTermId: string | null;
  creditLimitCents: number | null;
  billingMode: string | null;
}

export interface ErpSummary {
  financialAuthorized: boolean;
  asOf: string;
  pending_sales: number | null;
  pending_with_product_history: number | null;
  pending_never_with_product: number | null;
  confirmed_sales: number | null;
  cancelled_sales: number | null;
  official_receipts: number | null;
  catalog_active: number | null;
  physical_items: number | null;
  physical_stock_verified: number | null;
  production_queue_count: number | null;
  confirmed_revenue_today: number | null;
  confirmed_revenue_month: number | null;
  receivables_balance: number | null;
}
