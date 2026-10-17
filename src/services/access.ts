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
  const commercial = user.role === 'admin_gerencial' || user.role === 'venda_atendimento';
  if (tab === 'clientes') return commercial && user.canReadCustomers === true;
  if (ADMIN_TABS.has(tab)) return user.role === 'admin_gerencial';
  if (SALES_TABS.has(tab)) return commercial;
  return tab === 'dashboard' || tab === 'producao';
}
