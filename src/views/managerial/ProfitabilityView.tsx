import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  DollarSign,
  Calendar,
  Lock,
  Download,
  Printer,
  ChevronRight,
  ShieldAlert,
  ArrowUpRight,
  ArrowDownRight,
  Percent,
} from 'lucide-react';
import { Sale } from '../../types/erp';
import { dbService } from '../../services/db';
import { authService } from '../../services/auth';
import { exportToCsv } from '../../services/csvExport';

interface ProfitabilityViewProps {
  onViewReceipt: (sale: Sale) => void;
}

export const ProfitabilityView: React.FC<ProfitabilityViewProps> = ({ onViewReceipt }) => {
  const isAdmin = authService.isAdminGerencial();

  const [startDate, setStartDate] = useState('2026-10-01');
  const [endDate, setEndDate] = useState('2026-10-31');
  const [useManagerialCost, setUseManagerialCost] = useState(true);

  const allSales = dbService.getSales();

  // Se não for gerencial, bloquear terminantemente!
  if (!isAdmin) {
    return (
      <div className="p-12 bg-white rounded-3xl border border-rose-200 shadow-sm text-center max-w-xl mx-auto my-12">
        <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-black text-slate-900">Acesso Restrito: Nível Gerencial</h2>
        <p className="text-xs text-slate-500 mt-2 leading-relaxed">
          O Relatório de Lucratividade Real e Custos Históricos contém dados financeiros estratégicos
          da Pamda Cases e está disponível exclusivamente para usuários com perfil <strong>ADMIN / GERENCIAL</strong>.
        </p>
      </div>
    );
  }

  // Filtrar vendas no período
  const periodSales = useMemo(() => {
    return allSales.filter((s) => {
      if (s.saleStatus === 'cancelada') return false;
      const saleDate = s.createdAt.split('T')[0];
      return saleDate >= startDate && saleDate <= endDate;
    });
  }, [allSales, startDate, endDate]);

  // Cálculos consolidados rigorosamente usando os snapshots históricos imutáveis
  const metrics = useMemo(() => {
    let salesCount = periodSales.length;
    let productsGrossTotal = 0;
    let shippingFeesCharged = 0;
    let discountsGiven = 0;
    let totalRevenue = 0;

    let totalDirectCost = 0; // Custo dos produtos físicos + serviços
    let totalManagerialCost = 0; // Custo gerencial snapshot
    let totalRealDeliveryCost = 0; // Custo real pago aos motoboys

    for (const sale of periodSales) {
      productsGrossTotal += sale.productsTotal;
      shippingFeesCharged += sale.shippingFeeCharged;
      discountsGiven += sale.discount;
      totalRevenue += sale.totalAmount;
      totalRealDeliveryCost += sale.realDeliveryCost || 0;

      for (const item of sale.items) {
        // CRÍTICO: Usar estritamente o SNAPSHOT registrado no momento da venda!
        const directItemCost = item.unitCostSnapshot * item.quantity;
        const managerialItemCost = item.managerialUnitCostSnapshot * item.quantity;

        totalDirectCost += directItemCost;
        totalManagerialCost += managerialItemCost;
      }
    }

    // Custo base escolhido (gerencial ou direto) + custo real de motoboy
    const chosenProductCost = useManagerialCost ? totalManagerialCost : totalDirectCost;
    const paymentFeesEstimated = totalRevenue * 0.01; // Taxa média estimada de gateway Pix (1%)
    const totalCosts = chosenProductCost + totalRealDeliveryCost + paymentFeesEstimated;

    const netProfit = totalRevenue - totalCosts;
    const marginPercent = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
    const deliveryDiff = shippingFeesCharged - totalRealDeliveryCost;

    return {
      salesCount,
      productsGrossTotal,
      shippingFeesCharged,
      discountsGiven,
      totalRevenue,
      totalDirectCost,
      totalManagerialCost,
      totalRealDeliveryCost,
      paymentFeesEstimated,
      totalCosts,
      netProfit,
      marginPercent,
      deliveryDiff,
    };
  }, [periodSales, useManagerialCost]);

  const handleExportCsv = () => {
    const headers = [
      'Recibo',
      'Data',
      'Cliente',
      'Filial',
      'Valor Venda (R$)',
      'Custo Histórico (R$)',
      'Frete Cobrado (R$)',
      'Custo Motoboy (R$)',
      'Lucro Venda (R$)',
      'Margem %',
    ];

    const rows = periodSales.map((s) => {
      const saleCost = s.items.reduce(
        (acc, i) => acc + (useManagerialCost ? i.managerialUnitCostSnapshot : i.unitCostSnapshot) * i.quantity,
        0
      );
      const deliveryCost = s.realDeliveryCost || 0;
      const profit = s.totalAmount - (saleCost + deliveryCost);
      const margin = s.totalAmount > 0 ? (profit / s.totalAmount) * 100 : 0;

      return [
        s.receiptNumber,
        new Date(s.createdAt).toLocaleDateString('pt-BR'),
        s.customerName,
        s.branchName || 'Matriz',
        s.totalAmount.toFixed(2),
        saleCost.toFixed(2),
        s.shippingFeeCharged.toFixed(2),
        deliveryCost.toFixed(2),
        profit.toFixed(2),
        margin.toFixed(1) + '%',
      ];
    });

    exportToCsv('lucratividade_pamda_cases', headers, rows);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Relatório de Lucratividade Real
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-purple-100 text-purple-800 border border-purple-200">
              Gerencial Restrito
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Cálculo baseado exclusivamente nos custos congelados no instante de cada venda
          </p>
        </div>

        <button
          onClick={handleExportCsv}
          className="flex items-center gap-1.5 px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer self-start sm:self-auto"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Exportar DRE para CSV</span>
        </button>
      </div>

      {/* Date Filter & Cost Mode Switcher */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs font-medium">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-bold uppercase text-[11px]">De:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-1.5 border border-slate-300 rounded-xl font-bold text-slate-800 focus:ring-2 focus:ring-purple-600 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-bold uppercase text-[11px]">Até:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-1.5 border border-slate-300 rounded-xl font-bold text-slate-800 focus:ring-2 focus:ring-purple-600 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-xl border border-slate-200">
          <span className="text-slate-500 text-[11px] font-semibold pl-2">Critério de Custo:</span>
          <button
            onClick={() => setUseManagerialCost(true)}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              useManagerialCost
                ? 'bg-purple-700 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Custo Gerencial (Pamda)
          </button>
          <button
            onClick={() => setUseManagerialCost(false)}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              !useManagerialCost
                ? 'bg-purple-700 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Custo Direto Composto
          </button>
        </div>
      </div>

      {/* Main KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Receita Total */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Faturamento Total
          </p>
          <p className="text-2xl font-black text-slate-950 mt-1 font-mono">
            R$ {metrics.totalRevenue.toFixed(2)}
          </p>
          <span className="text-[11px] text-slate-500 font-medium mt-1 block">
            {metrics.salesCount} vendas no período
          </span>
        </div>

        {/* Total de Custos */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Total de Custos & Entregas
          </p>
          <p className="text-2xl font-black text-rose-600 mt-1 font-mono">
            R$ {metrics.totalCosts.toFixed(2)}
          </p>
          <span className="text-[11px] text-slate-500 font-medium mt-1 block">
            Produtos + Serviços + Motoboy
          </span>
        </div>

        {/* Lucro Líquido Real */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Lucro Bruto / Operacional
          </p>
          <p className="text-2xl font-black text-emerald-600 mt-1 font-mono">
            R$ {metrics.netProfit.toFixed(2)}
          </p>
          <span className="text-[11px] text-emerald-700 font-bold mt-1 block">
            Retorno líquido apurado
          </span>
        </div>

        {/* Margem Percentual */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Margem de Lucro (%)
          </p>
          <p className="text-2xl font-black text-purple-700 mt-1 font-mono">
            {metrics.marginPercent.toFixed(1)}%
          </p>
          <span className="text-[11px] text-slate-500 font-medium mt-1 block">
            Margem média sobre vendas
          </span>
        </div>
      </div>

      {/* DRE Detalhado Breakdown Box */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs text-xs">
        <h2 className="text-sm font-bold text-slate-900 mb-4 uppercase tracking-wider">
          Demonstrativo Consolidado do Período (DRE)
        </h2>

        <div className="space-y-2.5 max-w-2xl font-medium">
          <div className="flex justify-between py-1.5 border-b border-slate-100 text-slate-700">
            <span>(+) Venda bruta de produtos e kits</span>
            <span className="font-mono font-bold text-slate-900">
              R$ {metrics.productsGrossTotal.toFixed(2)}
            </span>
          </div>

          <div className="flex justify-between py-1.5 border-b border-slate-100 text-slate-700">
            <span>(+) Frete cobrado dos clientes</span>
            <span className="font-mono font-bold text-slate-900">
              R$ {metrics.shippingFeesCharged.toFixed(2)}
            </span>
          </div>

          {metrics.discountsGiven > 0 && (
            <div className="flex justify-between py-1.5 border-b border-slate-100 text-rose-600">
              <span>(-) Descontos concedidos</span>
              <span className="font-mono font-bold">
                - R$ {metrics.discountsGiven.toFixed(2)}
              </span>
            </div>
          )}

          <div className="flex justify-between py-1.5 border-b border-slate-200 text-slate-900 font-bold bg-slate-50 px-2 rounded">
            <span>(=) FATURAMENTO LÍQUIDO</span>
            <span className="font-mono font-black text-slate-950">
              R$ {metrics.totalRevenue.toFixed(2)}
            </span>
          </div>

          <div className="flex justify-between py-1.5 border-b border-slate-100 text-rose-600">
            <span>
              (-) Custo histórico dos produtos e kits vendidas ({useManagerialCost ? 'Gerencial' : 'Direto'})
            </span>
            <span className="font-mono font-bold">
              - R$ {(useManagerialCost ? metrics.totalManagerialCost : metrics.totalDirectCost).toFixed(2)}
            </span>
          </div>

          <div className="flex justify-between py-1.5 border-b border-slate-100 text-rose-600">
            <span>(-) Custo real pago às entregas / motoboys</span>
            <span className="font-mono font-bold">
              - R$ {metrics.totalRealDeliveryCost.toFixed(2)}
            </span>
          </div>

          <div className="flex justify-between py-1.5 border-b border-slate-100 text-rose-600">
            <span>(-) Taxas estimadas de processamento / gateway</span>
            <span className="font-mono font-bold">
              - R$ {metrics.paymentFeesEstimated.toFixed(2)}
            </span>
          </div>

          <div className="flex justify-between py-3 border-t-2 border-slate-900 text-base font-black text-slate-950">
            <span>(=) LUCRO LÍQUIDO APURADO:</span>
            <span className="font-mono text-emerald-700">
              R$ {metrics.netProfit.toFixed(2)} ({metrics.marginPercent.toFixed(1)}%)
            </span>
          </div>
        </div>
      </div>

      {/* Individual Sales Contribution Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Composição das Vendas do Período ({periodSales.length})
            </h2>
            <p className="text-[11px] text-slate-400">
              Abra qualquer recibo para auditar os valores congelados na transação
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[11px] font-bold">
              <tr>
                <th className="py-3 px-5">Recibo</th>
                <th className="py-3 px-4">Data</th>
                <th className="py-3 px-4">Cliente</th>
                <th className="py-3 px-4">Filial</th>
                <th className="py-3 px-4 text-right">Valor Venda (R$)</th>
                <th className="py-3 px-4 text-right">Custo Histórico</th>
                <th className="py-3 px-4 text-right">Entrega Real</th>
                <th className="py-3 px-4 text-right">Lucro (R$)</th>
                <th className="py-3 px-4 text-center">Margem %</th>
                <th className="py-3 px-5 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {periodSales.map((sale) => {
                const saleCost = sale.items.reduce(
                  (acc, i) =>
                    acc + (useManagerialCost ? i.managerialUnitCostSnapshot : i.unitCostSnapshot) * i.quantity,
                  0
                );
                const deliveryCost = sale.realDeliveryCost || 0;
                const profit = sale.totalAmount - (saleCost + deliveryCost);
                const margin = sale.totalAmount > 0 ? (profit / sale.totalAmount) * 100 : 0;

                return (
                  <tr key={sale.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-5 font-mono font-bold text-purple-700">
                      Nº {sale.receiptNumber}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {new Date(sale.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-900">
                      {sale.customerName}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {sale.branchName || '-'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                      R$ {sale.totalAmount.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-rose-600">
                      R$ {saleCost.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-500">
                      R$ {deliveryCost.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-black text-emerald-700">
                      R$ {profit.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="font-mono font-bold text-purple-700">
                        {margin.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-3 px-5 text-right">
                      <button
                        onClick={() => onViewReceipt(sale)}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded text-[11px] transition-colors cursor-pointer"
                      >
                        Auditar Recibo
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
