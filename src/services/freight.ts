import type { CustomerFreightSetting, SaleFreightSnapshot } from '../types/freight';
import { centsInput, formatMoney, parsePriceInput } from './salePricing';

export const pendingCustomerFreight: CustomerFreightSetting = Object.freeze({ status: 'integration_pending' });
export function customerFreightLabel(setting: CustomerFreightSetting): string {
  if (setting.status === 'integration_pending') return 'Pendente de integração';
  return setting.amountCents === null ? 'Não configurado' : formatMoney(setting.amountCents);
}
export function initialSaleFreight(setting: CustomerFreightSetting): string {
  return setting.status === 'available' && setting.amountCents !== null ? centsInput(setting.amountCents) : '';
}
export function captureSaleFreight(customerId: string | null, setting: CustomerFreightSetting, input: string, reason: string, manual: boolean): SaleFreightSnapshot {
  return { customerId, defaultFreight: { ...setting }, chargedCents: input.trim()?parsePriceInput(input):0,
    source: manual ? 'manual' : setting.status === 'available' && setting.amountCents !== null ? setting.source || 'customer_default' : 'not_set',
    reason: reason.trim(), realDeliveryCostCents: null };
}
export function saleTotalWithFreight(itemsNetCents: number | null, freightInput: string): { totalCents: number | null; error: string | null } {
  const freight = freightInput.trim()?parsePriceInput(freightInput):0;
  if (freight === null) return { totalCents: null, error: freightInput.trim() ? 'Informe um frete válido, sem valor negativo e com até duas casas decimais.' : 'Informe o frete cobrado, inclusive R$ 0,00 quando for gratuito.' };
  if (itemsNetCents === null) return { totalCents: null, error: null };
  const total = itemsNetCents + freight;
  return Number.isSafeInteger(total) ? { totalCents: total, error: null } : { totalCents: null, error: 'O total excede a precisão monetária suportada.' };
}
