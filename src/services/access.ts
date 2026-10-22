import type { User } from '../types/erp';

const ADMIN_TABS = new Set([
  'contas_receber', 'fechamentos', 'entregas', 'despesas', 'compras', 'fornecedores',
  'lucratividade', 'custo_estoque', 'usuarios', 'logs', 'configuracoes',
]);
const SALES_TABS = new Set([
  'nova_venda', 'vendas', 'produtos', 'kits', 'estoque', 'relatorio_vendas', 'relatorio_clientes',
]);

export function canAccessTab(user: User | null, tab: string): boolean {
  if (!user?.active || user.mustChangePassword) return false;
  if(user.permissions){
    if(user.role==='admin_gerencial')return true;
    if(`module.${tab}` in user.permissions&&user.permissions[`module.${tab}`]!==true)return false;
    const map:Record<string,string>={nova_venda:'sales.draft',vendas:'sales.read',clientes:'customers.manage',produtos:'sales.read',kits:'sales.read',estoque:'stock.read',producao:'production.read',contas_receber:'finance.read',fechamentos:'finance.read',entregas:'deliveries.manage',despesas:'expenses.manage',compras:'purchases.manage',fornecedores:'purchases.manage',relatorio_vendas:'reports.read',relatorio_clientes:'reports.read',lucratividade:'profitability.read',custo_estoque:'stock.cost',usuarios:'users.manage',logs:'audit.read',configuracoes:'settings.manage'};
    return tab==='dashboard'||!!map[tab]&&user.permissions[map[tab]]===true;
  }
  const commercial = user.role === 'admin_gerencial' || user.role === 'venda_atendimento';
  if (tab === 'clientes') return commercial && user.canReadCustomers === true;
  if (['contas_receber', 'fechamentos', 'entregas', 'despesas'].includes(tab)) return user.role === 'admin_gerencial' || user.role === 'financeiro';
  if (tab === 'estoque') return commercial || user.role === 'estoque_expedicao';
  if (tab === 'produtos' || tab === 'kits') return commercial || user.role === 'estoque_expedicao';
  if (ADMIN_TABS.has(tab)) return user.role === 'admin_gerencial';
  if (SALES_TABS.has(tab)) return commercial;
  return tab === 'dashboard' || tab === 'producao';
}
