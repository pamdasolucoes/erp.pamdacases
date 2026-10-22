import React, { useCallback, useEffect, useState } from 'react';
import { ShoppingCart, DollarSign, Calendar, Clock, Package, Lock, Plus, RefreshCw, ArrowRight } from 'lucide-react';
import type { ActiveTab } from '../components/layout/Sidebar';
import type { ErpSummary } from '../types/core';
import { coreService } from '../services/coreService';
import { authService } from '../services/auth';
import { canAccessTab } from '../services/access';
import { formatMoney } from '../services/salePricing';

export function OfficialDashboard({ onNavigate }: { onNavigate(tab: ActiveTab): void }) {
  const user = authService.getCurrentUser()!;
  const [summary, setSummary] = useState<ErpSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt(value => value + 1), []);
  const financial = summary?.financialAuthorized === true;
  useEffect(() => {
    let alive = true;
    setLoading(true); setError(''); setSummary(null);
    void coreService.summary(user.id).then(
      value => { if (alive) setSummary(value); },
      reason => { if (alive) setError(reason instanceof Error ? reason.message : 'Não foi possível consultar o resumo oficial.'); },
    ).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [user, attempt]);
  useEffect(() => { window.addEventListener('focus', reload); return () => window.removeEventListener('focus', reload); }, [reload]);
  const metric = (key: keyof ErpSummary, currency = false) => {
    if (loading) return 'Carregando…';
    if (error) return 'Indisponível';
    const value = summary?.[key];
    return value === null || value === undefined ? 'Não configurado' : currency ? formatMoney(value as number) : String(value);
  };
  const cards: { key: keyof ErpSummary; title: string; currency?: boolean; icon: typeof ShoppingCart; tab?: ActiveTab }[] = [
    { key: 'pending_sales', title: 'Pedidos pendentes', icon: ShoppingCart, tab: 'vendas' },
    { key: 'confirmed_sales', title: 'Vendas confirmadas', icon: ShoppingCart, tab: 'vendas' },
    { key: 'cancelled_sales', title: 'Vendas canceladas', icon: Clock, tab: 'vendas' },
    { key: 'official_receipts', title: 'Recibos oficiais', icon: ShoppingCart },
    ...(financial ? [
      { key: 'confirmed_revenue_today' as const, title: 'Faturamento hoje', icon: DollarSign, currency: true },
      { key: 'confirmed_revenue_month' as const, title: 'Faturamento no mês', icon: DollarSign, currency: true },
      { key: 'receivables_balance' as const, title: 'Contas a receber', icon: DollarSign, currency: true },
    ] : []),
    { key: 'production_queue_count', title: 'Fila de produção', icon: Clock, tab: 'producao' },
    { key: 'catalog_active', title: 'Itens ativos no catálogo', icon: Package, tab: 'produtos' },
    { key: 'physical_items', title: 'Produtos físicos', icon: Package, tab: 'produtos' },
    { key: 'physical_stock_verified', title: 'Estoques conferidos', icon: Package, tab: 'estoque' },
  ];
  return <div className="space-y-6">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div><h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Dashboard Geral</h1><p className="text-xs text-slate-500">Painel operacional da Pamda Cases · PAMDA CORE</p></div>
      <div className="flex flex-wrap gap-2 items-center"><button type="button" disabled={loading} onClick={reload} className="px-3 py-2 border bg-white rounded-xl text-xs font-bold flex gap-2 items-center disabled:opacity-50"><RefreshCw className="w-4 h-4"/>Atualizar painel</button>{summary&&<span className="px-3 py-2 bg-white border rounded-xl text-xs flex gap-2 items-center"><Calendar className="w-4 h-4 text-blue-600"/>{new Date(summary.asOf).toLocaleString('pt-BR')}</span>}{!financial&&<span className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex gap-2"><Lock className="w-4 h-4"/>Visão operacional · dados financeiros restritos</span>}</div>
    </div>
    {loading&&<p role="status" className="text-sm text-slate-500">Consultando resumo oficial…</p>}
    {error&&<p role="alert" className="rounded-xl bg-rose-50 border border-rose-200 p-4 text-sm text-rose-800">{error} Use Atualizar painel para tentar novamente.</p>}
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 sm:gap-4">{cards.map(card=>{
      const Icon=card.icon;const target=card.tab&&canAccessTab(user,card.tab)?card.tab:null;
      return <div key={card.key} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between gap-2"><div><p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{card.title}</p><p data-testid={`summary-${card.key}`} className="text-xl sm:text-2xl font-black text-slate-900 mt-1">{metric(card.key,card.currency)}</p>{target&&<button type="button" onClick={()=>onNavigate(target)} className="mt-2 text-xs font-bold text-blue-700">Consultar</button>}</div><span className="w-10 h-10 shrink-0 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center"><Icon className="w-5 h-5"/></span></div>;
    })}</div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <section className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-5 space-y-4"><h2 className="font-bold text-slate-900">Situação dos pedidos</h2><div className="grid sm:grid-cols-2 gap-4"><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Pendentes com histórico de produtos</p><p className="text-xl font-black mt-1">{metric('pending_with_product_history')}</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Pendentes nunca utilizadas com produtos</p><p className="text-xl font-black mt-1">{metric('pending_never_with_product')}</p></div></div><p className="text-xs text-amber-800">Indicadores calculados a partir das operações reais.</p><p className="text-xs text-slate-500">Confira o estoque físico antes de iniciar as vendas. Os relatórios detalhados estão disponíveis no menu.</p></section>
      <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3"><h2 className="font-bold text-slate-900">Acesso rápido</h2>{([{tab:'nova_venda',label:'Nova Venda',icon:Plus},{tab:'vendas',label:'Pendências',icon:ShoppingCart},{tab:'clientes',label:'Clientes e Unidades',icon:ArrowRight}] as const).filter(action=>canAccessTab(user,action.tab)).map(action=><button key={action.tab} type="button" onClick={()=>onNavigate(action.tab)} className="w-full flex gap-2 items-center bg-slate-50 hover:bg-blue-50 rounded-xl p-3 text-sm font-bold text-blue-700"><action.icon className="w-4 h-4"/>{action.label}</button>)}</section>
    </div>
  </div>;
}
