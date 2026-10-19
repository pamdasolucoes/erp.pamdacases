import type { SupabaseClient } from '@supabase/supabase-js';
import type { CustomerCommercialContext, ErpSummary } from '../types/core';
import { isUuid } from './customerEdits';
import { dbCents } from './pendingSaleMapping';
import { saleError } from './pendingSales';

const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Resposta incompatível do PAMDA CORE.');
  return value as Record<string, unknown>;
};
const optionalCents = (value: unknown) => value === null || value === undefined ? null : dbCents(value);
const optionalId = (value: unknown) => {
  if (value === null) return null;
  if (typeof value !== 'string' || !isUuid(value)) throw new Error('Condição comercial incompatível no servidor.');
  return value;
};

export function mapCommercialContext(value: unknown, customerId: string, branchId: string): CustomerCommercialContext {
  const row = record(value);
  if (row.customer_id !== customerId || row.branch_id !== branchId ||
      !(row.is_primary === null || typeof row.is_primary === 'boolean')) {
    throw new Error('O servidor retornou contexto de outro cliente ou unidade. Atualize a consulta.');
  }
  return {
    customerId, branchId, isPrimary: row.is_primary,
    customerShippingCents: optionalCents(row.customer_default_shipping_fee),
    branchShippingCents: optionalCents(row.branch_shipping_fee_override),
    effectiveShippingCents: optionalCents(row.effective_shipping_fee),
    freightSource: typeof row.freight_source === 'string' ? row.freight_source : null,
    paymentMethodId: optionalId(row.payment_method_id), paymentTermId: optionalId(row.payment_term_id),
    creditLimitCents: optionalCents(row.credit_limit),
    billingMode: typeof row.billing_mode === 'string' ? row.billing_mode : null,
  };
}

export function mapErpSummary(value: unknown, canViewFinancials: boolean): ErpSummary {
  const row = record(value);
  if (typeof row.as_of !== 'string' || !Number.isFinite(Date.parse(row.as_of))) throw new Error('Resumo oficial sem data de referência válida.');
  const count = (key: string) => {
    const value = row[key];
    if (value === null || value === undefined) return null;
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Indicador oficial incompatível: ' + key);
    return value;
  };
  return {
    asOf: row.as_of,
    pending_sales: count('pending_sales'), pending_with_product_history: count('pending_with_product_history'),
    pending_never_with_product: count('pending_never_with_product'), confirmed_sales: count('confirmed_sales'),
    cancelled_sales: count('cancelled_sales'), official_receipts: count('official_receipts'),
    catalog_active: count('catalog_active'), physical_items: count('physical_items'),
    physical_stock_verified: count('physical_stock_verified'), production_queue_count: count('production_queue_count'),
    // Do not retain financial values in the view model without the validated profile permission.
    confirmed_revenue_today: canViewFinancials ? optionalCents(row.confirmed_revenue_today) : null,
    confirmed_revenue_month: canViewFinancials ? optionalCents(row.confirmed_revenue_month) : null,
    receivables_balance: canViewFinancials ? optionalCents(row.receivables_balance) : null,
  };
}

export class CoreService {
  constructor(private client: SupabaseClient | null) {}
  async rpc(userId: string, name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.client) throw new Error('Configure o Supabase PAMDA CORE.');
    const identity = await this.client.auth.getUser();
    if (identity.error || identity.data.user?.id !== userId) throw new Error('A sessão mudou. Valide seu acesso.');
    const { data, error } = await this.client.rpc(name, args);
    if (error && ['PGRST202', 'PGRST205', '42P01'].includes(error.code)) throw new Error('Esta integração oficial ainda não está disponível no servidor. Solicite a conferência do contrato.');
    if (error) throw saleError(error);
    return data;
  }
  async hasPermission(userId: string, permission: string): Promise<boolean> {
    const result = await this.rpc(userId, 'pamda_has_permission', { p_permission: permission });
    if (typeof result !== 'boolean') throw new Error('O servidor não confirmou suas permissões.');
    return result;
  }
  async summary(userId: string, canViewFinancials: boolean): Promise<ErpSummary> {
    return mapErpSummary(await this.rpc(userId, 'pamda_resumo_erp'), canViewFinancials);
  }
  async context(userId: string, customerId: string, branchId: string): Promise<CustomerCommercialContext> {
    if (![customerId, branchId].every(isUuid)) throw new Error('Selecione um cliente e uma unidade válidos.');
    return mapCommercialContext(await this.rpc(userId, 'pamda_contexto_comercial_cliente', {
      p_customer_id: customerId, p_branch_id: branchId,
    }), customerId, branchId);
  }
  async saveFreight(userId: string, customerId: string, branchId: string, target: 'customer' | 'branch', cents: number | null, reason: string): Promise<CustomerCommercialContext> {
    if (![customerId, branchId].every(isUuid) || cents !== null && (!Number.isSafeInteger(cents) || cents < 0) || !reason.trim()) {
      throw new Error('Informe um frete válido e o motivo da alteração.');
    }
    await this.rpc(userId, target === 'customer' ? 'pamda_salvar_frete_padrao' : 'pamda_salvar_frete_filial', {
      ...(target === 'customer' ? { p_customer_id: customerId } : { p_branch_id: branchId }),
      p_amount: cents === null ? null : cents / 100, p_reason: reason.trim(),
    });
    // RPC return types were not supplied. Confirm the persisted value using the official read RPC.
    const context = await this.context(userId, customerId, branchId);
    if ((target === 'customer' ? context.customerShippingCents : context.branchShippingCents) !== cents) {
      throw new Error('O servidor não confirmou o frete esperado. Atualize a consulta antes de tentar novamente.');
    }
    return context;
  }
}
