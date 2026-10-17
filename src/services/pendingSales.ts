import type { SupabaseClient } from '@supabase/supabase-js';
import type { PendingSaleRow,OfficialSaleRow,OfficialSaleItemRow,OfficialSaleEventRow,SaleDetails,SavePendingSaleArgs } from '../types/pendingSales';
import { isUuid } from './customerEdits';
import { dbCents } from './pendingSaleMapping';
import { readAllPages } from './readPages';

export const PENDING_COLUMNS='id,customer_id,branch_id,created_by,created_at,updated_at,customer_snapshot,branch_snapshot,seller_snapshot,subtotal,discount_amount,shipping_charged,shipping_confirmed,total,notes';
export const SALE_COLUMNS=PENDING_COLUMNS+',status,confirmed_at,payment_method_id,payment_term_id,discount_reason,shipping_actual_cost,draft_key,cancelled_at,cancelled_by,cancellation_reason';
export const ITEM_COLUMNS='id,sale_id,product_id,product_code_snapshot,product_sku_snapshot,description_snapshot,quantity,negotiated_unit_price,line_subtotal,customization,created_at';
export const EVENT_COLUMNS='id,sale_id,actor_user_id,event_type,details,occurred_at';
export class SaleAccessError extends Error {}
export function saleError(error:{code?:string;message?:string}|null):Error {
  if(error?.code==='42501') return new SaleAccessError('Você não tem permissão para esta operação. Confira seu perfil com a administração.');
  if(['PGRST202','PGRST205','42P01'].includes(error?.code||'')) return new Error('A integração de pendências não está disponível no servidor.');
  if(['P0001','22023','23514','40001'].includes(error?.code||'')&&error?.message) return new Error(error.message);
  return new Error('Não foi possível confirmar a operação no Supabase. Verifique a conexão e tente novamente.');
}
export function permissionArgument(spec:any):string {
  const post=spec?.paths?.['/rpc/pamda_has_permission']?.post;
  let schema=post?.parameters?.find((arg:any)=>arg.in==='body')?.schema||post?.requestBody?.content?.['application/json']?.schema;
  if(schema?.$ref){const parts=String(schema.$ref).split('/').slice(1);schema=parts.reduce((value:any,key:string)=>value?.[key],spec);}
  const entries=Object.entries(schema?.properties||{});
  if(entries.length!==1||(entries[0][1] as any)?.type!=='string') throw new Error('Não foi possível verificar o contrato de permissões do servidor.');
  return entries[0][0];
}
function validateSale(row:PendingSaleRow) {
  if(!row||![row.id,row.customer_id,row.branch_id,row.created_by].every(id=>typeof id==='string'&&isUuid(id))||
    !Number.isFinite(Date.parse(row.created_at))||!Number.isFinite(Date.parse(row.updated_at))||typeof row.seller_snapshot!=='string'||
    !row.customer_snapshot||!row.branch_snapshot||typeof row.shipping_confirmed!=='boolean') throw new Error('Dados de venda incompatíveis com o contrato oficial.');
  [row.subtotal,row.discount_amount,row.total].forEach(dbCents);if(row.shipping_charged!==null)dbCents(row.shipping_charged);
}
export class PendingSalesService {
  private permissionName:Promise<string>|null=null;
  constructor(private client:SupabaseClient|null){}
  private async identity(userId:string){
    if(!this.client) throw new Error('Configure o Supabase PAMDA CORE.');
    const {data,error}=await this.client.auth.getUser();
    if(error||data.user?.id!==userId)throw new SaleAccessError('A sessão mudou. Valide o acesso antes de continuar.');
  }
  private async lock<T>(saleKey:string,write:()=>Promise<T>):Promise<T>{
    const name=`pamda-sale-write:${saleKey}`;
    return typeof navigator!=='undefined'&&navigator.locks?navigator.locks.request(name,write):write();
  }
  async hasPermission(userId:string,permission:'sales.draft'|'sales.read'|'sales.cancel'):Promise<boolean>{
    await this.identity(userId);
    if(!this.permissionName)this.permissionName=this.client!.getOpenApiSpec().then(({data,error})=>{if(error)throw saleError(error);return permissionArgument(data);}).catch(error=>{this.permissionName=null;throw error;});
    const argument=await this.permissionName;
    await this.identity(userId);
    const {data,error}=await this.client!.rpc('pamda_has_permission',{[argument]:permission});
    if(error)throw saleError(error);if(typeof data!=='boolean')throw new Error('Resposta de permissão inválida.');return data;
  }
  async start(userId:string,customerId:string,branchId:string,draftKey:string):Promise<string>{
    if(![customerId,branchId,draftKey].every(isUuid))throw new Error('Cliente ou unidade inválidos.');
    return this.lock(draftKey,async()=>{
      await this.identity(userId);
      const {data,error}=await this.client!.rpc('pamda_iniciar_venda',{p_cliente_id:customerId,p_filial_id:branchId,p_draft_key:draftKey});
      if(error)throw saleError(error);if(typeof data!=='string'||!isUuid(data))throw new Error('O servidor não confirmou a venda iniciada.');return data;
    });
  }
  async save(userId:string,args:SavePendingSaleArgs):Promise<void>{
    if(!isUuid(args.p_venda_id))throw new Error('A venda precisa ser iniciada antes de salvar.');
    await this.lock(args.p_venda_id,async()=>{
      await this.identity(userId);
      const {data,error}=await this.client!.rpc('pamda_salvar_rascunho_venda',args);
      if(error)throw saleError(error);if(data!==args.p_venda_id)throw new Error('O servidor não confirmou a venda esperada.');
    });
  }
  private async rows<T>(table:string,columns:string,filter:(query:any)=>any):Promise<T[]>{
    const rows=await readAllPages<T>(async(from,to)=>{
      const {data,error,count}=await filter(this.client!.from(table).select(columns,{count:'exact'})).order('id').range(from,to);
      if(error)throw saleError(error);if(!data||count===null)throw new Error('Leitura de vendas incompleta.');return {rows:data as T[],total:count};
    });
    if(new Set(rows.map((row:any)=>row.id)).size!==rows.length)throw new Error('A consulta retornou registros repetidos. Atualize a lista.');return rows;
  }
  async list(userId:string,history=false,customerId?:string):Promise<(PendingSaleRow&{status:'draft'|'confirmed'|'cancelled'})[]>{
    await this.identity(userId);
    const rows=await this.rows<OfficialSaleRow>(history?'erp_sales':'erp_pending_sales',history?SALE_COLUMNS:PENDING_COLUMNS,query=>{
      if(history)query=query.in('status',['confirmed','cancelled']);if(customerId)query=query.eq('customer_id',customerId);return query;
    });
    rows.forEach(validateSale);
    return rows.map(row=>({...row,status:history?row.status:'draft'})).sort((a,b)=>b.created_at.localeCompare(a.created_at)||a.id.localeCompare(b.id));
  }
  async details(userId:string,saleId:string):Promise<SaleDetails>{
    await this.identity(userId);if(!isUuid(saleId))throw new Error('Venda inválida.');
    const {data:sale,error}=await this.client!.from('erp_sales').select(SALE_COLUMNS).eq('id',saleId).returns<OfficialSaleRow[]>().maybeSingle();
    if(error)throw saleError(error);if(!sale||sale.id!==saleId)throw new SaleAccessError('Venda não encontrada ou sem permissão de leitura.');
    validateSale(sale);if(!['draft','confirmed','cancelled'].includes(sale.status))throw new Error('Situação da venda incompatível.');
    const [items,events]=await Promise.all([
      this.rows<OfficialSaleItemRow>('erp_sale_items',ITEM_COLUMNS,q=>q.eq('sale_id',saleId)),
      this.rows<OfficialSaleEventRow>('erp_sale_events',EVENT_COLUMNS,q=>q.eq('sale_id',saleId)),
    ]);
    for(const item of items){
      if(item.sale_id!==saleId||!isUuid(item.id)||!isUuid(item.product_id)||typeof item.product_code_snapshot!=='string'||typeof item.product_sku_snapshot!=='string'||typeof item.description_snapshot!=='string'||!Number.isFinite(Number(item.quantity))||Number(item.quantity)<=0)throw new Error('Item incompatível com a venda consultada.');
      dbCents(item.negotiated_unit_price);dbCents(item.line_subtotal);
    }
    if(events.some(event=>event.sale_id!==saleId||!isUuid(event.id)||!isUuid(event.actor_user_id)||!Number.isFinite(Date.parse(event.occurred_at))))throw new Error('Histórico incompatível com a venda consultada.');
    const ids=[...new Set([sale.cancelled_by,...events.map(event=>event.actor_user_id)].filter(Boolean))];
    const actors:Record<string,string>={};
    // RLS may allow only the current profile. Never expose UUIDs as a fallback name.
    if(ids.length){const {data}=await this.client!.from('erp_user_profiles').select('user_id,username').in('user_id',ids);for(const profile of data||[])if(typeof profile.username==='string')actors[profile.user_id]=profile.username;}
    return {sale,items,events:events.sort((a,b)=>a.occurred_at.localeCompare(b.occurred_at)),actors};
  }
  async cancel(userId:string,saleId:string,reason:string):Promise<SaleDetails>{
    if(!isUuid(saleId)||!reason.trim())throw new Error('Informe o motivo do cancelamento.');
    return this.lock(saleId,async()=>{
      await this.identity(userId);
      const {error}=await this.client!.rpc('pamda_cancelar_venda',{p_venda_id:saleId,p_motivo:reason.trim()});
      if(error)throw saleError(error);
      const details=await this.details(userId,saleId);
      if(details.sale.status!=='cancelled')throw new Error('Não foi possível confirmar o cancelamento. Atualize a consulta.');return details;
    });
  }
}
