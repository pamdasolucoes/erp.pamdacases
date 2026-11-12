import type { SaleDetails } from '../types/pendingSales';
import type { ReceiptDocumentData } from '../types/receipt';
import { dbCents, preparationFromSale, saleCustomerName, saleCustomerCode, snapshotText } from './pendingSaleMapping';
import { calculateSalePricing } from './salePricing';

export function pendingReceiptDocument(details: SaleDetails): ReceiptDocumentData {
  const { sale } = details;
  if (sale.status !== 'draft') throw new Error('Esta venda não está pendente. Atualize a consulta.');
  if (!sale.shipping_confirmed || sale.shipping_charged === null) throw new Error('Informe o frete do pedido, inclusive zero, antes de imprimir o recibo.');
  const draft = preparationFromSale(sale.created_by, details);
  const calculation = calculateSalePricing(draft.pricing.items, draft.pricing.discount);
  if (!calculation.lines.length || !calculation.totals || calculation.errors.length) throw new Error('Revise os produtos e valores do pedido antes de imprimir o recibo.');
  const customer = sale.customer_snapshot, branch = sale.branch_snapshot;
  const text = (key: string) => snapshotText(branch, key);
  return {
    kind: 'preview', receiptNumber: sale.order_number === null ? null : String(sale.order_number), generatedAt: new Date().toISOString(),
    company: { name: 'PAMDA CASES', cnpj: null, phone: null },
    customerName: saleCustomerName(sale), customerCode: saleCustomerCode(sale) || null,
    customerContact: text('phone') || snapshotText(customer, 'phone') || null,
    branchName: null, address: [text('address'), text('number'), text('complement'), text('neighborhood'), text('city'), text('state'), text('zip_code') || text('zipCode')].filter(Boolean).join(', ') || null,
    addressNeedsReview: branch.addressNeedsReview === true, salespersonName: sale.seller_snapshot, condition: '',
    items: calculation.lines.map(line => ({ id: line.item.id, code: line.item.snapshot.productCode, sku: line.item.snapshot.productSku,
      name: line.item.snapshot.productName, description: null, quantity: line.quantity, unitPriceCents: line.unitPriceCents,
      subtotalCents: line.grossCents, discountCents: line.additionalDiscountCents, netCents: line.netCents, customization: line.item.customization || null })),
    subtotalCents: dbCents(sale.subtotal), discountCents: dbCents(sale.discount_amount), freightCents: dbCents(sale.shipping_charged), totalCents: dbCents(sale.total),
    notes: sale.notes || '', freightReason: '', payment: null,
  };
}
