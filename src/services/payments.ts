import type { SupabaseClient } from '@supabase/supabase-js';
import type { PaymentCatalog, PaymentMethod, PaymentTerm, PaymentSettings } from '../types/payments';
import { CoreService, UnconfirmedWriteError } from './core';
import { readAllPages } from './readPages';
import { dbCents } from './pendingSaleMapping';
import { isUuid } from './customerEdits';

type Row = Record<string, unknown>;
const id = (value: unknown): string => { if (typeof value !== 'string' || !isUuid(value)) throw new Error('Identificador de pagamento incompatível.'); return value; };
const optionalId = (value: unknown) => value == null ? null : id(value);
const text = (value: unknown): string => { if (typeof value !== 'string') throw new Error('Catálogo de pagamento incompatível.'); return value; };
const integer = (value: unknown): number | null => { if (value === null) return null; if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Prazo de pagamento incompatível.'); return value; };
const method = (row: Row): PaymentMethod => {
  if (typeof row.active !== 'boolean') throw new Error('Status de pagamento incompatível.');
  return { id: id(row.id), code: text(row.code), name: text(row.name), active: row.active };
};
const unconfirmed = () => new UnconfirmedWriteError('Pagamento não confirmado. Atualize as condições e confira o servidor antes de repetir a operação.');

export function paymentCondition(catalog: PaymentCatalog | null, methodId: string | null | undefined, termId: string | null | undefined): string {
  if (!methodId && !termId) return '';
  const method = catalog?.methods.find(row => row.id === methodId), term = catalog?.terms.find(row => row.id === termId);
  if (methodId && !method?.active || termId && !term?.active) return 'Condição salva indisponível';
  return [method?.name, term?.name].filter(Boolean).join(' · ');
}

export class PaymentsService {
  private core: CoreService;
  constructor(private client: SupabaseClient | null) { this.core = new CoreService(client); }
  private async identity(userId: string) {
    if (!this.client) throw new Error('Configure o Supabase PAMDA CORE.');
    const result = await this.client.auth.getUser();
    if (result.error || result.data.user?.id !== userId) throw new Error('A sessão mudou. Valide seu acesso.');
    return this.client;
  }
  async catalog(userId: string, signal?: AbortSignal): Promise<PaymentCatalog> {
    const client = await this.identity(userId);
    const read = (table: string, columns: string) => readAllPages<Row>(async (from, to) => {
      let request = client.from(table).select(columns, { count: 'exact' }).order('id').range(from, to);
      if (signal) request = request.abortSignal(signal);
      const { data, error, count } = await request;
      if (error || !data || count === null) throw new Error('Não foi possível consultar o catálogo de pagamento. Confira suas permissões.');
      return { rows: data as unknown as Row[], total: count };
    }, 100, signal);
    const [methods, terms] = await Promise.all([read('erp_payment_methods', 'id,code,name,active,created_at'), read('erp_payment_terms', 'id,code,name,due_days,installments,notes,active,created_at')]);
    return { methods: methods.map(method), terms: terms.map(row => ({ ...method(row), dueDays: integer(row.due_days), installments: integer(row.installments), notes: row.notes == null ? null : text(row.notes) })) };
  }
  async settings(userId: string, target: 'customer' | 'branch', targetId: string): Promise<PaymentSettings> {
    if (!isUuid(targetId)) throw new Error('Selecione um cadastro válido.');
    const client = await this.identity(userId);
    const { data, error } = await client.from(target === 'customer' ? 'erp_customer_payment_settings' : 'erp_branch_payment_settings')
      .select(target === 'customer' ? 'customer_id,default_method_id,default_term_id,credit_limit,notes,updated_at' : 'branch_id,default_method_id,default_term_id,notes,updated_at')
      .eq(target === 'customer' ? 'customer_id' : 'branch_id', targetId).maybeSingle();
    if (error) throw new Error('Não foi possível consultar a configuração de pagamento. Confira suas permissões.');
    if (!data) return { methodId: null, termId: null, creditLimitCents: null, notes: null };
    const row = data as unknown as Row;
    if (row[target === 'customer' ? 'customer_id' : 'branch_id'] !== targetId) throw new Error('Configuração de outro cadastro retornada pelo servidor.');
    return { methodId: optionalId(row.default_method_id), termId: optionalId(row.default_term_id),
      creditLimitCents: target === 'customer' && row.credit_limit != null ? dbCents(row.credit_limit) : null, notes: row.notes == null ? null : text(row.notes) };
  }
  async saveSettings(userId: string, target: 'customer' | 'branch', targetId: string, settings: PaymentSettings): Promise<PaymentSettings> {
    if (!isUuid(targetId) || settings.methodId !== null && !isUuid(settings.methodId) || settings.termId !== null && !isUuid(settings.termId) ||
      settings.creditLimitCents !== null && (!Number.isSafeInteger(settings.creditLimitCents) || settings.creditLimitCents < 0)) throw new Error('Condição de pagamento inválida.');
    await this.core.rpc(userId, target === 'customer' ? 'pamda_admin_configurar_pagamento_cliente' : 'pamda_admin_configurar_pagamento_filial', {
      ...(target === 'customer' ? { p_customer_id: targetId, p_credit_limit: settings.creditLimitCents === null ? null : settings.creditLimitCents / 100 } : { p_branch_id: targetId }),
      p_method_id: settings.methodId, p_term_id: settings.termId, p_notes: settings.notes,
    }, true);
    try {
      const saved = await this.settings(userId, target, targetId);
      if (saved.methodId !== settings.methodId || saved.termId !== settings.termId || target === 'customer' && saved.creditLimitCents !== settings.creditLimitCents) throw unconfirmed();
      return saved;
    } catch { throw unconfirmed(); }
  }
  async saveMethod(userId: string, input: Omit<PaymentMethod, 'id'>): Promise<PaymentCatalog> {
    if (!input.code.trim() || !input.name.trim()) throw new Error('Informe código e nome.');
    const result = await this.core.rpc(userId, 'pamda_admin_salvar_forma_pagamento', { p_code: input.code, p_name: input.name, p_active: input.active }, true);
    return this.confirmCatalog(userId, result, 'methods', input);
  }
  async saveTerm(userId: string, input: Omit<PaymentTerm, 'id'>): Promise<PaymentCatalog> {
    if (!input.code.trim() || !input.name.trim() || input.dueDays === null || input.installments === null || integer(input.dueDays) === null || integer(input.installments) === null || input.installments < 1) throw new Error('Informe código, nome, dias não negativos e quantidade positiva de parcelas.');
    const result = await this.core.rpc(userId, 'pamda_admin_salvar_prazo_pagamento', { p_code: input.code, p_name: input.name, p_due_days: input.dueDays, p_installments: input.installments, p_notes: input.notes, p_active: input.active }, true);
    return this.confirmCatalog(userId, result, 'terms', input);
  }
  private async confirmCatalog(userId: string, result: unknown, key: 'methods' | 'terms', input: Omit<PaymentTerm, 'id'> | Omit<PaymentMethod, 'id'>): Promise<PaymentCatalog> {
    try {
      const savedId = id(result), catalog = await this.catalog(userId);
      const saved = catalog[key].find(row => row.id === savedId);
      if (!saved || Object.entries(input).some(([key, value]) => saved[key as keyof typeof saved] !== value)) throw unconfirmed();
      return catalog;
    } catch { throw unconfirmed(); }
  }
}
