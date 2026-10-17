import type { SupabaseClient } from '@supabase/supabase-js';
import type { CustomerRow, CustomerBranchRow, OfficialCustomer, CustomerUpdate } from '../types/pamdaCore';
import { toCustomerUpdateRpc } from './customerEdits';
import { readAllPages } from './readPages';
import { mapCustomerCatalog } from './customerMapping';

export const CUSTOMER_COLUMNS = 'id,customer_code,name,company_name,cnpj,cpf,cpf_cnpj_original,state_registration,legacy_person_type,phone,mobile_phone,whatsapp_phone,email,contact_name,reference_name,reference_phone,legacy_registered_on,legacy_last_purchase_on,legacy_registered_raw,legacy_last_purchase_raw,notes,active,is_chain,customer_kind,billing_mode,created_at,updated_at';
export const BRANCH_COLUMNS = 'id,customer_id,name,trade_name,address,number,complement,neighborhood,city,state,zip_code,phone,contact_name,notes,active,address_needs_review,import_source_customer_code,created_at,updated_at';

export class CustomersService {
  constructor(private client: SupabaseClient | null,private options:{branchPrimaryEnabled?:boolean}={}) {}

  public async update(update: CustomerUpdate): Promise<OfficialCustomer> {
    const payload = toCustomerUpdateRpc(update);
    if (!this.client) throw new Error('Configure a conexão com o Supabase PAMDA CORE.');
    const identity = await this.client.auth.getUser();
    if (identity.error || !identity.data.user) throw new Error('Sessão inválida. Entre novamente.');
    const { data, error } = await this.client.rpc('pamda_update_customer', payload);
    if (error?.code === 'PGRST202') throw new Error('A edição de clientes ainda não está configurada no servidor. Solicite a ativação ao administrador.');
    if (error?.code === '42501') throw new Error('Você não tem permissão para editar este cadastro.');
    if (error?.code === '40001') throw new Error('O cadastro foi alterado por outra pessoa. Atualize a lista antes de editar novamente.');
    if (error) throw new Error('Não foi possível confirmar a alteração no Supabase. Confira a conexão e atualize o cadastro antes de tentar novamente.');
    if (!data?.customer || !Array.isArray(data.branches) || data.customer.id !== update.id) throw new Error('O servidor não confirmou o cadastro esperado. Atualize a lista.');
    return mapCustomerCatalog([data.customer as CustomerRow], data.branches as CustomerBranchRow[])[0];
  }

  public async list(signal?: AbortSignal): Promise<OfficialCustomer[]> {
    if (!this.client) throw new Error('Configure a conexão com o Supabase PAMDA CORE.');
    signal?.throwIfAborted();
    const identity = await this.client.auth.getUser();
    if (identity.error || !identity.data.user) throw new Error('Sessão inválida. Entre novamente.');
    const load = async <T,>(table: 'customers' | 'customer_branches', columns: string): Promise<T[]> => readAllPages<T>(async (from, to) => {
      let request = this.client!.from(table).select(columns, { count: 'exact' }).order('id', { ascending: true }).range(from, to);
      if (signal) request = request.abortSignal(signal);
      const { data, error, count } = await request;
      if (error?.code === '42501') {
        throw new Error(`A política RLS bloqueou a leitura de ${table}. Confira o GRANT SELECT para authenticated e uma política SELECT que autorize usuários ativos de erp_user_profiles (user_id = auth.uid(), role = 'admin_gerencial'); não desative o RLS.`);
      }
      if (error) throw new Error(`Não foi possível consultar ${table}. Confira a conexão e as permissões no Supabase.`);
      if (!data || count === null) throw new Error('Resposta incompleta do servidor. Tente atualizar a lista.');
      return { rows: data as unknown as T[], total: count };
    }, 100, signal);
    // O JWT da sessão Auth é autorizado exclusivamente pelas políticas RLS.
    const [customers, branches] = await Promise.all([
      load<CustomerRow>('customers', CUSTOMER_COLUMNS),
      load<CustomerBranchRow>('customer_branches', BRANCH_COLUMNS + (this.options.branchPrimaryEnabled ? ',is_primary' : '')),
    ]);
    signal?.throwIfAborted();
    return mapCustomerCatalog(customers, branches);
  }
}
