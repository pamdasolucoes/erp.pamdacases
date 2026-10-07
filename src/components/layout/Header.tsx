import React from 'react';
import { Menu, Plus, Bell, Shield, User as UserIcon } from 'lucide-react';
import { User } from '../../types/erp';
import { authService } from '../../services/auth';
import { PamdaLogo } from '../common/PamdaLogo';

interface HeaderProps {
  currentUser: User | null;
  onOpenMobileMenu: () => void;
  onNewSaleClick?: () => void;
  title: string;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  onOpenMobileMenu,
  onNewSaleClick,
  title,
}) => {
  const isAdmin = currentUser?.role === 'admin_gerencial';

  return (
    <header className="sticky top-0 z-30 h-16 bg-white/90 backdrop-blur-md border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobileMenu}
          className="p-2 -ml-2 text-slate-500 hover:text-slate-800 lg:hidden rounded-lg hover:bg-slate-100 cursor-pointer"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="lg:hidden block">
          <PamdaLogo size="sm" variant="dark" />
        </div>

        <div className="hidden lg:block">
          <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
            {title}
          </h2>
          <p className="text-[11px] text-slate-400">
            Ambiente B2B Pamda Cases • Curitiba/PR
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {onNewSaleClick && currentUser?.role !== 'producao' && (
          <button
            onClick={onNewSaleClick}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Nova Venda</span>
          </button>
        )}

        <div className="h-6 w-px bg-slate-200 mx-1 hidden sm:block" />

        <div className="flex items-center gap-2 pl-1">
          {/* Quick role switcher for testing */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-xl text-[10px] font-bold border border-slate-200">
            <button
              type="button"
              onClick={() => {
                const adminUser = authService.getUsers().find((u) => u.role === 'admin_gerencial');
                if (adminUser) authService.switchUser(adminUser.id);
              }}
              className={`px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                currentUser?.role === 'admin_gerencial'
                  ? 'bg-purple-700 text-white shadow-2xs font-extrabold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Testar como Administrador Gerencial (acesso a todas as métricas)"
            >
              Admin
            </button>
            <button
              type="button"
              onClick={() => {
                const vendedorUser = authService.getUsers().find((u) => u.role === 'venda_atendimento');
                if (vendedorUser) authService.switchUser(vendedorUser.id);
              }}
              className={`px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                currentUser?.role === 'venda_atendimento'
                  ? 'bg-blue-600 text-white shadow-2xs font-extrabold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Testar como Vendedor (métricas restritas conforme permissão)"
            >
              Vendedor
            </button>
            <button
              type="button"
              onClick={() => {
                const prodUser = authService.getUsers().find((u) => u.role === 'producao');
                if (prodUser) authService.switchUser(prodUser.id);
              }}
              className={`px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                currentUser?.role === 'producao'
                  ? 'bg-amber-600 text-white shadow-2xs font-extrabold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Testar como Operador Produção"
            >
              Produção
            </button>
          </div>

          <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs uppercase shadow-xs">
            {currentUser?.username.substring(0, 2).toUpperCase() || 'AD'}
          </div>
          <div className="hidden md:block text-left">
            <p className="text-xs font-bold text-slate-900 leading-tight">
              {currentUser?.name || 'Administrador'}
            </p>
            <p className="text-[10px] text-slate-500 capitalize">
              {currentUser?.role === 'admin_gerencial'
                ? 'Gerencial'
                : currentUser?.role === 'venda_atendimento'
                ? 'Vendas'
                : 'Produção'}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
};
