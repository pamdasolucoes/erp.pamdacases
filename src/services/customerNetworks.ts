import type { SupabaseClient } from '@supabase/supabase-js';
import { CoreService, UnconfirmedWriteError } from './core';
import { isUuid } from './customerEdits';
import { readAllPages } from './readPages';

export const billingCycles = ['diario', 'semanal', 'mensal', 'flexivel'] as const;
export const collectionModes = ['por_unidade', 'centralizado', 'flexivel'] as const;
export interface BillingPolicy { billing_cycle: string | null; default_collection_mode: string | null; due_days: number | null; notes: string | null }
export interface CustomerNetwork {
  id: string; network_name: string; network_code: string; network_kind: string; headquarters_customer_id: string;
  default_cycle: string; default_collection_mode: string; default_due_days: number | null; notes: string | null;
}
export interface NetworkMember { id: string; network_id: string; customer_id: string; unit_sequence: number; display_code: string; legacy_customer_code: string }
export interface NetworkCatalog { networks: CustomerNetwork[]; members: NetworkMember[] }
export interface NetworkReportUnit {
  customer_id: string; customer_name: string; branch_id: string; branch_name: string;
  legacy_customer_code: string; group_display_code: string; billing_cycle: string; collection_mode: string; due_days: number | null;
  orders_started: number; orders_confirmed_real: number; orders_confirmed_test: number; orders_cancelled: number;
  purchases_real: number | null; purchases_test: number | null; paid_real: null; paid_test: null; payments_integrated: false;
}
export interface NetworkReport { network_id: string; from: string; to: string; financial_authorized: boolean; units: NetworkReportUnit[] }
const id = (value: string) => { if (!isUuid(value)) throw new Error('Selecione um cadastro válido.'); };
export function validatePolicy(policy: BillingPolicy, inherit = false) {
  if (!(inherit && policy.billing_cycle === null) && !billingCycles.includes(policy.billing_cycle as any) ||
      !(inherit && policy.default_collection_mode === null) && !collectionModes.includes(policy.default_collection_mode as any) ||
      policy.due_days !== null && (!Number.isInteger(policy.due_days) || policy.due_days < 0 || policy.due_days > 365)) throw new Error('Preferência de cobrança inválida.');
}
export function validatePeriod(start: string, end: string) {
  const valid = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v;
  if (!valid(start) || !valid(end) || end < start) throw new Error('Informe um período válido.');
  const max = new Date(start); max.setUTCFullYear(max.getUTCFullYear() + 5);
  if (new Date(end) > max) throw new Error('O período máximo é de cinco anos.');
}
export function mapNetworkReport(value: unknown, networkId: string, start: string, end: string, finance: boolean): NetworkReport {
  const r = value as NetworkReport & { payments_integrated: boolean };
  if (!r || r.network_id !== networkId || r.from !== start || r.to !== end || !Array.isArray(r.units) || r.payments_integrated !== false) throw new Error('Contrato de relatório incompatível.');
  const authorized = finance && r.financial_authorized === true;
  const units = r.units.map(u => {
    if (!isUuid(u.customer_id) || !isUuid(u.branch_id)) throw new Error('Unidade inválida no relatório.');
    const amount = (v: number | null) => { if (v !== null && (typeof v !== 'number' || !Number.isFinite(v) || v < 0)) throw new Error('Valor incompatível.'); return v; };
    return { ...u, purchases_real: authorized ? amount(u.purchases_real) : null, purchases_test: authorized ? amount(u.purchases_test) : null,
      paid_real: null, paid_test: null, payments_integrated: false } as NetworkReportUnit;
  });
  return { network_id: networkId, from: start, to: end, financial_authorized: authorized, units };
}
export function filterNetworkUnits(report: NetworkReport, customerId = '', branchId = '') {
  return report.units.filter(u => (!customerId || u.customer_id === customerId) && (!branchId || u.branch_id === branchId));
}
export class CustomerNetworksService {
  private core: CoreService;
  constructor(private client: SupabaseClient | null) { this.core = new CoreService(client); }
  private async identity(userId: string) {
    if (!this.client) throw new Error('Supabase indisponível.');
    const { data, error } = await this.client.auth.getUser();
    if (error || data.user?.id !== userId) throw new Error('A sessão mudou.');
  }
  private async manage(userId: string, admin = false) {
    if (!await this.core.hasPermission(userId, 'customers.manage') || admin && await this.core.rpc(userId, 'pamda_is_admin') !== true) throw new Error('Acesso negado.');
  }
  private async rows<T>(userId: string, table: string, columns: string, key = 'id', target?: string): Promise<T[]> {
    await this.identity(userId);
    return readAllPages<T>(async (from, to) => {
      let q = this.client!.from(table).select(columns, { count: 'exact' }).order(key).range(from, to);
      if (target) q = q.eq(key, target);
      const { data, count, error } = await q;
      if (error || count === null) throw new Error('Não foi possível consultar redes e preferências.');
      return { rows: data as T[], total: count };
    });
  }
  async catalog(userId: string): Promise<NetworkCatalog> {
    const [networks, members] = await Promise.all([
      this.rows<CustomerNetwork>(userId, 'erp_customer_networks', 'id,network_name,network_code,network_kind,headquarters_customer_id,default_cycle,default_collection_mode,default_due_days,notes'),
      this.rows<NetworkMember>(userId, 'erp_customer_network_members', 'id,network_id,customer_id,unit_sequence,display_code,legacy_customer_code'),
    ]);
    return { networks, members };
  }
  async create(userId: string, name: string, code: string, headquarters: string, kind: string) {
    id(headquarters);
    if (!name.trim() || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(code.trim()) || !['rede','franquia','grupo_comercial'].includes(kind)) throw new Error('Nome, código ou tipo da rede inválido.');
    await this.manage(userId, true);
    const result = await this.core.rpc(userId, 'pamda_admin_criar_rede', { p_nome: name.trim(), p_codigo: code.trim(), p_matriz_cliente_id: headquarters, p_tipo: kind }, true);
    if (typeof result !== 'string' || !isUuid(result)) throw new UnconfirmedWriteError('Criação não confirmada. Atualize antes de repetir.');
    const catalog = await this.catalog(userId);
    if (!catalog.networks.some(n => n.id === result && n.headquarters_customer_id === headquarters) || !catalog.members.some(m => m.network_id === result && m.customer_id === headquarters && m.legacy_customer_code !== undefined)) throw new UnconfirmedWriteError('Confira a rede no servidor antes de repetir.');
    return result;
  }
  async link(userId: string, networkId: string, customerIds: string[]) {
    id(networkId); customerIds.forEach(id);
    if (!customerIds.length || new Set(customerIds).size !== customerIds.length) throw new Error('Seleção vazia ou duplicada.');
    await this.manage(userId, true);
    const before = await this.catalog(userId);
    if (customerIds.some(c => before.members.some(m => m.customer_id === c))) throw new Error('Cliente já vinculado a uma rede. Atualize a lista.');
    // Each RPC is atomic; a multi-selection is not one transaction. Never retry the batch.
    for (const customerId of customerIds) {
      try {
        const display = await this.core.rpc(userId, 'pamda_admin_vincular_cliente_rede', { p_rede_id: networkId, p_cliente_id: customerId }, true);
        const saved = await this.catalog(userId);
        if (!saved.members.some(m => m.network_id === networkId && m.customer_id === customerId && m.display_code === display)) throw new Error('Vínculo não confirmado.');
      } catch (error) { throw new Error(`Lote interrompido; vínculos anteriores podem ter sido salvos. Atualize antes de repetir. ${error instanceof Error ? error.message : ''}`); }
    }
  }
  async policy(userId: string, target: 'rede' | 'cliente' | 'filial', targetId: string): Promise<BillingPolicy | null> {
    id(targetId);
    if (target === 'rede') {
      const n = (await this.catalog(userId)).networks.find(n => n.id === targetId);
      return n ? { billing_cycle: n.default_cycle, default_collection_mode: n.default_collection_mode, due_days: n.default_due_days, notes: n.notes } : null;
    }
    return (await this.rows<BillingPolicy>(userId, target === 'cliente' ? 'erp_customer_billing_policies' : 'erp_branch_billing_policies',
      'billing_cycle,default_collection_mode,due_days,notes', target === 'cliente' ? 'customer_id' : 'branch_id', targetId))[0] ?? null;
  }
  async savePolicy(userId: string, target: 'rede' | 'cliente' | 'filial', targetId: string, policy: BillingPolicy) {
    id(targetId); validatePolicy(policy, target === 'filial'); await this.manage(userId, target === 'rede');
    await this.core.rpc(userId, 'pamda_admin_configurar_cobranca_' + target, {
      ['p_' + (target === 'rede' ? 'rede' : target === 'cliente' ? 'cliente' : 'filial') + '_id']: targetId,
      p_ciclo: policy.billing_cycle, p_modo: policy.default_collection_mode, p_dias: policy.due_days, p_observacoes: policy.notes,
    }, true);
    const saved = await this.policy(userId, target, targetId);
    if (!saved || (Object.keys(policy) as (keyof BillingPolicy)[]).some(k => policy[k] !== saved[k])) throw new UnconfirmedWriteError('Preferências não confirmadas. Atualize antes de repetir.');
  }
  async report(userId: string, networkId: string, start: string, end: string) {
    id(networkId); validatePeriod(start, end);
    const finance = await this.core.hasPermission(userId, 'finance.read');
    return mapNetworkReport(await this.core.rpc(userId, 'pamda_relatorio_rede_clientes', { p_rede_id: networkId, p_inicio: start, p_fim: end }), networkId, start, end, finance);
  }
}
