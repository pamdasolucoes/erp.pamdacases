import type { CustomerRow, CustomerBranchRow } from '../../src/types/pamdaCore';
import { customerRow, branchRow, uuid } from './customerRows';

// Synthetic contracts only. No Supabase connection or production writes.
export class CoreAdminBackend {
  methods = [{ id: uuid(7101), code: 'pix', name: 'PIX verificado', active: true, created_at: '2026-10-19T00:00:00Z' }, { id: uuid(7102), code: 'legado', name: 'Forma inativa', active: false, created_at: '2026-10-19T00:00:00Z' }];
  terms = [{ id: uuid(7201), code: 'a_vista', name: 'À vista verificado', due_days: 0, installments: 1, notes: null as string | null, active: true, created_at: '2026-10-19T00:00:00Z' }];
  customerSettings: Record<string, any> = {};
  branchSettings: Record<string, any> = {};
  writes: { name: string; args: any }[] = [];
  failure = '';
  private next = 10000;
  constructor(public customers: CustomerRow[], public branches: CustomerBranchRow[], private isAdmin: () => boolean = () => true) {}
  handle(path: string, url: URL, body: any): { body: any; status?: number; headers?: Record<string, string>; abort?: boolean } | null {
    const table = path.split('/').pop()!;
    const tables: Record<string, any[]> = { erp_payment_methods: this.methods, erp_payment_terms: this.terms,
      erp_customer_payment_settings: Object.values(this.customerSettings), erp_branch_payment_settings: Object.values(this.branchSettings) };
    if (table in tables) {
      if (this.failure === 'read') return { body: { code: '42501', message: 'Leitura negada' }, status: 403 };
      let rows = tables[table];
      for (const key of ['customer_id', 'branch_id']) if (url.searchParams.has(key)) rows = rows.filter(row => row[key] === url.searchParams.get(key)!.slice(3));
      const count = rows.length, from = Number(url.searchParams.get('offset') || 0), limit = Math.min(2, Number(url.searchParams.get('limit') || 100));
      return { body: rows.slice(from, from + limit), headers: { 'content-range': `${from}-${Math.min(from + limit, count) - 1}/${count}` } };
    }
    const names = ['pamda_admin_cadastrar_cliente_com_matriz', 'pamda_admin_cadastrar_filial', 'pamda_admin_atualizar_filial', 'pamda_admin_definir_matriz', 'pamda_admin_configurar_pagamento_cliente', 'pamda_admin_configurar_pagamento_filial', 'pamda_admin_salvar_forma_pagamento', 'pamda_admin_salvar_prazo_pagamento'];
    if (!names.includes(table)) return null;
    this.writes.push({ name: table, args: body });
    if (!this.isAdmin()) return { body: { code: '42501', message: 'Sem permissão administrativa' }, status: 403 };
    let result: unknown = null;
    const setBranch = (branch: CustomerBranchRow) => Object.assign(branch, { name: body.p_nome, address: body.p_endereco, number: body.p_numero, neighborhood: body.p_bairro, city: body.p_cidade, state: body.p_estado, zip_code: body.p_cep, phone: body.p_telefone, updated_at: new Date().toISOString() });
    if (table === 'pamda_admin_cadastrar_cliente_com_matriz') {
      if (this.customers.some(row => row.customer_code === body.p_codigo)) return { body: { code: '23505' }, status: 409 };
      const customer = customerRow(++this.next, { customer_code: body.p_codigo, name: body.p_nome });
      const branch = setBranch(branchRow(++this.next, { customer_id: customer.id, is_primary: true, import_source_customer_code: null }));
      this.customers.push(customer); this.branches.push(branch); result = [{ cliente_id: customer.id, matriz_id: branch.id }];
    } else if (table === 'pamda_admin_cadastrar_filial') {
      const branch = setBranch(branchRow(++this.next, { customer_id: body.p_cliente_id, is_primary: false, import_source_customer_code: null }));
      this.branches.push(branch); result = branch.id;
    } else if (table === 'pamda_admin_atualizar_filial') setBranch(this.branches.find(row => row.id === body.p_filial_id)!);
    else if (table === 'pamda_admin_definir_matriz') {
      const branch = this.branches.find(row => row.id === body.p_branch_id)!;
      for (const row of this.branches.filter(row => row.customer_id === branch.customer_id)) row.is_primary = row.id === branch.id;
    } else if (table.includes('configurar_pagamento')) {
      const customer = table.endsWith('_cliente'), key = customer ? body.p_customer_id : body.p_branch_id;
      (customer ? this.customerSettings : this.branchSettings)[key] = { [customer ? 'customer_id' : 'branch_id']: key, default_method_id: body.p_method_id, default_term_id: body.p_term_id, ...(customer ? { credit_limit: body.p_credit_limit } : {}), notes: body.p_notes, updated_at: new Date().toISOString() };
    } else {
      const term = table.includes('prazo'), rows = term ? this.terms : this.methods;
      let row: any = rows.find(row => row.code === body.p_code);
      if (!row) { row = { id: uuid(++this.next), code: body.p_code, created_at: new Date().toISOString() }; rows.push(row); }
      Object.assign(row, { name: body.p_name, active: body.p_active }, term ? { due_days: body.p_due_days, installments: body.p_installments, notes: body.p_notes } : {}); result = row.id;
    }
    if (this.failure === 'lost') return { body: null, abort: true };
    if (this.failure === 'malformed') result = {};
    return { body: result };
  }
}
