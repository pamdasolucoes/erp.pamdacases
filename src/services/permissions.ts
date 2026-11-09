import type { User } from '../types/erp';

// The database remains authoritative; never infer a grant from a non-admin role.
export function hasPermission(user: User | null | undefined, key: string): boolean {
 return user?.active === true && !user.mustChangePassword && (user.role === 'admin_gerencial' || user.permissions?.[key] === true);
}
export function hasAnyPermission(user: User | null | undefined, keys: readonly string[]): boolean {
 return keys.some(key => hasPermission(user, key));
}
export const customerReadPermissions = ['customers.manage','customers.shipping.manage','sales.draft','sales.read'] as const;
export const tabPermissions: Readonly<Record<string, readonly string[]>> = {
 dashboard: [], nova_venda: ['sales.draft'], vendas: ['sales.read','sales.confirm','sales.cancel','sales.maintain'],
 clientes: customerReadPermissions, redes: ['customers.manage','sales.read'],
 produtos: ['sales.read','sales.draft','stock.read','products.manage'], kits: ['sales.read','sales.draft','stock.read','products.manage'],
 estoque: ['stock.read','stock.manage'], producao: ['production.read','production.manage'],
 contas_receber: ['finance.read','finance.manage'], fechamentos: ['finance.read','finance.manage'],
 entregas: ['deliveries.manage'], despesas: ['expenses.manage'], compras: ['purchases.manage'], fornecedores: ['purchases.manage'],
 relatorio_vendas: ['reports.read'], relatorio_clientes: ['reports.read'], lucratividade: ['profitability.read'],
 custo_estoque: ['stock.cost'], usuarios: ['users.manage'], logs: ['audit.read'], configuracoes: ['settings.manage'],
};

// Actions enable their required screens/read capabilities. Menus never grant a write action.
export const permissionDependencies: Readonly<Record<string, readonly string[]>> = {
 'customers.manage':['module.clientes'], 'customers.shipping.manage':['module.clientes'],
 'products.manage':['module.produtos'], 'sales.draft':['module.nova_venda'], 'sales.read':['module.vendas'],
 'sales.confirm':['sales.draft','sales.read'], 'sales.cancel':['sales.read'], 'sales.maintain':['sales.read'],
 'sales.discount':['sales.draft'], 'sales.shipping.override':['sales.draft'],
 'stock.read':['module.estoque'], 'stock.manage':['stock.read'], 'stock.cost':['module.custo_estoque'],
 'finance.read':['module.contas_receber'], 'finance.manage':['finance.read'],
 'production.read':['module.producao'], 'production.manage':['production.read'],
 'purchases.manage':['module.compras'], 'expenses.manage':['module.despesas'], 'deliveries.manage':['module.entregas'],
 'reports.read':['module.relatorio_vendas','module.relatorio_clientes'], 'profitability.read':['module.lucratividade'],
 'users.manage':['module.usuarios'], 'audit.read':['module.logs'], 'settings.manage':['module.configuracoes'],
};
export function changePermission(current: Record<string,boolean>, key: string, allowed: boolean): Record<string,boolean> {
 const next = {...current, [key]:allowed};
 const visited = new Set<string>();
 const enable = (item:string) => { if(visited.has(item)) return; visited.add(item); for(const required of permissionDependencies[item] || []) { next[required]=true;enable(required); } };
 if(allowed) enable(key);
 else {
  let changed=true;
  while(changed) {changed=false; for(const [action,required] of Object.entries(permissionDependencies)) {
   if(next[action] && required.some(item=>next[item]===false)) {next[action]=false;changed=true;}
  }}
 }
 return next;
}
export function permissionVersion(user: User): string {
 return JSON.stringify(Object.entries(user.permissions || {}).sort(([a],[b])=>a.localeCompare(b)));
}
