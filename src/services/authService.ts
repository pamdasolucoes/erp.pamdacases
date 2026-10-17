import type { SupabaseClient } from '@supabase/supabase-js';
import type { User, UserRole } from '../types/erp';

const ERP_ROLES: UserRole[] = ['admin_gerencial', 'venda_atendimento', 'producao'];

interface ErpUserProfile {
  user_id: string;
  username: string;
  role: UserRole;
  active: boolean;
  can_view_financial_metrics: boolean;
}

type AuthListener = (user: User | null, loading: boolean, error: string | null) => void;
type SignInResponse = Awaited<ReturnType<SupabaseClient['auth']['signInWithPassword']>>;

export function mapUserProfile(userId: string, profile: ErpUserProfile | null, createdAt = ''): User | null {
  if (!profile || profile.user_id !== userId || profile.active !== true ||
      !ERP_ROLES.includes(profile.role) || typeof profile.username !== 'string' ||
      !profile.username.trim()) return null;

  return {
    id: userId,
    username: profile.username,
    name: profile.username,
    role: profile.role,
    active: true,
    canReadCustomers: profile.role === 'admin_gerencial',
    canViewFinancialMetrics: profile.can_view_financial_metrics === true,
    createdAt,
  };
}

function userProfileError(userId: string, profile: ErpUserProfile | null): string {
  if (!profile) {
    return 'O login do Supabase foi aceito, mas erp_user_profiles não retornou uma linha para este user_id. Confira se o user_id do perfil corresponde ao ID da conta Auth e se a RLS permite SELECT da própria linha (user_id = auth.uid()); a RLS pode ocultar a linha sem retornar erro.';
  }
  if (profile.user_id !== userId) return 'O user_id do perfil não corresponde à identidade autenticada.';
  if (profile.active !== true) return 'O perfil existe, mas está inativo. Peça ao administrador para ativar a conta.';
  if (!ERP_ROLES.includes(profile.role)) {
    return `O perfil existe, mas o role "${String(profile.role)}" não é reconhecido. Use admin_gerencial, venda_atendimento ou producao.`;
  }
  if (typeof profile.username !== 'string' || !profile.username.trim()) {
    return 'O perfil existe, mas o campo username está vazio ou inválido.';
  }
  return 'O perfil do ERP está inválido. Confira os campos user_id, username, role e active.';
}

export class AuthService {
  private currentUser: User | null = null;
  private loading = true;
  private error: string | null = null;
  private listeners = new Set<AuthListener>();
  private initialization: Promise<void> | null = null;
  private generation = 0;
  private mutatingAuth = false;
  private loggingOut = false;
  private signInRequest: Promise<SignInResponse> | null = null;
  private subscription: { unsubscribe(): void } | null = null;

  constructor(
    private client: SupabaseClient | null,
    private configurationError: string | null = null,
    validatedRuntimeUser: User | null = null,
  ) {
    // HMR context only: never read a user/profile from browser storage.
    if(client && !configurationError && validatedRuntimeUser?.active) this.currentUser=validatedRuntimeUser;
  }

  public initialize(): Promise<void> {
    if (this.initialization) return this.initialization;
    this.initialization = this.start();
    return this.initialization;
  }

  private async start() {
    if (!this.client) {
      this.publish(null, false, this.configurationError || 'Supabase não configurado.');
      return;
    }
    const { data } = this.client.auth.onAuthStateChange((event, session) => {
      if (this.mutatingAuth || this.loggingOut || event === 'INITIAL_SESSION') return;
      if (event === 'SIGNED_OUT' || !session) {
        this.generation++;
        this.publish(null, false, null);
        return;
      }
      const generation = ++this.generation;
      // SIGNED_IN can repeat on focus; TOKEN_REFRESHED is not a logout.
      const sameIdentity = this.currentUser?.id === session.user.id;
      this.publish(sameIdentity ? this.currentUser : null, true, sameIdentity ? this.error : null);
      // Leave the synchronous Auth callback before calling Auth APIs (SDK lock).
      setTimeout(() => { void this.validate(generation, session.user.id); }, 0);
    });
    this.subscription = data.subscription;
    await this.validate(++this.generation);
  }

  private async validate(generation: number, expectedId?: string): Promise<User | null> {
    if (!this.client || generation !== this.generation) return null;
    try {
      const { data: identity, error: identityError } = await this.client.auth.getUser();
      if (generation !== this.generation) return null;
      if (identityError || !identity.user) {
        if (identityError && this.retryable(identityError)) {
          this.publish(this.currentUser, false, 'Não foi possível revalidar a sessão. Confira a conexão e tente novamente.');
          return null;
        }
        const message = identityError && identityError.name !== 'AuthSessionMissingError'
          ? 'Não foi possível validar sua sessão. Entre novamente.'
          : null;
        this.publish(null, false, message);
        return null;
      }

      if (expectedId && identity.user.id !== expectedId) {
        this.publish(null, false, 'A identidade da sessão mudou. Entre novamente.');
        return null;
      }

      const { data: profile, error: profileError, status: profileStatus } = await this.client
        .from('erp_user_profiles')
        .select('user_id,username,role,active,can_view_financial_metrics')
        .retry(false)
        .eq('user_id', identity.user.id)
        .maybeSingle();
      if (generation !== this.generation) return null;
      if (profileError) {
        if (this.retryable({ ...profileError, status: profileStatus })) {
          this.publish(this.currentUser?.id === identity.user.id ? this.currentUser : null, false, 'Não foi possível revalidar o perfil. Confira a conexão e tente novamente.');
          return null;
        }
        const message = profileError.code === '42501'
          ? 'O Supabase bloqueou a leitura do seu perfil. É necessária uma política RLS de SELECT em erp_user_profiles que permita ao usuário autenticado ler somente a linha cujo user_id = auth.uid().'
          : 'Não foi possível carregar seu perfil do ERP. Confira a conexão e a configuração da tabela erp_user_profiles.';
        this.publish(null, false, message);
        return null;
      }

      const user = mapUserProfile(
        identity.user.id,
        profile as ErpUserProfile | null,
        identity.user.created_at,
      );
      this.publish(
        user,
        false,
        user ? null : userProfileError(identity.user.id, profile as ErpUserProfile | null),
      );
      return user;
    } catch {
      if (generation === this.generation) {
        this.publish(this.currentUser, false, 'Não foi possível validar sua sessão ou carregar seu perfil. Verifique a conexão com o Supabase.');
      }
      return null;
    }
  }

  private retryable(error: { name?: string; status?: number; code?: string; message?: string }) {
    return error.name === 'AuthRetryableFetchError' || error.status === 0 || (error.status !== undefined && error.status >= 500) ||
      error.code === '' || /fetch failed|failed to fetch|networkerror|network request failed/i.test(error.message || '');
  }

  private publish(user: User | null, loading: boolean, error: string | null) {
    this.currentUser = user;
    this.loading = loading;
    this.error = error;
    for (const listener of this.listeners) listener(user, loading, error);
  }

  public subscribe(listener: AuthListener) {
    this.listeners.add(listener);
    listener(this.currentUser, this.loading, this.error);
    return () => { this.listeners.delete(listener); };
  }

  public getCurrentUser(): User | null { return this.currentUser; }
  public isLoading(): boolean { return this.loading; }
  public getError(): string | null { return this.error; }
  public async refresh() { await this.validate(++this.generation, this.currentUser?.id); }

  public async login(email: string, password: string): Promise<{ success: boolean; error?: string }> {
    await this.initialize();
    if (!this.client) return { success: false, error: this.configurationError || 'Supabase não configurado.' };
    if (this.mutatingAuth || this.loggingOut) {
      return { success: false, error: 'Aguarde a operação de autenticação em andamento.' };
    }
    if (!email.trim() || !password) return { success: false, error: 'Informe seu e-mail e senha.' };

    const generation = ++this.generation;
    this.mutatingAuth = true;
    this.publish(null, true, null);
    try {
      this.signInRequest = this.client.auth.signInWithPassword({ email: email.trim(), password });
      const { data, error } = await this.signInRequest;
      if (generation !== this.generation) return { success: false, error: 'Operação de autenticação cancelada.' };
      if (error || !data.user || !data.session) {
        const message = error?.status === 400
          ? 'E-mail ou senha inválidos.'
          : error?.message || 'Não foi possível autenticar no Supabase.';
        this.publish(null, false, message);
        return { success: false, error: message };
      }
      const user = await this.validate(generation);
      return user ? { success: true } : { success: false, error: this.error || 'Acesso não autorizado.' };
    } catch {
      const message = 'Não foi possível autenticar no Supabase. Verifique sua conexão e tente novamente.';
      if (generation === this.generation) this.publish(null, false, message);
      return { success: false, error: message };
    } finally {
      this.signInRequest = null;
      if (!this.loggingOut) this.mutatingAuth = false;
      if (generation === this.generation && this.loading) this.publish(null, false, null);
    }
  }

  public async logout() {
    this.generation++;
    this.loggingOut = true;
    this.mutatingAuth = true;
    this.publish(null, false, null);
    try {
      await this.signInRequest?.catch(() => {});
      const result = await this.client?.auth.signOut({ scope: 'local' });
      if (result?.error) this.publish(null, false, 'Não foi possível encerrar a sessão. Tente sair novamente.');
    } catch {
      this.publish(null, false, 'Não foi possível encerrar a sessão. Verifique a conexão.');
    } finally {
      this.mutatingAuth = false;
      this.loggingOut = false;
    }
  }

  public dispose() {
    this.generation++;
    this.subscription?.unsubscribe();
    this.listeners.clear();
  }

  public isAdminGerencial(): boolean { return this.currentUser?.role === 'admin_gerencial'; }
  public canViewFinancialMetrics(user = this.currentUser): boolean {
    return !!user && user.canViewFinancialMetrics === true;
  }
  public canAccessFinancials(): boolean { return this.isAdminGerencial(); }
  public canAccessSales(): boolean {
    return this.currentUser?.role === 'admin_gerencial' || this.currentUser?.role === 'venda_atendimento';
  }
  public canAccessProduction(): boolean { return !!this.currentUser; }
  public canReadCustomers(): boolean {
    return this.canAccessSales() && this.currentUser?.canReadCustomers === true;
  }
}
