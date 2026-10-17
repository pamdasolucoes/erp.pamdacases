import type { AppSettings, Sale } from '../types/erp';
import type { ReceiptDocumentData } from '../types/receipt';
const cents = (value: number) => Math.round(value * 100);
// Dados locais existentes continuam identificados como demonstracao.
export function legacyReceiptData(sale: Sale, settings: AppSettings): ReceiptDocumentData {
  return { kind:'demo',receiptNumber:String(sale.receiptNumber),generatedAt:sale.createdAt,
    company:{name:settings.companyName,cnpj:settings.cnpj || null,phone:settings.phone || null},customerName:sale.customerName,customerCode:null,
    customerContact:null,branchName:sale.branchName || null,address:sale.branchAddressSnapshot || null,addressNeedsReview:false,
    salespersonName:sale.salespersonName,condition:sale.paymentPolicySnapshot.policyType.replaceAll('_',' '),
    items:sale.items.map(item=>({id:item.id,code:item.productCode,sku:item.sku || null,name:item.productName,description:item.componentsSnapshot?.map(component=>`${component.quantity} × ${component.componentName}`).join(', ') || null,
      quantity:item.quantity,unitPriceCents:cents(item.unitPrice),subtotalCents:cents(item.subtotal),discountCents:0,netCents:cents(item.subtotal),customization:null})),
    subtotalCents:cents(sale.productsTotal),discountCents:cents(sale.discount),freightCents:cents(sale.shippingFeeCharged),totalCents:cents(sale.totalAmount),notes:sale.notes || '',freightReason:'',
    payment:null,
  };
}
