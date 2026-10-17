// Capacidade explicita: a tabela atual ainda nao possui contrato de frete padrao.
export type CustomerFreightSetting =
  | { readonly status: 'integration_pending' }
  | { readonly status: 'available'; readonly amountCents: number | null };

export interface SaleFreightSnapshot {
  readonly customerId: string | null;
  readonly defaultFreight: CustomerFreightSetting;
  readonly chargedCents: number | null;
  readonly source: 'customer_default' | 'manual' | 'not_set';
  readonly reason: string;
  readonly realDeliveryCostCents: null; // Nao inferir custo da Pamda a partir do frete cobrado.
}
