export interface MonthlyRules {
  pamBps:number; pamMinimumCents:number; reserveBps:number;
  thalesCents:number; thalesFrom:string; thalesUntil:string|null;
}
export interface MonthlyExpense {id:string;description:string;reference:string;amountCents:number;reductionCents:number;dueDate:string;paidCents:number;paidOn:string;}
export interface MonthlyMovement {id:string;date:string;description:string;amountCents:number;}
export interface CourierEntry {id:string;date:string;name:string;quantity:number;rateCents:number;gasCents:number;cashCents:number;advanceCents:number;paidCents:number;}
export interface TimeEntry {id:string;date:string;name:string;start:string;end:string;breakMinutes:number;expectedMinutes:number;hourCents:number;extraHourCents:number;}
export interface ShopSnapshot {id:string;start:string;end:string;capturedAt:string;saleCount:number;pendingCostCount:number;profitCents:number|null;shippingCents:number;}
export interface MonthlyClosingData {
  month:string;start:string;end:string;rules:MonthlyRules;
  shop:{mode:'erp'|'manual';snapshot:ShopSnapshot|null;profitCents:number;shippingCents:number;reason:string;};
  expenses:MonthlyExpense[];shopeeReceipts:MonthlyMovement[];shopeeCosts:MonthlyMovement[];
  couriers:CourierEntry[];timeEntries:TimeEntry[];withdrawalDeductions:MonthlyMovement[];
  payments:{thalesCents:number;thalesOn:string;pamCents:number;pamOn:string;withdrawalCents:number;withdrawalOn:string;};
  notes:string;
}
export interface MonthlyClosingRecord {month:string;version:number;status:'draft'|'closed';data:MonthlyClosingData;totals:MonthlyTotals;updatedAt:string;closedAt:string|null;}
export interface MonthlyTotals {
  expensesCents:number;expensesPaidCents:number;expensesBalanceCents:number;thalesCents:number;thalesBalanceCents:number;
  shopeeReceivedCents:number;shopeeCostCents:number;shopeeProfitCents:number;
  courierCostCents:number;courierDueCents:number;courierPaidCents:number;courierBalanceCents:number;
  totalOutflowsCents:number;shopProfitCents:number|null;shopShippingCents:number|null;shopTotalCents:number|null;
  netProfitCents:number|null;pamCents:number|null;pamBalanceCents:number|null;reserveCents:number|null;
  withdrawalCents:number|null;withdrawalBalanceCents:number|null;deductionsCents:number;
  workedMinutes:number;expectedMinutes:number;extraMinutes:number;missingMinutes:number;timeValueCents:number;
}
export interface MonthlyClosingRead {record:MonthlyClosingRecord|null;defaults:MonthlyRules|null;months:{month:string;status:'draft'|'closed';version:number}[];}
