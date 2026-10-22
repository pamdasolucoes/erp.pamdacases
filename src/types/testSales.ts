export type TestPaymentStatus='pending'|'scheduled'|'paid';
export type TestPaymentChannel='erp'|'site';
export interface TestPaymentInput {
  method_code:string;
  amount:number;
  status:TestPaymentStatus;
  channel:TestPaymentChannel;
  scheduled_for?:string;
}
export interface TestPaymentDraft {
  methodCode:string;
  amount:string;
  status:TestPaymentStatus;
  channel:TestPaymentChannel;
  scheduledFor:string;
}
export interface TestPaymentRecord {
  id:string;
  saleId:string;
  methodCode:string;
  amountCents:number;
  status:TestPaymentStatus;
  channel:TestPaymentChannel;
  scheduledFor:string|null;
  reference:string|null;
}
export interface TestReceiptRecord {
  receiptNumber:number;
  saleId:string;
  receiptSnapshot:Record<string,unknown>;
  issuedAt:string;
}
