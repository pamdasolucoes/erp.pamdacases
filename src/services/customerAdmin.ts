import type { SupabaseClient } from '@supabase/supabase-js';
import type { OfficialCustomer, OfficialCustomerBranch } from '../types/pamdaCore';
import { CoreService, UnconfirmedWriteError } from './core';
import { CustomersService } from './customers';
import { isUuid } from './customerEdits';

export interface BranchRegistration {
  name: string; address: string; number: string; neighborhood: string;
  city: string; state: string; zipCode: string; phone: string;
}
export interface CustomerRegistration extends BranchRegistration { customerCode: string }
const fields = (input: BranchRegistration) => {
  if (!input.name.trim()) throw new Error('Informe o nome.');
  return { p_nome: input.name, p_endereco: input.address, p_numero: input.number,
    p_bairro: input.neighborhood, p_cidade: input.city, p_estado: input.state,
    p_cep: input.zipCode, p_telefone: input.phone };
};
const uncertain = () => new UnconfirmedWriteError('Não foi possível confirmar o cadastro gravado. Atualize a lista e confira o servidor antes de repetir a operação.');

export class CustomerAdminService {
  private core: CoreService;
  private customers: CustomersService;
  constructor(client: SupabaseClient | null) { this.core = new CoreService(client); this.customers = new CustomersService(client); }
  private async read(id: string, code: string): Promise<OfficialCustomer> {
    try {
      const row = await this.customers.get(id);
      if (row.customerCode !== code) throw uncertain();
      return row;
    } catch { throw uncertain(); }
  }
  async createCustomer(userId: string, input: CustomerRegistration): Promise<OfficialCustomer> {
    if (!input.customerCode.trim()) throw new Error('Informe o código comercial, preservando seu texto exato.');
    const result = await this.core.rpc(userId, 'pamda_admin_cadastrar_cliente_com_matriz', { p_codigo: input.customerCode, ...fields(input) }, true);
    const row = Array.isArray(result) && result.length === 1 ? result[0] : null;
    if (!row || !isUuid(row.cliente_id) || !isUuid(row.matriz_id)) throw uncertain();
    const customer = await this.read(row.cliente_id, input.customerCode);
    if (!customer.branches.some(branch => branch.id === row.matriz_id && branch.customerId === customer.id && branch.isPrimary)) throw uncertain();
    return customer;
  }
  async createBranch(userId: string, customer: OfficialCustomer, input: BranchRegistration): Promise<OfficialCustomer> {
    const id = await this.core.rpc(userId, 'pamda_admin_cadastrar_filial', { p_cliente_id: customer.id, ...fields(input) }, true);
    if (typeof id !== 'string' || !isUuid(id)) throw uncertain();
    const updated = await this.read(customer.id, customer.customerCode);
    if (!updated.branches.some(branch => branch.id === id && branch.customerId === customer.id)) throw uncertain();
    return updated;
  }
  async updateBranch(userId: string, customer: OfficialCustomer, branch: OfficialCustomerBranch, input: BranchRegistration): Promise<OfficialCustomer> {
    if (branch.customerId !== customer.id) throw new Error('A unidade não pertence ao cliente.');
    const current = await this.customers.get(customer.id);
    if (current.branches.find(row => row.id === branch.id)?.updatedAt !== branch.updatedAt) throw new Error('A unidade foi alterada. Atualize a lista antes de editar.');
    // This administrative RPC has no CAS parameter; the full customer editor retains the atomic versioned flow.
    await this.core.rpc(userId, 'pamda_admin_atualizar_filial', { p_filial_id: branch.id, ...fields(input) }, true);
    const updated = await this.read(customer.id, customer.customerCode);
    const saved = updated.branches.find(row => row.id === branch.id);
    const keys: (keyof BranchRegistration)[] = ['name', 'address', 'number', 'neighborhood', 'city', 'state', 'zipCode', 'phone'];
    if (!saved || keys.some(key => (saved[key] ?? '') !== input[key])) throw uncertain();
    return updated;
  }
  async setPrimary(userId: string, customer: OfficialCustomer, branchId: string): Promise<OfficialCustomer> {
    if (!customer.branches.some(row => row.id === branchId && row.active)) throw new Error('Selecione uma unidade ativa deste cliente.');
    await this.core.rpc(userId, 'pamda_admin_definir_matriz', { p_branch_id: branchId }, true);
    const updated = await this.read(customer.id, customer.customerCode);
    const primary = updated.branches.filter(row => row.isPrimary && row.active);
    if (primary.length !== 1 || primary[0].id !== branchId) throw uncertain();
    return updated;
  }
}
