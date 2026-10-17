import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readSupabaseConfig } from './supabaseConfig';

// Reuse the browser client across Vite HMR; avoid duplicate refresh/broadcast listeners.
let client: SupabaseClient | null = import.meta.hot?.data.pamdaSupabase || null;
let configurationError: string | null = null;

try {
  const config = readSupabaseConfig({
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
  });
  client ??= createClient(config.url, config.key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'pamda_core_auth',
    },
  });
} catch (error) {
  client = null;
  configurationError = error instanceof Error ? error.message : 'Não foi possível configurar o Supabase.';
}

export const supabase = client;
export const supabaseConfigurationError = configurationError;
if (import.meta.hot) import.meta.hot.dispose(data => { data.pamdaSupabase = client; });
