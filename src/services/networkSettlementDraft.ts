// Future reconciliation contract only. No persistence, receipt or payment API.
export interface SettlementAllocation {
  orderId: string; customerId: string; branchId: string; originalDocumentId: string;
  amountCents: number; environment: 'real' | 'test';
}
export interface SettlementDraft {
  payer: { personOrUnitId: string; name: string };
  confirmedReceiptCents: number;
  environment: 'real' | 'test';
  allocations: SettlementAllocation[];
}
export function validateSettlementDraft(draft: SettlementDraft) {
  const cents = (v: number) => Number.isSafeInteger(v) && v >= 0;
  if (!draft.payer.personOrUnitId || !draft.payer.name.trim() || !cents(draft.confirmedReceiptCents)) throw new Error('Recebimento ou pagador inválido.');
  const orders = new Set<string>();
  let total = 0;
  for (const a of draft.allocations) {
    if (!a.orderId || !a.customerId || !a.branchId || !a.originalDocumentId || !cents(a.amountCents) || a.amountCents === 0 || a.environment !== draft.environment || orders.has(a.orderId)) throw new Error('Alocação inválida ou mistura de ambientes.');
    orders.add(a.orderId); total += a.amountCents;
    if (!Number.isSafeInteger(total) || total > draft.confirmedReceiptCents) throw new Error('Alocações superam o recebimento confirmado.');
  }
  return { allocatedCents: total, unallocatedCents: draft.confirmedReceiptCents - total };
}
