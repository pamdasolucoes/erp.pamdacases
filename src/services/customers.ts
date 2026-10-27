import type { SupabaseClient } from '@supabase/supabase-js';
import type { CustomerRow, CustomerBranchRow, OfficialCustomer, CustomerUpdate } from '../types/pamdaCore';
import { toCustomerUpdateRpc } from './customerEdits';
import { readAllPages } from './readPages';
import { mapCustomerCatalog } from './customerMapping';
import { isUuid } from './customerEdits';
import { customerCatalogChanged } from './catalogEvents';

export const CUSTOMER_COLUMNS = 'id,customer_code,name,company_name,cnpj,cpf,cpf_cnpj_original,state_registration,legacy_person_type,phone,mobile_phone,whatsapp_phone,email,contact_name,reference_name,reference_phone,legacy_registered_on,legacy_last_purchase_on,legacy_registered_raw,legacy_last_purchase_raw,notes,active,is_chain,customer_kind,billing_mode,default_shipping_fee,created_at,updated_at';
export const BRANCH_COLUMNS = 'id,customer_id,name,trade_name,address,number,complement,neighborhood,city,state,zip_code,phone,contact_name,notes,active,address_needs_review,import_source_customer_code,created_at,updated_at,shipping_fee_override,is_primary';

export class CustomersService {
  constructor(private client: SupabaseClient | null) {}

  public async get(id: string, expectedUserId?: string): Promise<OfficialCustomer> {
    if (!isUuid(id) || !this.client) throw new Error('Selecione um cadastro válido e configure o Supabase.');
    const identity = await this.client.auth.getUser();
    if (identity.error || !identity.data.user || expectedUserId && identity.data.user.id !== expectedUserId) throw new Error('Sessão inválida. Entre novamente.');
    // Always bypass the cache for write confirmation; only reread this customer and its real units.
    const [result, branches] = await Promise.all([
      this.client.from('customers').select(CUSTOMER_COLUMNS).eq('id', id).maybeSingle(),
      readAllPages<CustomerBranchRow>(async (from, to) => {
        const { data, error, count } = await this.client!.from('customer_branches').select(BRANCH_COLUMNS, { count: 'exact' }).eq('customer_id', id).order('id').range(from, to);
        if (error || !data || count === null) throw new Error('Não foi possível confirmar as unidades deste cliente. Confira sua permissão.');
        return { rows: data as unknown as CustomerBranchRow[], total: count };
      }),
    ]);
    const row = result.data as unknown as CustomerRow | null;
    if (result.error || row?.id !== id || branches.some(branch => branch.customer_id !== id)) throw new Error('Cadastro não retornado pelo servidor. Atualize a lista e confira sua permissão.');
    return mapCustomerCatalog([row], branches)[0];
  }

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
    if (!data?.customer || !Array.isArray(data.branches) || data.customer.id !== update.id ||
        update.expectedCustomerCode !== undefined && data.customer.customer_code !== update.expectedCustomerCode ||
        !Number.isFinite(Date.parse(data.customer.updated_at)) ||
        data.branches.some((branch: CustomerBranchRow) => branch.customer_id !== update.id) ||
        update.branches.some(edit => !data.branches.some((branch: CustomerBranchRow) => branch.id === edit.id && Number.isFinite(Date.parse(branch.updated_at))))) {
      throw new Error('O servidor não confirmou o cadastro esperado e suas unidades. Atualize a lista.');
    }
    const updated = mapCustomerCatalog([data.customer as CustomerRow], data.branches as CustomerBranchRow[])[0];
    customerCatalogChanged({ client: this.client, userId: identity.data.user.id, customer: updated });
    return updated;
  }

  public async list(signal?: AbortSignal, expectedUserId?: string): Promise<OfficialCustomer[]> {
    if (!this.client) throw new Error('Configure a conexão com o Supabase PAMDA CORE.');
    signal?.throwIfAborted();
    const identity = await this.client.auth.getUser();
    if (identity.error || !identity.data.user || expectedUserId && identity.data.user.id !== expectedUserId) throw new Error('Sessão inválida. Entre novamente.');
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
    }, 500, signal, 3);
    // O JWT da sessão Auth é autorizado exclusivamente pelas políticas RLS.
    const [customers, branches] = await Promise.all([
      load<CustomerRow>('customers', CUSTOMER_COLUMNS),
      load<CustomerBranchRow>('customer_branches', BRANCH_COLUMNS),
    ]);
    signal?.throwIfAborted();
    return mapCustomerCatalog(customers, branches);
  }
}
