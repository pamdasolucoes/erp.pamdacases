// Executar manualmente APOS revisar/aplicar a migration 04. Nunca no frontend.
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { randomUUID } from 'node:crypto';

config({ path: '.env.local', quiet: true });
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key || (!key.startsWith('sb_secret_') && key.split('.').length !== 3)) {
  throw new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY somente no ambiente do terminal seguro.');
}
if (!key.startsWith('sb_secret_')) {
  let role;
  try { role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role; } catch {}
  if (role !== 'service_role') throw new Error('O bootstrap requer credencial administrativa de servidor.');
}
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const existing = await admin.from('erp_employees').select('id', { count: 'exact', head: true });
if (existing.error || existing.count !== 0) throw new Error('Bootstrap indisponível: migration ausente ou funcionários já cadastrados.');
if (!process.stdin.isTTY) throw new Error('Execute em um terminal interativo seguro. Não forneça senha por argumentos.');

let muted = false;
const output = new Writable({ write(chunk, encoding, callback) { if (!muted) process.stdout.write(chunk, encoding); callback(); } });
const readline = createInterface({ input: process.stdin, output, terminal: true });
let createdId;
try {
  const username = (await readline.question('Usuário do primeiro administrador: ')).trim().toLowerCase();
  const name = (await readline.question('Nome: ')).trim();
  process.stdout.write('Senha temporária (12 a 128 caracteres, oculta): ');
  muted = true;
  const password = await readline.question('');
  process.stdout.write('\nConfirme a senha (oculta): ');
  const confirmation = await readline.question('');
  muted = false;
  process.stdout.write('\n');
  if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username) || !name || name.length > 100 ||
      password.length < 12 || password.length > 128 || password !== confirmation) throw new Error('Dados inválidos ou senhas diferentes.');
  const authEmail = `${randomUUID()}@auth.pamda.invalid`;
  const created = await admin.auth.admin.createUser({ email: authEmail, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error('Não foi possível criar a identidade de autenticação.');
  createdId = created.data.user.id;
  const result = await admin.rpc('pamda_bootstrap_admin', { p_id: createdId, p_username: username, p_auth_email: authEmail, p_display_name: name });
  if (result.error) throw new Error('Não foi possível cadastrar o primeiro administrador.');
  createdId = undefined;
  process.stdout.write('Administrador criado. Entre com usuário e senha; troque a senha no primeiro acesso.\n');
} catch (error) {
  if (createdId) await admin.auth.admin.deleteUser(createdId);
  throw error;
} finally {
  readline.close();
}
