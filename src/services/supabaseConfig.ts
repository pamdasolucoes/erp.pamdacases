export interface SupabaseEnvironment {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}

// Executado tambem pelo Vite ANTES de gerar/servir o bundle. Rejeitar apenas
// em runtime seria tarde: uma variavel VITE_ ja teria sido publicada no JS.
export function assertNoFrontendSecrets(env: Record<string, string | undefined>) {
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith('VITE_') || !value) continue;
    if (name === 'VITE_SUPABASE_URL') {
      let url: URL | null = null;
      try { url = new URL(value); } catch {}
      if (url && (url.username || url.password || url.search || url.hash)) {
        throw new Error('A URL pública do Supabase não pode conter credenciais, parâmetros ou fragmentos.');
      }
    }
    let role: unknown;
    try { role = JSON.parse(atob(value.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role; } catch {}
    if (value.startsWith('sb_secret_') || role === 'service_role' ||
        /(SERVICE_ROLE|PRIVATE_KEY|SECRET_KEY|PASSWORD|ACCESS_TOKEN|REFRESH_TOKEN)/i.test(name)) {
      throw new Error(`Credencial privada em ${name}: remova-a das variáveis públicas antes de executar o frontend.`);
    }
  }
}

export function readSupabaseConfig(env: SupabaseEnvironment) {
  const url = env.VITE_SUPABASE_URL?.trim();
  const key = (env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY)?.trim();
  if (!url || !key) {
    throw new Error('Configure a URL e a chave pública do Supabase PAMDA CORE.');
  }
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error('A URL do Supabase é inválida.');
  }
  if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password ||
      parsedUrl.search || parsedUrl.hash || parsedUrl.pathname !== '/') {
    throw new Error('Use a Project URL HTTPS do Supabase, sem credenciais ou caminhos.');
  }
  if (key.startsWith('sb_secret_')) {
    throw new Error('Chaves privadas são proibidas no frontend. Use uma chave publishable ou anon.');
  }
  if (!key.startsWith('sb_publishable_')) {
    let role: unknown;
    try {
      const payload = key.split('.')[1];
      role = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))).role;
    } catch {
      throw new Error('A chave pública do Supabase é inválida.');
    }
    if (role !== 'anon') {
      throw new Error('Somente a chave pública publishable ou anon pode ser usada no frontend.');
    }
  }
  return { url: parsedUrl.origin, key };
}
