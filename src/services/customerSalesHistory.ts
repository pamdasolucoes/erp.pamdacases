import type { SupabaseClient } from '@supabase/supabase-js';
import { isUuid } from './customerEdits';
import { readAllPages } from './readPages';

export interface OfficialSaleHistory {
  id: string; customer_id: string; receipt_number: string; sold_at: string;
  branch_name: string | null; total_amount: number;
  payment_status: string; production_status: string; delivery_status: string;
  items: { product_name: string; quantity: number; unit_price: number }[];
}
export type HistoryResult = { integrated: false } | { integrated: true; sales: OfficialSaleHistory[] };
const missing = (code?: string) => ['PGRST205', 'PGRST202', '42P01', '42883'].includes(code || '');

function validateSale(row: OfficialSaleHistory, customerId: string) {
  if (!row || !isUuid(row.id) || row.customer_id !== customerId || typeof row.receipt_number !== 'string' ||
      !row.receipt_number || !Number.isFinite(Date.parse(row.sold_at)) ||
      (row.branch_name !== null && typeof row.branch_name !== 'string') ||
      !Number.isFinite(row.total_amount) || row.total_amount < 0 ||
      ![row.payment_status, row.production_status, row.delivery_status].every(value => typeof value === 'string' && value.length > 0) ||
      !Array.isArray(row.items) || !row.items.every(item => item && typeof item.product_name === 'string' &&
        Number.isFinite(item.quantity) && item.quantity > 0 && Number.isFinite(item.unit_price) && item.unit_price >= 0)) {
    throw new Error('O servidor retornou um histórico incompatível. Solicite a revisão da integração.');
  }
}

// Só aceita um contrato oficial versionado. A existência de uma tabela sales, isoladamente,
// não comprova que recibos, itens e permissões já estejam integrados.
export class CustomerSalesHistoryService {
  constructor(private client: SupabaseClient | null) {}
  async list(customerId: string, signal?: AbortSignal): Promise<HistoryResult> {
    if (!isUuid(customerId)) throw new Error('Cliente inválido. Retorne ao cadastro.');
    if (!this.client) throw new Error('Configure a conexão com o Supabase PAMDA CORE.');
    signal?.throwIfAborted();
    const identity = await this.client.auth.getUser();
    if (identity.error || !identity.data.user) throw new Error('Sessão inválida. Entre novamente.');
    let probe = this.client.from('sales').select('id').limit(0);
    if (signal) probe = probe.abortSignal(signal);
    const { error } = await probe;
    if (missing(error?.code)) return { integrated: false };
    if (error) throw new Error('Não foi possível consultar o histórico. Confira a conexão e sua permissão de acesso.');
    let unavailable = false;
    const sales = await readAllPages<OfficialSaleHistory>(async (from, to) => {
      let request = this.client!.rpc('pamda_customer_sales_history', { p_customer_id: customerId, p_offset: from, p_limit: to - from + 1 });
      if (signal) request = request.abortSignal(signal);
      const { data, error: rpcError } = await request;
      if (missing(rpcError?.code)) { unavailable = true; return { rows: [], total: 0 }; }
      if (rpcError) throw new Error('Não foi possível consultar o histórico. Confira a conexão e sua permissão de acesso.');
      if (data?.contract_version !== 1 || data.customer_id !== customerId || !Array.isArray(data.rows) || !Number.isSafeInteger(data.total) || data.total < 0) {
        throw new Error('O servidor retornou um histórico incompatível. Solicite a revisão da integração.');
      }
      data.rows.forEach((row: OfficialSaleHistory) => validateSale(row, customerId));
      return { rows: data.rows as OfficialSaleHistory[], total: data.total as number };
    }, 100, signal);
    if (new Set(sales.map(sale => sale.id)).size !== sales.length) throw new Error('O histórico retornou vendas repetidas. Atualize a consulta.');
    return unavailable ? { integrated: false } : { integrated: true, sales };
  }
}
