export interface PaymentMethod { id: string; code: string; name: string; active: boolean }
export interface PaymentTerm extends PaymentMethod { dueDays: number | null; installments: number | null; notes: string | null }
export interface PaymentCatalog { methods: readonly PaymentMethod[]; terms: readonly PaymentTerm[] }
export interface PaymentSettings { methodId: string | null; termId: string | null; creditLimitCents: number | null; notes: string | null }
