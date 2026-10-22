import React from 'react';
import { Menu } from 'lucide-react';
import { User } from '../../types/erp';
import { PamdaLogo } from '../common/PamdaLogo';

interface HeaderProps {
  currentUser: User | null;
  onOpenMobileMenu: () => void;
  title: string;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  onOpenMobileMenu,
  title,
}) => {
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
        <div className="flex items-center gap-2 pl-1">
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
                : currentUser?.role === 'financeiro' ? 'Financeiro'
                : currentUser?.role === 'estoque_expedicao' ? 'Estoque / Expedição' : 'Produção'}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
};
