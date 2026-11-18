import {authService} from './auth';
import {coreService} from './coreService';
import {createMonthlyClosing,validateMonthlyClosing} from './monthlyClosingCalculation';
import {mergeRecurringAccounts,validateRecurringAccount} from './recurringAccountCalculation';
import type {AppliedAccounts,RecurringAccount,RecurringAccountData} from '../types/recurringAccounts';
export interface AccountAlerts {overdue:number;today:number;upcoming:number;unscheduled:number;firstMonth:string|null;checkedOn:string;}
export const notifyAccountChange=()=>{if(typeof window!=='undefined')window.dispatchEvent(new Event('pamda-monthly-accounts-changed'));};
function admin(id:string){const u=authService.getCurrentUser();if(u?.id!==id||u.role!=='admin_gerencial'||!u.active||u.mustChangePassword||authService.getError())throw new Error('Cadastros e avisos são exclusivos da administração.');}
function item(value:unknown):RecurringAccount{const r=value as RecurringAccount;if(!r||typeof r.id!=='string'||!Number.isSafeInteger(r.version)||r.version<1||!Number.isFinite(Date.parse(r.updatedAt)))throw new Error('Cadastro incompatível.');validateRecurringAccount(r.data);return r;}
export const recurringAccounts={
 async read(userId:string){admin(userId);const data=await coreService.rpc(userId,'pamda_monthly_accounts_read',{});admin(userId);if(!Array.isArray(data))throw new Error('Não foi possível consultar os cadastros.');return data.map(item);},
 async write(userId:string,id:string,data:RecurringAccountData,version:number,key:string){admin(userId);validateRecurringAccount(data);const value=await coreService.rpc(userId,'pamda_monthly_accounts_write',{p_id:id,p_data:data,p_expected_version:version,p_request_key:key},true);admin(userId);const result=item(value);notifyAccountChange();return result;},
 async generate(userId:string,month:string){admin(userId);const generated=await coreService.rpc(userId,'pamda_monthly_accounts_generate',{p_month:month}) as AppliedAccounts;admin(userId);if(!generated||!Array.isArray(generated.expenses)||!Array.isArray(generated.payroll))throw new Error('Não foi possível gerar as contas do mês.');validateMonthlyClosing(mergeRecurringAccounts(createMonthlyClosing(month),generated).data);return generated;},
 async alerts(userId:string,today:string){admin(userId);const value=await coreService.rpc(userId,'pamda_monthly_accounts_alerts',{p_today:today}) as AccountAlerts;admin(userId);if(!value||!(['overdue','today','upcoming','unscheduled'] as const).every(k=>Number.isSafeInteger(value[k])&&value[k]>=0)||value.firstMonth!==null&&!/^\d{4}-\d{2}$/.test(value.firstMonth)||value.checkedOn!==today)throw new Error('Não foi possível conferir os avisos.');return value;},
};
