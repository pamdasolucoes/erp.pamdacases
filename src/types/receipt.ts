export interface ReceiptDocumentData {
  readonly kind: 'preview' | 'demo' | 'confirmed' | 'test_confirmed';
  readonly receiptNumber: string | null;
  readonly generatedAt: string;
  readonly company: { name: string; cnpj: string | null; phone: string | null };
  readonly customerName: string; readonly customerCode: string | null;
  readonly customerContact: string | null;
  readonly branchName: string | null; readonly address: string | null; readonly addressNeedsReview: boolean;
  readonly salespersonName: string; readonly condition: string;
  readonly items: readonly { id: string; code: string; sku: string | null; name: string; description: string | null;
    quantity: number; unitPriceCents: number; subtotalCents: number; discountCents: number; netCents: number;
    customization: { model: string; color: string; walletFaces: '' | '1' | '2'; customerCases?: readonly {model:string;color:string}[] } | null }[];
  readonly subtotalCents: number; readonly discountCents: number; readonly freightCents: number; readonly totalCents: number;
  readonly notes: string; readonly freightReason: string;
  readonly payment: null | { paid: boolean; amountPaidCents: number; balanceCents: number; pixKey: string; qrCodeUrl: string; methods?: readonly {name:string;amountCents:number;status:string}[] };
}
