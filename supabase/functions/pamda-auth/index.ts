import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { createAuthHandler } from './handler.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const publicKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const allowedOrigins = (Deno.env.get('PAMDA_ALLOWED_ORIGINS') || '').split(',').map(value => value.trim()).filter(Boolean);
const authOptions = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

Deno.serve(createAuthHandler({
  admin: createClient(url, serviceKey, { auth: authOptions }),
  createPasswordClient: () => createClient(url, publicKey, { auth: authOptions }),
  allowedOrigins,
}));
