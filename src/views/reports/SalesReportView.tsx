import React, { useState, useMemo } from 'react';
import { BarChart3, Calendar, Download, TrendingUp, Users, Box, ShoppingCart } from 'lucide-react';
import { dbService } from '../../services/db';
import { Sale, Customer } from '../../types/erp';
import { exportToCsv } from '../../services/csvExport';

export const SalesReportView: React.FC = () => {
  const [activeReport, setActiveReport] = useState<'geral' | 'clientes' | 'produtos'>('geral');
  const [startDate, setStartDate] = useState('2026-10-01');
  const [endDate, setEndDate] = useState('2026-10-31');

  const sales = dbService.getSales();
  const customers = dbService.getCustomers();

  // Filtrar vendas no período
  const periodSales = useMemo(() => {
    return sales.filter((s) => {
      if (s.saleStatus === 'cancelada') return false;
      const d = s.createdAt.split('T')[0];
      return d >= startDate && d <= endDate;
    });
  }, [sales, startDate, endDate]);

  // Cálculos gerais
  const totalRevenue = periodSales.reduce((acc, s) => acc + s.totalAmount, 0);
  const salesCount = periodSales.length;
  const averageTicket = salesCount > 0 ? totalRevenue / salesCount : 0;
  const totalItemsSold = periodSales.reduce((acc, s) => acc + s.itemsCount, 0);

  // Vendas por Cliente
  const salesByCustomer = useMemo(() => {
    const map = new Map<string, { customerName: string; count: number; total: number; lastDate: string }>();

    for (const s of periodSales) {
      const existing = map.get(s.customerId) || {
        customerName: s.customerName,
        count: 0,
        total: 0,
        lastDate: s.createdAt,
      };

      existing.count += 1;
      existing.total += s.totalAmount;
      if (s.createdAt > existing.lastDate) {
        existing.lastDate = s.createdAt;
      }
      map.set(s.customerId, existing);
    }

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [periodSales]);

  // Vendas por Produto / Modelo
  const salesByProduct = useMemo(() => {
    const map = new Map<string, { productName: string; quantity: number; revenue: number }>();

    for (const s of periodSales) {
      for (const item of s.items) {
        const existing = map.get(item.productId) || {
          productName: item.productName,
          quantity: 0,
          revenue: 0,
        };
        existing.quantity += item.quantity;
        existing.revenue += item.subtotal;
        map.set(item.productId, existing);
      }
    }

    return Array.from(map.values()).sort((a, b) => b.quantity - a.quantity);
  }, [periodSales]);

  const handleExportCsv = () => {
    if (activeReport === 'geral') {
      const headers = ['Recibo', 'Data', 'Cliente', 'Filial', 'Vendedor', 'Itens', 'Total (R$)'];
      const rows = periodSales.map((s) => [
        s.receiptNumber,
        new Date(s.createdAt).toLocaleDateString('pt-BR'),
        s.customerName,
        s.branchName || 'Matriz',
        s.salespersonName,
        s.itemsCount,
        s.totalAmount.toFixed(2),
      ]);
      exportToCsv('relatorio_vendas_geral', headers, rows);
    } else if (activeReport === 'clientes') {
      const headers = ['Cliente', 'Qtd Vendas', 'Faturamento (R$)', 'Ticket Médio (R$)', 'Última Compra'];
      const rows = salesByCustomer.map((c) => [
        c.customerName,
        c.count,
        c.total.toFixed(2),
        (c.total / c.count).toFixed(2),
        new Date(c.lastDate).toLocaleDateString('pt-BR'),
      ]);
      exportToCsv('vendas_por_cliente', headers, rows);
    } else {
      const headers = ['Produto / Modelo', 'Quantidade Vendida', 'Faturamento (R$)'];
      const rows = salesByProduct.map((p) => [
        p.productName,
        p.quantity,
        p.revenue.toFixed(2),
      ]);
      exportToCsv('vendas_por_produto', headers, rows);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Relatórios Comerciais & Estatísticas
          </h1>
          <p className="text-xs text-slate-500">
            Análise de faturamento B2B, ticket médio e volume por lojista e modelo
          </p>
        </div>

        <button
          onClick={handleExportCsv}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer self-start sm:self-auto"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Exportar para CSV</span>
        </button>
      </div>

      {/* Date Filter */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4 text-xs font-medium">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveReport('geral')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-colors cursor-pointer ${
              activeReport === 'geral' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            Visão Geral de Vendas
          </button>
          <button
            onClick={() => setActiveReport('clientes')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-colors cursor-pointer ${
              activeReport === 'clientes' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            Vendas por Cliente
          </button>
          <button
            onClick={() => setActiveReport('produtos')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-colors cursor-pointer ${
              activeReport === 'produtos' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            Vendas por Modelo / Produto
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-bold uppercase text-[11px]">De:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2.5 py-1 border border-slate-300 rounded-lg font-bold"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-bold uppercase text-[11px]">Até:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2.5 py-1 border border-slate-300 rounded-lg font-bold"
            />
          </div>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase">Faturamento Período</span>
          <p className="text-2xl font-black text-slate-900 font-mono mt-1">
            R$ {totalRevenue.toFixed(2)}
          </p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase">Total de Vendas</span>
          <p className="text-2xl font-black text-blue-600 mt-1">
            {salesCount} pedidos
          </p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase">Ticket Médio</span>
          <p className="text-2xl font-black text-emerald-600 font-mono mt-1">
            R$ {averageTicket.toFixed(2)}
          </p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase">Capas / Peças Vendidas</span>
          <p className="text-2xl font-black text-purple-700 font-mono mt-1">
            {totalItemsSold} un
          </p>
        </div>
      </div>

      {/* Tables based on active report */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {activeReport === 'geral' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[11px] font-bold">
                <tr>
                  <th className="py-3 px-5">Recibo</th>
                  <th className="py-3 px-4">Data</th>
                  <th className="py-3 px-4">Cliente</th>
                  <th className="py-3 px-4">Filial</th>
                  <th className="py-3 px-4">Vendedor</th>
                  <th className="py-3 px-4 text-center">Itens</th>
                  <th className="py-3 px-5 text-right">Total (R$)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {periodSales.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-5 font-mono font-bold text-blue-600">
                      Nº {s.receiptNumber}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {new Date(s.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-900">
                      {s.customerName}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {s.branchName || '-'}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-800">
                      {s.salespersonName}
                    </td>
                    <td className="py-3 px-4 text-center font-bold">
                      {s.itemsCount}
                    </td>
                    <td className="py-3 px-5 text-right font-mono font-bold text-slate-900">
                      R$ {s.totalAmount.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeReport === 'clientes' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[11px] font-bold">
                <tr>
                  <th className="py-3 px-5">Cliente / Rede</th>
                  <th className="py-3 px-4 text-center">Quantidade de Pedidos</th>
                  <th className="py-3 px-4 text-right">Faturamento Total (R$)</th>
                  <th className="py-3 px-4 text-right">Ticket Médio (R$)</th>
                  <th className="py-3 px-5 text-right">Última Compra</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {salesByCustomer.map((c) => (
                  <tr key={c.customerName} className="hover:bg-slate-50/70">
                    <td className="py-3 px-5 font-bold text-slate-900">
                      {c.customerName}
                    </td>
                    <td className="py-3 px-4 text-center font-bold">
                      {c.count}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">
                      R$ {c.total.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900">
                      R$ {(c.total / c.count).toFixed(2)}
                    </td>
                    <td className="py-3 px-5 text-right text-slate-600">
                      {new Date(c.lastDate).toLocaleDateString('pt-BR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeReport === 'produtos' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[11px] font-bold">
                <tr>
                  <th className="py-3 px-5">Produto / Modelo</th>
                  <th className="py-3 px-4 text-center">Unidades Vendidas</th>
                  <th className="py-3 px-5 text-right">Faturamento Bruto (R$)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {salesByProduct.map((p) => (
                  <tr key={p.productName} className="hover:bg-slate-50/70">
                    <td className="py-3 px-5 font-bold text-slate-900">
                      {p.productName}
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-blue-700 text-sm">
                      {p.quantity} un
                    </td>
                    <td className="py-3 px-5 text-right font-mono font-black text-slate-900">
                      R$ {p.revenue.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
