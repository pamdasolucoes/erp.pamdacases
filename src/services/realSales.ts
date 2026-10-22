import {coreService} from './coreService';
import {dbCents} from './pendingSaleMapping';
import type {SaleDetails} from '../types/pendingSales';
import type {ReceiptDocumentData} from '../types/receipt';
export interface RealPaymentInput{method_code:string;amount:number;status:'pending'|'scheduled'|'paid';channel:'erp';scheduled_for?:string;reference?:string;}
export const realSales={
 async finalize(userId:string,saleId:string,payments:RealPaymentInput[],key:string){await coreService.rpc(userId,'pamda_finalize_sale',{p_sale_id:saleId,p_payments:payments,p_request_key:key},true);},
 async receipt(userId:string,details:SaleDetails):Promise<ReceiptDocumentData>{
  const record=await coreService.rpc(userId,'pamda_real_sale_document',{p_sale_id:details.sale.id}) as any;
  const s=details.sale,c=s.customer_snapshot,b=s.branch_snapshot;
  if(s.status!=='confirmed'||s.is_test!==false||record.receipt_number!==String(s.order_number))throw new Error('Recibo incompatível com a venda confirmada.');
  const company=record.receipt_snapshot.company||{};
  return {kind:'confirmed',receiptNumber:String(s.order_number),generatedAt:record.issued_at,
   company:{name:company.company_name||'PAMDA CASES',cnpj:company.cnpj||null,phone:company.phone||null},
   customerName:String(c.name||''),customerCode:String(c.code||c.customer_code||''),customerContact:String(c.phone||''),
   branchName:String(b.name||''),address:[b.address,b.number,b.complement,b.neighborhood,b.city,b.state,b.zip_code].filter(Boolean).join(', '),addressNeedsReview:false,
   salespersonName:s.seller_snapshot,condition:'Recibo de venda',items:details.items.map(i=>({id:i.id,code:i.product_code_snapshot,sku:i.product_sku_snapshot,name:i.description_snapshot,description:null,quantity:Number(i.quantity),unitPriceCents:dbCents(i.negotiated_unit_price),subtotalCents:dbCents(i.line_subtotal),discountCents:0,netCents:dbCents(i.line_subtotal),customization:i.customization as any})),
   subtotalCents:dbCents(s.subtotal),discountCents:dbCents(s.discount_amount),freightCents:dbCents(s.shipping_charged),totalCents:dbCents(s.total),notes:s.notes||'',freightReason:'',
   payment:{paid:dbCents(record.paid)===dbCents(s.total),amountPaidCents:dbCents(record.paid),balanceCents:dbCents(s.total)-dbCents(record.paid),pixKey:company.pix_key||'',qrCodeUrl:''}};
 }
};
