import type { OfficialCustomer, OfficialCustomerBranch } from '../types/pamdaCore';
import type { PricingDraftItem } from '../types/salePricing';
import type { SaleFreightSnapshot } from '../types/freight';
import type { User } from '../types/erp';
import type { ReceiptDocumentData } from '../types/receipt';
import { calculateSalePricing } from './salePricing';

export function createReceiptPreview(input: {
  customer: OfficialCustomer | null; branch: OfficialCustomerBranch | null;
  items: readonly PricingDraftItem[]; discount: string; freight: SaleFreightSnapshot;
  notes: string; seller: User | null; generatedAt: string; paymentCondition?: string;
}): ReceiptDocumentData {
  const { customer, branch, seller } = input;
  if (!customer) throw new Error('Selecione o cliente para visualizar a prévia.');
  if (customer.branches.length && !branch) throw new Error('Selecione a unidade/filial para visualizar a prévia.');
  if (branch && (branch.customerId !== customer.id || !customer.branches.some(unit => unit.id === branch.id))) throw new Error('A filial não corresponde ao cliente selecionado.');
  if (!seller?.active) throw new Error('Valide sua sessão antes de visualizar a prévia.');
  const calculation = calculateSalePricing(input.items, input.discount);
  if (!calculation.lines.length || !calculation.totals || calculation.errors.length) throw new Error('Adicione itens e corrija os preços, quantidades e descontos antes da prévia.');
  const freight = input.freight.chargedCents;
  if (input.freight.customerId !== customer.id || freight === null || !Number.isSafeInteger(freight) || freight < 0) throw new Error('Informe um frete válido para o cliente atual, inclusive zero.');
  const total = calculation.totals.netCents + freight;
  if (!Number.isSafeInteger(total)) throw new Error('O valor total excede a precisão suportada.');
  if (!Number.isFinite(Date.parse(input.generatedAt))) throw new Error('Data da prévia inválida.');
  const phone = branch?.phone || customer.phone;
  const address = branch ? [
    [branch.address, branch.number, branch.complement].filter(Boolean).join(', '),
    [
      branch.neighborhood,
      [branch.city, branch.state].filter(Boolean).join('/'),
    ].filter(Boolean).join(' - '),
  ].filter(Boolean).join('\n') || null : null;
  const customerContact = [
    branch?.zipCode ? `CEP ${branch.zipCode}` : null,
    phone ? `Contato: ${phone}` : null,
  ].filter(Boolean).join(' | ') || null;
  return structuredClone({ kind: 'preview', receiptNumber: null, generatedAt: input.generatedAt,
    company: { name: 'PAMDA CASES', cnpj: null, phone: null },
    customerName: customer.name, customerCode: customer.customerCode,
    customerContact,
    branchName: null,
    address,
    addressNeedsReview: branch?.addressNeedsReview || false, salespersonName: seller.name || seller.username,
    condition: input.paymentCondition || 'Condição de pagamento não configurada',
    items: calculation.lines.map(line => ({ id: line.item.id, code: line.item.snapshot.productCode, sku: line.item.snapshot.productSku,
      name: line.item.snapshot.productName, description: line.item.snapshot.productDescription, quantity: line.quantity,
      unitPriceCents: line.unitPriceCents, subtotalCents: line.grossCents, discountCents: line.additionalDiscountCents, netCents: line.netCents,
      customization: line.item.customization || null })),
    subtotalCents: calculation.totals.negotiatedCents, discountCents: calculation.totals.additionalDiscountCents,
    freightCents: freight, totalCents: total, notes: input.notes, freightReason: input.freight.reason, payment: null,
  });
}
