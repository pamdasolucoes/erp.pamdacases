import React from 'react';
import type {User} from '../../types/erp';
import {canAccessTab} from '../../services/access';
import {PamdaLogo} from '../common/PamdaLogo';
export type ActiveTab =
  | 'dashboard'
  | 'nova_venda'
  | 'vendas'
  | 'clientes'
  | 'redes'
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


const sections=[["Principal",[["dashboard","Dashboard"],["nova_venda","Nova Venda"],["vendas","Pendências"],["clientes","Clientes e Unidades"],["redes","Rede de Lojas"]]],["Catálogo e operação",[["produtos","Produtos & Serviços"],["kits","Kits Compostos"],["estoque","Estoque & Movimentos"],["producao","Fila de Produção"]]],["Financeiro",[["contas_receber","Contas a Receber"],["fechamentos","Fechamentos"],["entregas","Fretes & Entregas"],["despesas","Despesas"]]],["Suprimentos",[["compras","Compras & Entradas"],["fornecedores","Fornecedores"]]],["Relatórios",[["relatorio_vendas","Relatório de Vendas"],["relatorio_clientes","Vendas por Cliente"],["lucratividade","Lucratividade Real"],["custo_estoque","Custo de Estoque"]]],["Administração",[["usuarios","Usuários & Acessos"],["logs","Auditoria & Logs"],["configuracoes","Configurações"]]]] as const;
export function Sidebar({currentTab,onSelectTab,currentUser,onLogout,mobileOpen,onCloseMobile}:SidebarProps){return <>
{mobileOpen&&<div className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden" onClick={onCloseMobile}/>}
<aside className={`fixed inset-y-0 left-0 z-40 erp-sidebar w-64 border-r flex flex-col transition-transform lg:translate-x-0 ${mobileOpen?'translate-x-0':'-translate-x-full'}`}>
<div className="sidebar-brand relative px-5 py-7 border-b flex justify-center items-center"><PamdaLogo size="md" variant="dark"/><button className="absolute right-3 top-3 lg:hidden text-white text-2xl" onClick={onCloseMobile} aria-label="Fechar menu">×</button></div>
<nav className="flex-1 overflow-auto px-3 py-4 space-y-5">{sections.map(([title,items])=>{const visible=items.filter(([tab])=>canAccessTab(currentUser,tab));return visible.length>0&&<section key={title}><h2 className="px-3 pb-1 text-xs text-emerald-100/45 uppercase font-bold tracking-widest">{title}</h2>{visible.map(([tab,label])=><button key={tab} aria-current={currentTab===tab?'page':undefined} onClick={()=>{onSelectTab(tab);onCloseMobile();}} className={`w-full px-3 py-2 text-sm rounded-xl text-left ${currentTab===tab?'sidebar-active text-white font-bold':'text-emerald-50/80 hover:bg-white/10'}`}>{label}</button>)}</section>;})}</nav>
<div className="border-t border-white/10 p-4 text-sm text-emerald-50"><p className="font-bold truncate">{currentUser?.name}</p><button className="mt-2 text-emerald-100/70 hover:text-white" onClick={onLogout}>Sair</button></div></aside></>; }
