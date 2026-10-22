import React from 'react';
import type {User} from '../../types/erp';
import {canAccessTab} from '../../services/access';
import {PamdaLogo} from '../common/PamdaLogo';
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


const sections=[["Principal",[["dashboard","Dashboard"],["nova_venda","Nova Venda"],["vendas","Todas as Vendas"],["clientes","Clientes e Unidades"]]],["Catálogo e operação",[["produtos","Produtos & Serviços"],["kits","Kits Compostos"],["estoque","Estoque & Movimentos"],["producao","Fila de Produção"]]],["Financeiro",[["contas_receber","Contas a Receber"],["fechamentos","Fechamentos"],["entregas","Fretes & Entregas"],["despesas","Despesas"]]],["Suprimentos",[["compras","Compras & Entradas"],["fornecedores","Fornecedores"]]],["Relatórios",[["relatorio_vendas","Relatório de Vendas"],["relatorio_clientes","Vendas por Cliente"],["lucratividade","Lucratividade Real"],["custo_estoque","Custo de Estoque"]]],["Administração",[["usuarios","Usuários & Acessos"],["logs","Auditoria & Logs"],["configuracoes","Configurações"]]]] as const;
export function Sidebar({currentTab,onSelectTab,currentUser,onLogout,mobileOpen,onCloseMobile}:SidebarProps){return <>
{mobileOpen&&<div className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden" onClick={onCloseMobile}/>}
<aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-white border-r flex flex-col transition-transform lg:translate-x-0 ${mobileOpen?'translate-x-0':'-translate-x-full'}`}>
<div className="p-5 border-b flex justify-between items-center"><PamdaLogo size="sm" variant="dark"/><button className="lg:hidden" onClick={onCloseMobile} aria-label="Fechar menu">×</button></div>
<nav className="flex-1 overflow-auto px-3 py-4 space-y-5">{sections.map(([title,items])=>{const visible=items.filter(([tab])=>canAccessTab(currentUser,tab));return visible.length>0&&<section key={title}><h2 className="px-3 pb-1 text-xs text-slate-400 uppercase font-bold">{title}</h2>{visible.map(([tab,label])=><button key={tab} aria-current={currentTab===tab?'page':undefined} onClick={()=>{onSelectTab(tab);onCloseMobile();}} className={`w-full px-3 py-2 text-sm rounded-xl text-left ${currentTab===tab?'bg-blue-700 text-white font-bold':'text-slate-700 hover:bg-slate-100'}`}>{label}</button>)}</section>;})}</nav>
<div className="border-t p-4 text-sm"><p className="font-bold truncate">{currentUser?.name}</p><button className="mt-2 underline" onClick={onLogout}>Sair</button></div></aside></>; }
