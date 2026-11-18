import type {MonthlyExpense} from './monthlyClosing';
export type PayrollPart='salary'|'advance'|'vt'|'vr';
export interface MonthlyPayroll {
 id:string;templateId:string;name:string;baseSalaryCents:number;advanceCents:number;extraCents:number;otherReductionCents:number;
 divisorDays100:number;absenceDays100:number;vtDays100:number;vtRateCents:number;vrDays100:number;vrRateCents:number;
 confirmed:boolean;dueDays:Record<PayrollPart,number|null>;sourceNote?:string;
}
export interface RecurringAccountData {
 name:string;kind:'account'|'payroll'|'thales'|'courier';category:'fixed'|'tax'|'salary'|'advance'|'vt'|'vr'|'other';
 amountCents:number;variable:boolean;dueDay:number|null;remindDays:number;active:boolean;fromMonth:string;untilMonth:string|null;notes:string;
 payroll?:Omit<MonthlyPayroll,'id'|'templateId'|'confirmed'>;
}
export interface RecurringAccount {id:string;version:number;data:RecurringAccountData;updatedAt:string;}
export interface AccountReminder {
 month:string;expenseId:string;description:string;dueDate:string;amountCents:number;paidCents:number;balanceCents:number;
 confirmed:boolean;status:'overdue'|'today'|'upcoming'|'unscheduled';
}
export interface AppliedAccounts {expenses:MonthlyExpense[];payroll:MonthlyPayroll[];}
