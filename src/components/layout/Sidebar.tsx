import React from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  Box,
  Layers,
  Factory,
  Wallet,
  ShoppingBag,
  BarChart3,
  ShieldAlert,
  Settings,
  LogOut,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';
import { User } from '../../types/erp';
import { authService } from '../../services/auth';
import { PamdaLogo } from '../common/PamdaLogo';

export type ActiveTab =
  | 'dashboard'
  | 'nova_venda'
  | 'vendas'
  | 'clientes'
  | 'produtos'
  | 'kits'
  | 'estoque'
  | 'producao'
  | 'contas_receber'
  | 'fechamentos'
  | 'entregas'
  | 'despesas'
  | 'compras'
  | 'fornecedores'
  | 'relatorio_vendas'
  | 'relatorio_clientes'
  | 'lucratividade'
  | 'custo_estoque'
  | 'usuarios'
  | 'logs'
  | 'configuracoes';

interface SidebarProps {
  currentTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  currentUser: User | null;
  onLogout: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  currentUser,
  onLogout,
  mobileOpen,
  onCloseMobile,
}) => {
  const isAdmin = currentUser?.role === 'admin_gerencial';
  const isVendas = currentUser?.role === 'venda_atendimento';
  const isProducao = currentUser?.role === 'producao';

  const handleNav = (tab: ActiveTab) => {
    onSelectTab(tab);
    onCloseMobile();
  };

  const roleLabel = {
    admin_gerencial: 'Administrador / Gerencial',
    venda_atendimento: 'Vendas / Atendimento',
    producao: 'Operação Produção',
  }[currentUser?.role || 'venda_atendimento'];

  const roleBadgeColor = {
    admin_gerencial: 'bg-purple-100 text-purple-800 border-purple-200',
    venda_atendimento: 'bg-blue-100 text-blue-800 border-blue-200',
    producao: 'bg-amber-100 text-amber-800 border-amber-200',
  }[currentUser?.role || 'venda_atendimento'];

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 w-64 bg-white border-r border-slate-200 flex flex-col transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header with Official Pamda Logo */}
        <div className="h-18 px-5 border-b border-slate-100 flex items-center justify-between bg-white">
          <div className="flex items-center gap-2">
            <PamdaLogo size="sm" variant="dark" />
            <span className="text-[10px] font-black tracking-widest text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
              ERP
            </span>
          </div>
        </div>

        {/* User Card */}
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900 truncate">
                {currentUser?.name || 'Usuário'}
              </p>
              <span
                className={`inline-block mt-0.5 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${roleBadgeColor}`}
              >
                {roleLabel}
              </span>
            </div>
          </div>
        </div>

        {/* Navigation List */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5 text-xs font-medium">
          {/* Main */}
          <div>
            <div className="px-3 pb-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Principal
            </div>
            <div className="space-y-0.5">
              <button
                onClick={() => handleNav('dashboard')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-colors cursor-pointer ${
                  currentTab === 'dashboard'
                    ? 'bg-blue-600 text-white font-bold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <LayoutDashboard className="w-4 h-4" />
                <span>Dashboard</span>
              </button>
            </div>
          </div>

          {/* Vendas (Admin ou Vendas) */}
          {(isAdmin || isVendas) && (
            <div>
              <div className="px-3 pb-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Comercial
              </div>
              <div className="space-y-0.5">
                <button
                  onClick={() => handleNav('nova_venda')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-colors cursor-pointer ${
                    currentTab === 'nova_venda'
                      ? 'bg-blue-600 text-white font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <ShoppingCart className="w-4 h-4 text-emerald-600" />
                  <span>Nova Venda</span>
                </button>

                <button
                  onClick={() => handleNav('vendas')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-colors cursor-pointer ${
                    currentTab === 'vendas'
                      ? 'bg-blue-600 text-white font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <ShoppingCart className="w-4 h-4" />
                  <span>Todas as Vendas</span>
                </button>

                <button
                  onClick={() => handleNav('clientes')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-colors cursor-pointer ${
                    currentTab === 'clientes'
                      ? 'bg-blue-600 text-white font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>Clientes e Filiais</span>
                </button>
              </div>
            </div>
          )}

          {/* Catálogo & Estoque (Admin ou Vendas) */}
          {(isAdmin || isVendas) && (
            <div>
              <div className="px-3 pb-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Catálogo & Estoque
              </div>
              <div className="space-y-0.5">
                <button
                  onClick={() => handleNav('produtos')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-colors cursor-pointer ${
                    currentTab === 'produtos'
                      ? 'bg-blue-600 text-white font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Box className="w-4 h-4" />
                  <span>Produtos & Serviços</span>
                </button>

                <button
                  onClick={() => handleNav('kits')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-colors cursor-pointer ${
                    currentTab === 'kits'
                      ? 'bg-blue-600 text-white font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Layers className="w-4 h-4" />
                  <span>Kits Compostos</span>
                </button>

                <button
                  onClick={() => handleNav('estoque')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-colors cursor-pointer ${
                    currentTab === 'estoque'
                      ? 'bg-blue-600 text-white font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Box className="w-4 h-4" />
                  <span>Estoque & Movimentos</span>
                </button>
              </div>
            </div>
          )}

          {/* Produção (Acesso para todos, em especial produção) */}
          <div>
            <div className="px-3 pb-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Operacional
            </div>
            <div className="space-y-0.5">
              <button
                onClick={() => handleNav('producao')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-colors cursor-pointer ${
                  currentTab === 'producao'
                    ? 'bg-blue-600 text-white font-bold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Factory className="w-4 h-4 text-amber-500" />
                <span className="flex-1">Fila de Produção</span>
              </button>
            </div>
          </div>

          {/* Financeiro (Admin ou Vendas com restrições) */}
          {isAdmin && (
            <div>
              <div className="px-3 pb-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Financeiro
              </div>
              <div className="space-y-0.5">
                <button
                  onClick={() => handleNav('contas_receber')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-colors cursor-pointer ${
                    currentTab === 'contas_receber'
                      ? 'bg-blue-600 text-white font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Wallet className="w-4 h-4 text-emerald-600" />
                  <span>Contas a Receber</span>
                </button>

                <button
                  onClick={() => handleNav('fechamentos')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-colors cursor-pointer ${
                    currentTab === 'fechamentos'
                      ? 'bg-blue-600 text-white font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Wallet className="w-4 h-4" />
                  <span>Fechamentos</span>
                </button>

                <button
                  onClick={() => handleNav('entregas')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-colors cursor-pointer ${
                    currentTab === 'entregas'
                      ? 'bg-blue-600 text-white font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Wallet className="w-4 h-4" />
                  <span>Frete & Entregas</span>
                </button>

                <button
                  onClick={() => handleNav('despesas')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-colors cursor-pointer ${
                    currentTab === 'despesas'
                      ? 'bg-blue-600 text-white font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Wallet className="w-4 h-4 text-rose-500" />
                  <span>Despesas</span>
                </button>
              </div>
            </div>
          )}

          {/* Compras (Admin) */}
          {isAdmin && (
            <div>
              <div className="px-3 pb-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Suprimentos
              </div>
              <div className="space-y-0.5">
                <button
                  onClick={() => handleNav('compras')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-colors cursor-pointer ${
                    currentTab === 'compras'
                      ? 'bg-blue-600 text-white font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>Compras & Entradas</span>
                </button>
                <button
                  onClick={() => handleNav('fornecedores')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-colors cursor-pointer ${
                    currentTab === 'fornecedores'
                      ? 'bg-blue-600 text-white font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>Fornecedores</span>
                </button>
              </div>
            </div>
          )}

          {/* Relatórios */}
          {(isAdmin || isVendas) && (
            <div>
              <div className="px-3 pb-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Relatórios
              </div>
              <div className="space-y-0.5">
                <button
                  onClick={() => handleNav('relatorio_vendas')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-colors cursor-pointer ${
                    currentTab === 'relatorio_vendas'
                      ? 'bg-blue-600 text-white font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <BarChart3 className="w-4 h-4" />
                  <span>Relatório de Vendas</span>
                </button>
                <button
                  onClick={() => handleNav('relatorio_clientes')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-colors cursor-pointer ${
                    currentTab === 'relatorio_clientes'
                      ? 'bg-blue-600 text-white font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <BarChart3 className="w-4 h-4" />
                  <span>Vendas por Cliente</span>
                </button>
              </div>
            </div>
          )}

          {/* MÓDULO GERENCIAL (Exclusivo Admin) */}
          {isAdmin && (
            <div className="pt-2 border-t border-purple-100">
              <div className="px-3 pb-1 text-[11px] font-bold text-purple-600 uppercase tracking-wider flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" />
                Gerencial
              </div>
              <div className="space-y-0.5">
                <button
                  onClick={() => handleNav('lucratividade')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-colors cursor-pointer ${
                    currentTab === 'lucratividade'
                      ? 'bg-purple-600 text-white font-bold shadow-xs'
                      : 'text-purple-900 hover:bg-purple-50'
                  }`}
                >
                  <TrendingUp className="w-4 h-4" />
                  <span>Lucratividade Real</span>
                </button>

                <button
                  onClick={() => handleNav('usuarios')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-colors cursor-pointer ${
                    currentTab === 'usuarios'
                      ? 'bg-purple-600 text-white font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>Usuários & Acessos</span>
                </button>

                <button
                  onClick={() => handleNav('logs')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-colors cursor-pointer ${
                    currentTab === 'logs'
                      ? 'bg-purple-600 text-white font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <ShieldAlert className="w-4 h-4" />
                  <span>Auditoria & Logs</span>
                </button>

                <button
                  onClick={() => handleNav('configuracoes')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-colors cursor-pointer ${
                    currentTab === 'configuracoes'
                      ? 'bg-purple-600 text-white font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Settings className="w-4 h-4" />
                  <span>Configurações</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer with Logout */}
        <div className="p-3 border-t border-slate-100 bg-white">
          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-rose-600 hover:bg-rose-50 rounded-xl font-semibold text-xs transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Sair do ERP</span>
          </button>
        </div>
      </aside>
    </>
  );
};
