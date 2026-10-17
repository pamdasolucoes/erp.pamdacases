// Recuperacao excepcional pelo proprietario do Supabase, em terminal privado.
// Nao executado pelo aplicativo. Nao altera clientes, roles ou permissoes.
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';

config({ path: '.env.local', quiet: true });
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Configure a URL e credencial administrativa somente no terminal seguro.');
if (!key.startsWith('sb_secret_')) {
  let role;
  try { role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role; } catch {}
  if (role !== 'service_role') throw new Error('Credencial administrativa de servidor necessária.');
}
if (!process.stdin.isTTY) throw new Error('Execute em um terminal interativo seguro.');
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
let muted = false;
const output = new Writable({ write(chunk, encoding, callback) { if (!muted) process.stdout.write(chunk, encoding); callback(); } });
const readline = createInterface({ input: process.stdin, output, terminal: true });
try {
  const username = (await readline.question('Usuário do administrador a recuperar: ')).trim().toLowerCase();
  const found = await admin.from('erp_employees').select('id,role,active').eq('username', username).maybeSingle();
  if (found.error || !found.data?.active || found.data.role !== 'admin_gerencial') throw new Error('Administrador ativo não encontrado.');
  const confirmed = (await readline.question('Confirme a identidade e autorização do administrador. Digite RECUPERAR: ')).trim();
  if (confirmed !== 'RECUPERAR') throw new Error('Operação cancelada.');
  process.stdout.write('Nova senha temporária (12–128 caracteres, oculta): ');
  muted = true;
  const password = await readline.question('');
  process.stdout.write('\nConfirme a senha (oculta): ');
  const confirmation = await readline.question('');
  muted = false;
  process.stdout.write('\n');
  if (password.length < 12 || password.length > 128 || password !== confirmation) throw new Error('Senhas inválidas ou diferentes.');
  const locked = await admin.from('erp_employees').update({ must_change_password: true }).eq('id', found.data.id);
  if (locked.error) throw new Error('Não foi possível bloquear o acesso para recuperação.');
  const result = await admin.auth.admin.updateUserById(found.data.id, { password });
  if (result.error) throw new Error('Não foi possível redefinir a senha. A conta permanece exigindo troca.');
  process.stdout.write('Senha temporária redefinida. Entregue por canal privado; a troca será exigida no acesso.\n');
} finally { readline.close(); }
