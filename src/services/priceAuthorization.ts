import type { SupabaseClient } from '@supabase/supabase-js';
import type { DemoPriceAuthorization, PriceDraftReview } from '../types/salePricing';

export class PriceAuthorizationService {
  constructor(private client: SupabaseClient | null) {}
  async authorizeDemo(draft: PriceDraftReview): Promise<DemoPriceAuthorization> {
    if (!this.client) throw new Error('Configure a conexão com o Supabase para validar a autorização gerencial.');
    const identity = await this.client.auth.getUser();
    if (identity.error || !identity.data.user) throw new Error('Sessão inválida. Entre novamente.');
    const { data, error } = await this.client.rpc('pamda_authorize_demo_pricing', { p_draft: draft });
    if (error?.code === 'PGRST202') throw new Error('A autorização de demonstração ainda não está configurada no servidor. Solicite a revisão e ativação da migration 07.');
    if (error?.code === '42501') throw new Error('Somente um administrador ativo pode autorizar negociações.');
    if (error) throw new Error('O servidor não autorizou a simulação. Confira os valores, motivos, conexão e permissões.');
    if (data?.scope !== 'demo_only' || data.official_sale_allowed !== false || data.revision !== draft.revision ||
      data.authorized_by?.id !== identity.data.user.id || typeof data.authorized_by.username !== 'string' ||
      !Number.isFinite(Date.parse(data.authorized_at))) throw new Error('A autorização retornada não corresponde a esta preparação.');
    return { scope: 'demo_only', officialSaleAllowed: false, revision: data.revision,
      authorizedAt: data.authorized_at, authorizedBy: data.authorized_by };
  }
}
