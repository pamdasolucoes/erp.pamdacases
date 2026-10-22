import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.2';

const url = Deno.env.get('SUPABASE_URL')!;
const key = Deno.env.get('SUPABASE_ANON_KEY')!;
const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Content-Type': 'application/json' };
const reply = (status:number, body:unknown) => new Response(JSON.stringify(body), { status, headers });

Deno.serve(async req => {
 if (req.method === 'OPTIONS') return new Response(null,{headers});
 if (req.method !== 'POST') return reply(405,{error:'Método inválido'});
 try {
  const authorization = req.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return reply(401,{error:'Entre novamente'});
  const userClient = createClient(url,key,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
  const identity = await userClient.auth.getUser();
  if (identity.error || !identity.data.user) return reply(401,{error:'Sessão inválida'});
  const check = await userClient.rpc('pamda_is_admin');
  if (check.error || check.data !== true) return reply(403,{error:'Apenas administradores podem gerenciar contas'});
  const input = await req.json();
  const admin = createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  if (input.action === 'create') {
   if (typeof input.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) || typeof input.password !== 'string' || input.password.length<12 || typeof input.name!=='string' || !input.name.trim() || !['admin_gerencial','venda_atendimento','producao','financeiro','estoque_expedicao'].includes(input.role)) return reply(400,{error:'Informe nome, e-mail, perfil e senha com pelo menos 12 caracteres'});
   const created=await admin.auth.admin.createUser({email:input.email.trim(),password:input.password,email_confirm:true});
   if(created.error || !created.data.user) return reply(409,{error:'Não foi possível criar a conta. Confira se o e-mail já existe.'});
   const profile=await userClient.rpc('pamda_admin_registrar_perfil',{p_user_id:created.data.user.id,p_username:input.email.trim(),p_display_name:input.name.trim(),p_role:input.role});
   if(profile.error){await admin.auth.admin.deleteUser(created.data.user.id);return reply(409,{error:'Não foi possível registrar o perfil; a nova conta foi desfeita.'});}
   return reply(201,{user_id:created.data.user.id});
  }
  if(input.action==='reset_password') {
   if(typeof input.user_id!=='string' || typeof input.password!=='string' || input.password.length<12) return reply(400,{error:'Informe usuário e senha com pelo menos 12 caracteres'});
   const target=await admin.from('erp_user_profiles').select('user_id').eq('user_id',input.user_id).maybeSingle();
   if(target.error || !target.data) return reply(404,{error:'Usuário do ERP não encontrado'});
   const updated=await admin.auth.admin.updateUserById(input.user_id,{password:input.password});
   if(updated.error)return reply(400,{error:'Não foi possível redefinir a senha'});
   const audit=await admin.from('erp_access_audit').insert({actor_user_id:identity.data.user.id,target_user_id:input.user_id,action:'password.reset',details:{}});
   if(audit.error)return reply(500,{error:'Senha atualizada, mas houve falha ao registrar a auditoria. Verifique os logs.'});
   return reply(200,{success:true});
  }
  return reply(400,{error:'Ação inválida'});
 }catch{return reply(500,{error:'Não foi possível concluir a administração de usuários'});}
});
