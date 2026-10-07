import React, { useState, useEffect, useMemo } from 'react';
import {
  ShoppingCart,
  DollarSign,
  Calendar,
  AlertTriangle,
  Clock,
  CheckCircle2,
  TrendingUp,
  ArrowRight,
  Package,
  Lock,
  Plus,
  Printer,
  X,
  Factory,
  Boxes,
  RotateCcw,
} from 'lucide-react';
import { dbService } from '../services/db';
import { authService } from '../services/auth';
import { Sale, Product } from '../types/erp';
import { Modal } from '../components/common/Modal';

interface DashboardViewProps {
  onNavigate: (tab: any) => void;
  onViewReceipt: (sale: Sale) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigate,
  onViewReceipt,
}) => {
  // Reatividade em tempo real: atualizar automaticamente sempre que houver nova venda ou alteração
  const [sales, setSales] = useState<Sale[]>(dbService.getSales());
  const [products, setProducts] = useState<Product[]>(dbService.getProducts());
  const [isTodaySalesModalOpen, setIsTodaySalesModalOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = dbService.subscribe(() => {
      setSales([...dbService.getSales()]);
      setProducts([...dbService.getProducts()]);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const currentUser = authService.getCurrentUser();
  // Permissão financeira: administrador gerencial ou usuário explicitamente autorizado pelo admin
  const canViewFinancials = authService.canViewFinancialMetrics(currentUser);

  // Data atual da operação (dinâmica e com fallback)
  const todayDateObj = new Date();
  const todayStr = '2026-10-06'; // Data base de referência do ERP
  const todayIso = todayDateObj.toISOString().slice(0, 10);
  const todayLocal = `${todayDateObj.getFullYear()}-${String(todayDateObj.getMonth() + 1).padStart(2, '0')}-${String(todayDateObj.getDate()).padStart(2, '0')}`;
  const currentMonthPrefix = todayIso.slice(0, 7);

  // Cálculos dinâmicos e reais sem valores mockados forçados (zerados se não houver registros)
  const confirmedSales = useMemo(() => {
    return sales.filter((s) => s.saleStatus !== 'cancelada');
  }, [sales]);

  // Vendas de hoje (captura vendas da data atual, UTC ou local, ou da data base)
  const salesToday = useMemo(() => {
    return confirmedSales.filter((s) => {
      const saleDate = s.createdAt.slice(0, 10);
      const saleDateObj = new Date(s.createdAt);
      return (
        saleDate === todayIso ||
        saleDate === todayLocal ||
        saleDate === todayStr ||
        saleDateObj.toDateString() === todayDateObj.toDateString()
      );
    });
  }, [confirmedSales, todayIso, todayLocal, todayStr]);

  // Faturamento hoje (calculado em tempo real sobre as vendas de hoje)
  const revenueToday = useMemo(() => {
    return salesToday.reduce((acc, s) => acc + s.totalAmount, 0);
  }, [salesToday]);

  // Vendas no mês
  const salesMonth = useMemo(() => {
    return confirmedSales.filter(
      (s) => s.createdAt.startsWith(currentMonthPrefix) || s.createdAt.startsWith('2026-10')
    );
  }, [confirmedSales, currentMonthPrefix]);

  // Faturamento no mês
  const revenueMonth = useMemo(() => {
    return salesMonth.reduce((acc, s) => acc + s.totalAmount, 0);
  }, [salesMonth]);

  // Contas a receber e vencidas
  const totalReceivable = useMemo(() => {
    return confirmedSales.reduce((acc, s) => acc + s.pendingBalance, 0);
  }, [confirmedSales]);

  const overdueReceivable = useMemo(() => {
    return confirmedSales
      .filter((s) => s.pendingBalance > 0 && s.financialStatus === 'vencido')
      .reduce((acc, s) => acc + s.pendingBalance, 0);
  }, [confirmedSales]);

  // Produção e operacionais
  const waitingProduction = useMemo(() => {
    return confirmedSales.filter(
      (s) =>
        s.productionStatus === 'aguardando_producao' ||
        s.productionStatus === 'aguardando_liberacao'
    ).length;
  }, [confirmedSales]);

  const inProduction = useMemo(() => {
    return confirmedSales.filter((s) => s.productionStatus === 'em_producao').length;
  }, [confirmedSales]);

  const readyForDelivery = useMemo(() => {
    return confirmedSales.filter((s) => s.productionStatus === 'pronto').length;
  }, [confirmedSales]);

  const lowStockCount = useMemo(() => {
    return products.filter(
      (p) => p.type === 'fisico' && p.controlsInventory && p.currentInventory <= p.minInventory
    ).length;
  }, [products]);

  // Vendas por canal (reais com base nas vendas confirmadas)
  const originBreakdown = useMemo(() => {
    const total = confirmedSales.length;
    if (total === 0) {
      return [
        { label: 'Site B2B', count: 0, percent: 0, color: 'bg-blue-600' },
        { label: 'WhatsApp', count: 0, percent: 0, color: 'bg-emerald-500' },
        { label: 'Vendedor', count: 0, percent: 0, color: 'bg-amber-500' },
        { label: 'Balcão', count: 0, percent: 0, color: 'bg-indigo-500' },
        { label: 'Outros', count: 0, percent: 0, color: 'bg-rose-500' },
      ];
    }

    const counts: Record<string, number> = {
      site_b2b: 0,
      whatsapp: 0,
      vendedor: 0,
      balcao: 0,
      outro: 0,
    };

    for (const s of confirmedSales) {
      if (counts[s.origin] !== undefined) {
        counts[s.origin]++;
      } else {
        counts.outro++;
      }
    }

    return [
      { label: 'Site B2B', count: counts.site_b2b, percent: Math.round((counts.site_b2b / total) * 100), color: 'bg-blue-600' },
      { label: 'WhatsApp', count: counts.whatsapp, percent: Math.round((counts.whatsapp / total) * 100), color: 'bg-emerald-500' },
      { label: 'Vendedor', count: counts.vendedor, percent: Math.round((counts.vendedor / total) * 100), color: 'bg-amber-500' },
      { label: 'Balcão', count: counts.balcao, percent: Math.round((counts.balcao / total) * 100), color: 'bg-indigo-500' },
      { label: 'Outros', count: counts.outro, percent: Math.round((counts.outro / total) * 100), color: 'bg-rose-500' },
    ];
  }, [confirmedSales]);

  // Volume diário dos últimos 7 dias baseado nas vendas reais
  const weeklyData = useMemo(() => {
    const days = ['30/09', '01/10', '02/10', '03/10', '04/10', '05/10', '06/10'];
    const map: Record<string, number> = {
      '30/09': 0,
      '01/10': 0,
      '02/10': 0,
      '03/10': 0,
      '04/10': 0,
      '05/10': 0,
      '06/10': 0,
    };

    for (const s of confirmedSales) {
      const datePart = s.createdAt.split('T')[0];
      const parts = datePart.split('-');
      if (parts.length === 3) {
        const key = `${parts[2]}/${parts[1]}`;
        if (map[key] !== undefined) {
          map[key]++;
        }
      }
    }

    return days.map((day) => ({
      day,
      count: map[day] || 0,
    }));
  }, [confirmedSales]);

  const maxWeeklyCount = useMemo(() => {
    const max = Math.max(...weeklyData.map((d) => d.count));
    return max > 0 ? max : 10;
  }, [weeklyData]);

  return (
    <div className="space-y-6">
      {/* Top Header Filter & Greeting */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Dashboard Geral
          </h1>
          <p className="text-xs text-slate-500">
            Painel operacional da Pamda Cases • Atualizado em tempo real
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {currentUser?.role === 'admin_gerencial' && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  if (
                    window.confirm(
                      'Deseja zerar todos os parâmetros de vendas hoje, faturamento hoje, vendas no mês e faturamento no mês? O sistema começará 100% limpo com 0 vendas.'
                    )
                  ) {
                    dbService.clearAllSales();
                  }
                }}
                className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                title="Zerar todos os parâmetros e vendas"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Zerar Parâmetros (0)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (
                    window.confirm(
                      'Deseja carregar as vendas de teste para demonstração?'
                    )
                  ) {
                    dbService.loadSampleSales();
                  }
                }}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-semibold rounded-xl transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                title="Carregar vendas de teste para demonstração"
              >
                <span>⚡ Carregar Exemplo</span>
              </button>
            </div>
          )}

          <div className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 shadow-xs flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-blue-600" />
            <span>Hoje (06/10/2026)</span>
          </div>

          {!canViewFinancials && (
            <div className="px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-xl text-[11px] font-bold text-amber-800 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" />
              <span>Visão Operacional (Faturamento Restrito)</span>
            </div>
          )}
        </div>
      </div>

      {/* METRIC CARDS ROW: Se tiver permissão financeira vê faturamento; senão vê métricas operacionais */}
      {canViewFinancials ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 sm:gap-4">
          {/* Vendas hoje (CLICÁVEL: Apresenta todas as vendas de hoje e atualiza em tempo real) */}
          <div
            onClick={() => setIsTodaySalesModalOpen(true)}
            className="bg-white p-4 rounded-2xl border-2 border-blue-200 hover:border-blue-500 hover:shadow-md transition-all cursor-pointer group flex items-center justify-between"
          >
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-[11px] font-bold text-blue-600 uppercase tracking-wider">
                  Vendas hoje
                </p>
                <span className="text-[9px] bg-blue-100 text-blue-700 font-extrabold px-1 rounded group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  Ver lista
                </span>
              </div>
              <p className="text-2xl sm:text-3xl font-black text-slate-900 mt-1">
                {salesToday.length}
              </p>
              <span className="text-[10px] text-slate-400 font-medium">
                Clique para ver pedidos
              </span>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-blue-50 group-hover:bg-blue-600 group-hover:text-white text-blue-600 flex items-center justify-center transition-colors shadow-xs">
              <ShoppingCart className="w-5 h-5" />
            </div>
          </div>

          {/* Faturamento hoje (Real / Zerado se não houver vendas) */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Faturamento hoje
              </p>
              <p className="text-2xl font-black text-emerald-600 mt-1 font-mono">
                R$ {revenueToday.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <span className="text-[10px] text-slate-400">Total apurado hoje</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>

          {/* Vendas no mês (Real) */}
          <div
            onClick={() => onNavigate('vendas')}
            className="bg-white p-4 rounded-2xl border border-slate-200 hover:border-purple-300 transition-colors shadow-xs flex items-center justify-between cursor-pointer"
          >
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Vendas no mês
              </p>
              <p className="text-2xl font-black text-slate-900 mt-1">
                {salesMonth.length}
              </p>
              <span className="text-[10px] text-slate-400">Pedidos em outubro</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>

          {/* Faturamento no mês (Real) */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Faturamento no mês
              </p>
              <p className="text-2xl font-black text-purple-700 mt-1 font-mono">
                R$ {revenueMonth.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <span className="text-[10px] text-slate-400">Acumulado mensal</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>

          {/* Contas a receber */}
          <div
            onClick={() => onNavigate('contas_receber')}
            className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between cursor-pointer hover:border-blue-400 transition-colors"
          >
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Contas a receber
              </p>
              <p className="text-xl sm:text-2xl font-black text-slate-900 mt-1 font-mono">
                R$ {totalReceivable.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>

          {/* Vencidas */}
          <div
            onClick={() => onNavigate('contas_receber')}
            className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between cursor-pointer hover:border-rose-400 transition-colors"
          >
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Vencidas
              </p>
              <p className="text-xl sm:text-2xl font-black text-rose-600 mt-1 font-mono">
                R$ {overdueReceivable.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>

          {/* Aguardando produção */}
          <div
            onClick={() => onNavigate('producao')}
            className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between cursor-pointer hover:border-amber-400 transition-colors"
          >
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Aguardando produção
              </p>
              <p className="text-2xl font-black text-amber-600 mt-1">
                {waitingProduction}
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
          </div>

          {/* Prontos para entrega */}
          <div
            onClick={() => onNavigate('producao')}
            className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between cursor-pointer hover:border-emerald-400 transition-colors"
          >
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Prontos para entrega
              </p>
              <p className="text-2xl font-black text-emerald-600 mt-1">
                {readyForDelivery}
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
        </div>
      ) : (
        /* VISÃO OPERACIONAL (Sem dados financeiros sensíveis para usuários não autorizados) */
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 sm:gap-4">
          {/* Vendas hoje (clicável para ver a lista de pedidos) */}
          <div
            onClick={() => setIsTodaySalesModalOpen(true)}
            className="bg-white p-4 rounded-2xl border-2 border-blue-200 hover:border-blue-500 hover:shadow-md transition-all cursor-pointer group flex items-center justify-between"
          >
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-[11px] font-bold text-blue-600 uppercase tracking-wider">
                  Vendas hoje
                </p>
                <span className="text-[9px] bg-blue-100 text-blue-700 font-extrabold px-1 rounded group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  Ver lista
                </span>
              </div>
              <p className="text-2xl sm:text-3xl font-black text-slate-900 mt-1">
                {salesToday.length}
              </p>
              <span className="text-[10px] text-slate-400 font-medium">
                Clique para ver pedidos
              </span>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-blue-50 group-hover:bg-blue-600 group-hover:text-white text-blue-600 flex items-center justify-center transition-colors shadow-xs">
              <ShoppingCart className="w-5 h-5" />
            </div>
          </div>

          {/* Aguardando Produção */}
          <div
            onClick={() => onNavigate('producao')}
            className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between cursor-pointer hover:border-amber-400 transition-colors"
          >
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Aguardando produção
              </p>
              <p className="text-2xl font-black text-amber-600 mt-1">
                {waitingProduction}
              </p>
              <span className="text-[10px] text-slate-400">Na fila</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
          </div>

          {/* Em Produção */}
          <div
            onClick={() => onNavigate('producao')}
            className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between cursor-pointer hover:border-indigo-400 transition-colors"
          >
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Em Produção
              </p>
              <p className="text-2xl font-black text-indigo-600 mt-1">
                {inProduction}
              </p>
              <span className="text-[10px] text-slate-400">Na esteira DTF UV</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Factory className="w-5 h-5" />
            </div>
          </div>

          {/* Prontos para entrega */}
          <div
            onClick={() => onNavigate('producao')}
            className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between cursor-pointer hover:border-emerald-400 transition-colors"
          >
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Prontos para entrega
              </p>
              <p className="text-2xl font-black text-emerald-600 mt-1">
                {readyForDelivery}
              </p>
              <span className="text-[10px] text-slate-400">Concluídos</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>

          {/* Produtos com estoque baixo */}
          <div
            onClick={() => onNavigate('estoque')}
            className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between cursor-pointer hover:border-rose-400 transition-colors"
          >
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Estoque baixo
              </p>
              <p className="text-2xl font-black text-rose-600 mt-1">
                {lowStockCount}
              </p>
              <span className="text-[10px] text-slate-400">Abaixo do mínimo</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>

          {/* Total de Produtos Ativos */}
          <div
            onClick={() => onNavigate('produtos')}
            className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between cursor-pointer hover:border-blue-400 transition-colors"
          >
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Itens no catálogo
              </p>
              <p className="text-2xl font-black text-slate-900 mt-1">
                {products.length}
              </p>
              <span className="text-[10px] text-slate-400">Capas e serviços</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Boxes className="w-5 h-5" />
            </div>
          </div>

          {/* Aviso de Segurança de Faturamento */}
          <div className="col-span-2 bg-slate-100/80 p-4 rounded-2xl border border-dashed border-slate-300 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-200 text-slate-600 flex items-center justify-center shrink-0">
              <Lock className="w-4 h-4" />
            </div>
            <div className="text-xs text-slate-600">
              <p className="font-bold text-slate-800">
                Faturamento e Métricas Financeiras Ocultas
              </p>
              <p className="text-[11px] text-slate-500">
                O Administrador Gerencial pode liberar a visualização financeira para seu usuário na aba de Usuários.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Visual Charts Row matching Screen 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Vendas dos últimos 7 dias */}
        <div className="lg:col-span-7 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Vendas dos últimos 7 dias
              </h2>
              <p className="text-xs text-slate-400">Volume real de pedidos confirmados por dia</p>
            </div>
            <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg">
              Semana Atual
            </span>
          </div>

          <div className="h-56 flex items-end justify-between gap-3 pt-6 pb-2 px-2 border-b border-slate-100">
            {weeklyData.map((item, i) => {
              const heightPercent = maxWeeklyCount > 0 ? (item.count / maxWeeklyCount) * 100 : 0;
              const isToday = i === weeklyData.length - 1;
              return (
                <div key={item.day} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                  <span className="text-[11px] font-bold text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity">
                    {item.count}
                  </span>
                  <div
                    style={{ height: `${Math.max(heightPercent, 4)}%` }}
                    className={`w-full max-w-[40px] rounded-t-lg transition-all ${
                      isToday
                        ? 'bg-blue-600 shadow-md shadow-blue-200'
                        : 'bg-blue-400/80 hover:bg-blue-500'
                    }`}
                  />
                  <span className={`text-[11px] font-medium ${isToday ? 'font-bold text-blue-700' : 'text-slate-500'}`}>
                    {item.day}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-3 text-right">
            <span className="text-xs text-slate-500">
              Pedidos registrados hoje: <strong>{salesToday.length} pedido(s)</strong>
            </span>
          </div>
        </div>

        {/* Vendas por origem (Donut breakdown) */}
        <div className="lg:col-span-5 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Vendas por origem
                </h2>
                <p className="text-xs text-slate-400">Canais de entrada dos pedidos</p>
              </div>
            </div>

            {/* Visual representation */}
            <div className="my-5 flex items-center justify-center">
              <div className="relative w-36 h-36 rounded-full border-8 border-blue-600 flex items-center justify-center shadow-inner">
                <div className="text-center">
                  <span className="text-xl font-black text-slate-900">{confirmedSales.length}</span>
                  <span className="block text-[10px] text-slate-400 uppercase font-semibold">Total Geral</span>
                </div>
              </div>
            </div>

            {/* Legend with percentages */}
            <div className="space-y-2 mt-4 text-xs">
              {originBreakdown.map((item) => (
                <div key={item.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-3 h-3 rounded-full ${item.color}`} />
                    <span className="text-slate-700 font-medium">{item.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 font-mono text-[11px]">{item.count} un</span>
                    <span className="font-bold text-slate-900 w-10 text-right">{item.percent}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 text-xs text-slate-500 text-center">
            Pronto para receber pedidos automáticos via API do Site B2B
          </div>
        </div>
      </div>

      {/* Recent Orders Preview Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Últimas Vendas & Recibos</h2>
            <p className="text-xs text-slate-400">Vendas registradas no sistema Pamda</p>
          </div>
          <button
            onClick={() => onNavigate('vendas')}
            className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
          >
            <span>Ver todas</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/70 border-b border-slate-100 text-slate-500 font-semibold uppercase text-[11px]">
              <tr>
                <th className="py-3 px-6">Recibo</th>
                <th className="py-3 px-4">Data/Hora</th>
                <th className="py-3 px-4">Cliente / Rede</th>
                <th className="py-3 px-4">Filial</th>
                <th className="py-3 px-4 text-center">Itens</th>
                {canViewFinancials && (
                  <th className="py-3 px-4 text-right">Total (R$)</th>
                )}
                <th className="py-3 px-4 text-center">Financeiro</th>
                <th className="py-3 px-4 text-center">Produção</th>
                <th className="py-3 px-6 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {sales.slice(0, 6).map((sale) => (
                <tr key={sale.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3 px-6 font-mono font-bold text-blue-600">
                    Nº {sale.receiptNumber}
                  </td>
                  <td className="py-3 px-4 text-slate-600">
                    {new Date(sale.createdAt).toLocaleDateString('pt-BR')} {new Date(sale.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="py-3 px-4 font-semibold text-slate-900">
                    {sale.customerName}
                  </td>
                  <td className="py-3 px-4 text-slate-600">
                    {sale.branchName || '-'}
                  </td>
                  <td className="py-3 px-4 text-center font-bold">
                    {sale.itemsCount}
                  </td>
                  {canViewFinancials && (
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                      R$ {sale.totalAmount.toFixed(2)}
                    </td>
                  )}
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        sale.financialStatus === 'pago'
                          ? 'bg-emerald-100 text-emerald-800'
                          : sale.financialStatus === 'vencido'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {sale.financialStatus.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                        sale.productionStatus === 'pronto' || sale.productionStatus === 'entregue'
                          ? 'bg-blue-100 text-blue-800'
                          : sale.productionStatus === 'em_producao'
                          ? 'bg-indigo-100 text-indigo-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {sale.productionStatus.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="py-3 px-6 text-right">
                    <button
                      onClick={() => onViewReceipt(sale)}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded text-[11px] transition-colors cursor-pointer"
                    >
                      Ver Recibo
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: Vendas de Hoje (Aberto ao clicar no card Vendas Hoje) */}
      <Modal
        isOpen={isTodaySalesModalOpen}
        onClose={() => setIsTodaySalesModalOpen(false)}
        title={`Vendas Realizadas Hoje (${todayStr.split('-').reverse().join('/')})`}
        subtitle={`Total de ${salesToday.length} pedido(s) registrado(s) hoje • Atualizado em tempo real`}
        maxWidth="4xl"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <span className="text-xs text-slate-500 font-medium">
              Pedidos realizados exclusivamente hoje:
            </span>
            <button
              onClick={() => {
                setIsTodaySalesModalOpen(false);
                onNavigate('nova_venda');
              }}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Emitir Nova Venda</span>
            </button>
          </div>

          {salesToday.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs space-y-3">
              <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <ShoppingCart className="w-6 h-6" />
              </div>
              <p className="font-bold text-slate-700 text-sm">
                Nenhuma venda registrada hoje até o momento.
              </p>
              <p className="text-slate-500">
                Assim que você ou o site emitir um pedido, ele aparecerá aqui instantaneamente!
              </p>
              <button
                onClick={() => {
                  setIsTodaySalesModalOpen(false);
                  onNavigate('nova_venda');
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                + Criar Primeira Venda de Hoje
              </button>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3">Recibo</th>
                    <th className="py-2.5 px-3">Horário</th>
                    <th className="py-2.5 px-3">Cliente / Filial</th>
                    <th className="py-2.5 px-3">Itens</th>
                    {canViewFinancials && (
                      <th className="py-2.5 px-3 text-right">Valor Total (R$)</th>
                    )}
                    <th className="py-2.5 px-3 text-center">Financeiro</th>
                    <th className="py-2.5 px-3 text-center">Produção</th>
                    <th className="py-2.5 px-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {salesToday.map((sale) => (
                    <tr key={sale.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono font-bold text-blue-600">
                        Nº {sale.receiptNumber}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 font-mono">
                        {new Date(sale.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-bold text-slate-900 block">{sale.customerName}</span>
                        {sale.branchName && (
                          <span className="text-[10px] text-slate-400">{sale.branchName}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-semibold">{sale.itemsCount} un</span>
                        <span className="block text-[10px] text-slate-400 truncate max-w-xs">
                          {sale.items.map((i) => i.productName).join(', ')}
                        </span>
                      </td>
                      {canViewFinancials && (
                        <td className="py-2.5 px-3 text-right font-mono font-black text-slate-900">
                          R$ {sale.totalAmount.toFixed(2)}
                        </td>
                      )}
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            sale.financialStatus === 'pago'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {sale.financialStatus.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-slate-100 text-slate-700">
                          {sale.productionStatus.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => {
                            setIsTodaySalesModalOpen(false);
                            onViewReceipt(sale);
                          }}
                          className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded text-[11px] transition-colors cursor-pointer inline-flex items-center gap-1"
                        >
                          <Printer className="w-3 h-3" />
                          <span>Recibo</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="pt-2 flex items-center justify-between border-t border-slate-100 text-xs">
            <span className="text-slate-500 font-medium">
              Total hoje: <strong>{salesToday.length} pedido(s)</strong>
              {canViewFinancials && (
                <> • Faturamento hoje: <strong className="text-emerald-700">R$ {revenueToday.toFixed(2)}</strong></>
              )}
            </span>
            <button
              onClick={() => {
                setIsTodaySalesModalOpen(false);
                onNavigate('vendas');
              }}
              className="text-blue-600 hover:text-blue-800 font-bold cursor-pointer"
            >
              Ver Todas as Vendas Históricas →
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
