import { User, UserRole } from '../types/erp';

// Chave do localStorage para persistência da sessão
const SESSION_KEY = 'pamda_session_user';
const USERS_STORAGE_KEY = 'pamda_users_list';

// Função de hash SHA-256 usando Web Crypto API nativa
export async function hashPassword(plainText: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plainText + '_pamda_salt_2026');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Usuários padrão iniciais
const DEFAULT_USERS: Omit<User, 'passwordHash'>[] = [
  {
    id: 'user-admin-1',
    username: 'admin',
    name: 'Administrador Gerencial',
    role: 'admin_gerencial',
    active: true,
    canViewFinancialMetrics: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'user-sales-1',
    username: 'vendedor',
    name: 'Nilu Juca (Vendas)',
    role: 'venda_atendimento',
    active: true,
    canViewFinancialMetrics: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'user-prod-1',
    username: 'producao',
    name: 'Carlos Produção',
    role: 'producao',
    active: true,
    canViewFinancialMetrics: false,
    createdAt: new Date().toISOString(),
  },
];

// Senhas padrão:
// admin: 'admin123'
// vendedor: 'venda123'
// producao: 'prod123'
const DEFAULT_PASSWORDS: Record<string, string> = {
  admin: 'admin123',
  vendedor: 'venda123',
  producao: 'prod123',
};

class AuthService {
  private currentUser: User | null = null;
  private users: User[] = [];
  private listeners: Array<(user: User | null) => void> = [];

  constructor() {
    this.init();
  }

  private async init() {
    const storedUsers = localStorage.getItem(USERS_STORAGE_KEY);
    if (storedUsers) {
      try {
        this.users = JSON.parse(storedUsers);
      } catch {
        this.users = [];
      }
    }

    // Se não existirem usuários, inicializar com os padrões e hashes seguros
    if (!this.users || this.users.length === 0) {
      this.users = [];
      for (const u of DEFAULT_USERS) {
        const hash = await hashPassword(DEFAULT_PASSWORDS[u.username] || '123456');
        this.users.push({
          ...u,
          passwordHash: hash,
        });
      }
      this.persistUsers();
    }

    // Restaurar sessão
    const savedSession = localStorage.getItem(SESSION_KEY);
    if (savedSession) {
      try {
        const parsed = JSON.parse(savedSession);
        // Validar se usuário ainda existe e está ativo
        const found = this.users.find((u) => u.id === parsed.id && u.active);
        if (found) {
          this.currentUser = found;
        } else {
          localStorage.removeItem(SESSION_KEY);
        }
      } catch {
        localStorage.removeItem(SESSION_KEY);
      }
    } else {
      // Login automático inicial como admin para facilidade de testes, ou deixar null
      const defaultAdmin = this.users.find((u) => u.username === 'admin');
      if (defaultAdmin) {
        this.currentUser = defaultAdmin;
        localStorage.setItem(SESSION_KEY, JSON.stringify(defaultAdmin));
      }
    }

    this.notify();
  }

  private persistUsers() {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(this.users));
  }

  public subscribe(callback: (user: User | null) => void) {
    this.listeners.push(callback);
    callback(this.currentUser);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  private notify() {
    for (const cb of this.listeners) {
      cb(this.currentUser);
    }
  }

  public getCurrentUser(): User | null {
    return this.currentUser;
  }

  public async login(username: string, plainPassword: string): Promise<{ success: boolean; error?: string }> {
    const cleanUsername = username.trim().toLowerCase();
    const user = this.users.find((u) => u.username.toLowerCase() === cleanUsername);

    if (!user) {
      return { success: false, error: 'Usuário não encontrado.' };
    }

    if (!user.active) {
      return { success: false, error: 'Este usuário está inativo no sistema.' };
    }

    const calculatedHash = await hashPassword(plainPassword);
    if (user.passwordHash !== calculatedHash) {
      return { success: false, error: 'Senha incorreta.' };
    }

    this.currentUser = user;
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    this.notify();
    return { success: true };
  }

  public logout() {
    this.currentUser = null;
    localStorage.removeItem(SESSION_KEY);
    this.notify();
  }

  public switchUser(userId: string) {
    const user = this.users.find((u) => u.id === userId);
    if (user && user.active) {
      this.currentUser = user;
      localStorage.setItem(SESSION_KEY, JSON.stringify(user));
      this.notify();
    }
  }

  // Lista todos os usuários (somente admin/gerencial pode invocar com segurança)
  public getUsers(): User[] {
    return [...this.users];
  }

  public async createUser(data: {
    username: string;
    name: string;
    role: UserRole;
    password: string;
    active: boolean;
    canViewFinancialMetrics?: boolean;
  }): Promise<{ success: boolean; error?: string; user?: User }> {
    if (!this.isAdminGerencial()) {
      return { success: false, error: 'Acesso negado: somente Gerencial pode cadastrar usuários.' };
    }

    const cleanUsername = data.username.trim().toLowerCase();
    if (!cleanUsername) {
      return { success: false, error: 'Nome de usuário é obrigatório.' };
    }

    if (this.users.some((u) => u.username.toLowerCase() === cleanUsername)) {
      return { success: false, error: 'Este nome de usuário já está em uso.' };
    }

    if (!data.password || data.password.length < 4) {
      return { success: false, error: 'A senha deve possuir no mínimo 4 caracteres.' };
    }

    const passwordHash = await hashPassword(data.password);
    const newUser: User = {
      id: 'usr-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      username: cleanUsername,
      name: data.name.trim() || cleanUsername,
      role: data.role,
      active: data.active,
      passwordHash,
      canViewFinancialMetrics: data.role === 'admin_gerencial' ? true : !!data.canViewFinancialMetrics,
      createdAt: new Date().toISOString(),
    };

    this.users.push(newUser);
    this.persistUsers();
    return { success: true, user: newUser };
  }

  public async updateUser(
    id: string,
    data: {
      name?: string;
      role?: UserRole;
      active?: boolean;
      canViewFinancialMetrics?: boolean;
      newPassword?: string;
    }
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.isAdminGerencial()) {
      return { success: false, error: 'Acesso negado: somente Gerencial pode alterar usuários.' };
    }

    const index = this.users.findIndex((u) => u.id === id);
    if (index === -1) {
      return { success: false, error: 'Usuário não encontrado.' };
    }

    const user = { ...this.users[index] };
    if (data.name !== undefined) user.name = data.name.trim();
    if (data.role !== undefined) user.role = data.role;
    if (data.active !== undefined) user.active = data.active;
    if (data.canViewFinancialMetrics !== undefined) {
      user.canViewFinancialMetrics = data.canViewFinancialMetrics;
    }

    if (data.newPassword && data.newPassword.trim().length >= 4) {
      user.passwordHash = await hashPassword(data.newPassword.trim());
    }

    this.users[index] = user;
    this.persistUsers();

    if (this.currentUser?.id === id) {
      this.currentUser = user;
      localStorage.setItem(SESSION_KEY, JSON.stringify(user));
      this.notify();
    }

    return { success: true };
  }

  public async toggleUserFinancialMetrics(id: string): Promise<boolean> {
    if (!this.isAdminGerencial()) return false;
    const index = this.users.findIndex((u) => u.id === id);
    if (index === -1) return false;
    const user = { ...this.users[index] };
    user.canViewFinancialMetrics = !user.canViewFinancialMetrics;
    this.users[index] = user;
    this.persistUsers();

    if (this.currentUser?.id === id) {
      this.currentUser = user;
      localStorage.setItem(SESSION_KEY, JSON.stringify(user));
      this.notify();
    }
    return !!user.canViewFinancialMetrics;
  }

  // Verificações de Permissão (RBAC)
  public isAdminGerencial(): boolean {
    return this.currentUser?.role === 'admin_gerencial';
  }

  public canViewFinancialMetrics(user?: User | null): boolean {
    const u = user || this.currentUser;
    if (!u) return false;
    if (u.role === 'admin_gerencial') return true;
    return !!u.canViewFinancialMetrics;
  }

  public canAccessFinancials(): boolean {
    return this.currentUser?.role === 'admin_gerencial';
  }

  public canAccessSales(): boolean {
    return (
      this.currentUser?.role === 'admin_gerencial' ||
      this.currentUser?.role === 'venda_atendimento'
    );
  }

  public canAccessProduction(): boolean {
    return (
      this.currentUser?.role === 'admin_gerencial' ||
      this.currentUser?.role === 'producao' ||
      this.currentUser?.role === 'venda_atendimento'
    );
  }
}

export const authService = new AuthService();
