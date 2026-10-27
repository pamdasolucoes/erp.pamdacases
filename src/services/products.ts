import type { SupabaseClient } from '@supabase/supabase-js';
import type { KitComponentRow, OfficialProduct, ProductRow } from '../types/productCatalog';
import { mapProductCatalog } from './productMapping';
import { readAllPages } from './readPages';

export const PRODUCT_COLUMNS = 'id,code,sku,name,description,category,brand,model_phone,type,current_cost,managerial_cost,sale_price,controls_inventory,current_inventory,min_inventory,max_inventory,stock_verified,image_url,source_tab,active,b2b_site_visible,notes,created_at,updated_at';
export const KIT_COMPONENT_COLUMNS = 'id,kit_product_id,component_product_id,quantity,sort_order,created_at';
export class ProductsService {
  constructor(private client: SupabaseClient | null) {}
  async list(signal?: AbortSignal, expectedUserId?: string): Promise<OfficialProduct[]> {
    if (!this.client) throw new Error('Configure a conexão com o Supabase PAMDA CORE.');
    signal?.throwIfAborted();
    const identity = await this.client.auth.getUser();
    if (identity.error || !identity.data.user || expectedUserId && identity.data.user.id !== expectedUserId) throw new Error('Sessão inválida. Entre novamente.');
    const load = async <T,>(table: 'erp_product_catalog' | 'kit_components', columns: string): Promise<T[]> => readAllPages(async (from, to) => {
      let request = this.client!.from(table).select(columns, { count: 'exact' }).order('id', { ascending: true }).range(from, to);
      if (signal) request = request.abortSignal(signal);
      const { data, count, error } = await request;
      if (error?.code === '42501') throw new Error(`Você não tem permissão para consultar ${table}. Solicite a verificação das permissões de leitura no servidor.`);
      if (error) throw new Error(`Não foi possível consultar ${table}. Confira a conexão e as permissões do Supabase.`);
      if (!Array.isArray(data) || count === null || count === undefined) throw new Error('Leitura incompleta do catálogo. Tente atualizar.');
      return { rows: data as unknown as T[], total: count };
    }, 500, signal, 3);
    const [rows, components] = await Promise.all([load<ProductRow>('erp_product_catalog', PRODUCT_COLUMNS), load<KitComponentRow>('kit_components', KIT_COMPONENT_COLUMNS)]);
    signal?.throwIfAborted();
    return mapProductCatalog(rows, components);
  }
}
