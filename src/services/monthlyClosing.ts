import {authService} from './auth';
import {coreService} from './coreService';
import {calculateMonthlyClosing,createMonthlyClosing,validateMonthlyClosing} from './monthlyClosingCalculation';
import type {MonthlyClosingData,MonthlyClosingRead,MonthlyClosingRecord,ShopSnapshot} from '../types/monthlyClosing';

function admin(userId:string){const u=authService.getCurrentUser();if(u?.id!==userId||!u.active||u.mustChangePassword||u.role!=='admin_gerencial'||authService.getError())throw new Error('Fechamento mensal é exclusivo da administração.');}
function record(value:unknown,month:string):MonthlyClosingRecord {
  const r=value as MonthlyClosingRecord;
  if(!r||r.month!==month||r.data?.month!==month||!Number.isSafeInteger(r.version)||r.version<1||!['draft','closed'].includes(r.status)||!Number.isFinite(Date.parse(r.updatedAt)))throw new Error('O servidor retornou um fechamento incompatível.');
  const totals=calculateMonthlyClosing(r.data);
  if(!r.totals||Object.entries(totals).some(([key,value])=>r.totals[key as keyof typeof totals]!==value))throw new Error('Os totais do servidor não conferem. Recarregue o mês antes de continuar.');
  return r;
}
export const monthlyClosingService={
  async read(userId:string,month:string):Promise<MonthlyClosingRead>{
    admin(userId);createMonthlyClosing(month);
    const value=await coreService.rpc(userId,'pamda_monthly_closing_read',{p_month:month}) as MonthlyClosingRead;admin(userId);
    if(!value||!Array.isArray(value.months)||value.months.some(m=>!/^\d{4}-\d{2}$/.test(m.month)||!['draft','closed'].includes(m.status)||!Number.isSafeInteger(m.version)||m.version<1))throw new Error('Não foi possível conferir os meses salvos.');
    if(value.defaults)validateMonthlyClosing(createMonthlyClosing(month,value.defaults));
    return {...value,record:value.record?record(value.record,month):null};
  },
  async profit(userId:string,start:string,end:string):Promise<ShopSnapshot>{
    admin(userId);
    const value=await coreService.rpc(userId,'pamda_monthly_closing_profit',{p_start:start,p_end:end},true) as ShopSnapshot;admin(userId);
    const draft=createMonthlyClosing(start.slice(0,7));draft.start=start;draft.end=end;draft.shop.snapshot=value;
    validateMonthlyClosing(draft);
    if(!value||!Number.isFinite(Date.parse(value.capturedAt)))throw new Error('O servidor não confirmou o lucro das lojas.');
    return value;
  },
  async write(userId:string,data:MonthlyClosingData,version:number,action:'save'|'close'|'reopen',requestKey:string,reason=''){
    admin(userId);validateMonthlyClosing(data);
    const value=await coreService.rpc(userId,'pamda_monthly_closing_write',{p_month:data.month,p_data:data,p_expected_version:version,p_action:action,p_request_key:requestKey,p_reason:reason||null},true);admin(userId);
    return record(value,data.month);
  },
};
