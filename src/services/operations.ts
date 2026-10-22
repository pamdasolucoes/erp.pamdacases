import {supabase} from './supabase';
import {authService} from './auth';
import {coreService} from './coreService';
export type OperationModule='stock'|'purchases'|'expenses'|'receivables'|'closings'|'production'|'deliveries'|'reports'|'profitability'|'audit'|'settings';
export type DataRow=Record<string,any>;
export const operations={
 async read(module:OperationModule,start='',end=''):Promise<DataRow>{
  const user=authService.getCurrentUser();if(!user)throw new Error('Entre novamente.');
  return await coreService.rpc(user.id,'pamda_operation_read',{p_module:module,p_start:start||null,p_end:end||null}) as DataRow;
 },
 async write(action:string,data:DataRow,key:string){
  const user=authService.getCurrentUser();if(!user)throw new Error('Entre novamente.');
  const stock=action==='stock';
  await coreService.rpc(user.id,stock?'pamda_stock_write':'pamda_operation_write',stock?{p_data:data,p_request_key:key}:{p_action:action,p_data:data,p_request_key:key},true);
 },
 async users():Promise<DataRow>{const user=authService.getCurrentUser();if(!user)throw new Error('Entre novamente.');return await coreService.rpc(user.id,'pamda_users_read') as DataRow;},
 async saveUser(data:DataRow){const user=authService.getCurrentUser();if(!user)throw new Error('Entre novamente.');await coreService.rpc(user.id,'pamda_user_save',{p_data:data},true);},
 async account(data:DataRow){
  if(!supabase)throw new Error('Supabase não configurado.');
  const {data:result,error}=await supabase.functions.invoke('pamda-user-admin',{body:data});
  if(error||result?.error)throw new Error(result?.error||'Não foi possível concluir. Verifique a conta e tente novamente.');return result;
 }
};
export const money=(value:unknown)=>Number(value??0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export const localDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
export const displayDate=(value:unknown)=>value?new Date(String(value).length===10?String(value)+'T12:00:00-03:00':String(value)).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'—';
