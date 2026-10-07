import React, { useState } from 'react';
import {
  ShoppingCart,
  Search,
  Filter,
  Printer,
  Ban,
  DollarSign,
  ChevronRight,
  Download,
} from 'lucide-react';
import { Sale, FinancialStatus, ProductionStatus } from '../../types/erp';
import { dbService } from '../../services/db';
import { exportToCsv } from '../../services/csvExport';

interface SalesListViewProps {
  onViewReceipt: (sale: Sale) => void;
  onNewSaleClick: () => void;
}

export const SalesListView: React.FC<SalesListViewProps> = ({
  onViewReceipt,
  onNewSaleClick,
}) => {
  const [sales, setSales] = useState<Sale[]>(dbService.getSales());
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const refresh = () => {
    setSales(dbService.getSales());
  };

  const filteredSales = sales.filter((s) => {
    const matchesStatus =
      statusFilter === 'todos' ||
      s.financialStatus === statusFilter ||
      s.productionStatus === statusFilter ||
      s.saleStatus === statusFilter;

    const matchesQuery =
      s.receiptNumber.toString().includes(searchQuery) ||
      s.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.branchName && s.branchName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      s.salespersonName.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesStatus && matchesQuery;
  });

  const handleCancelSale = (sale: Sale) => {
    const reason = prompt('Informe o motivo do cancelamento da venda:');
    if (!reason) return;

    if (confirm(`Confirma o cancelamento da venda Recibo Nº ${sale.receiptNumber}? O estoque dos itens físicos será estornado automaticamente.`)) {
      dbService.cancelSale(sale.id, reason);
      refresh();
      alert('Venda cancelada e estoque estornado!');
    }
  };

  const handleExportCsv = () => {
    const headers = [
      'Recibo',
      'Data/Hora',
      'Cliente',
      'Filial',
      'Vendedor',
      'Origem',
      'Itens',
      'Total (R$)',
      'Pago (R$)',
      'Saldo Pendente (R$)',
      'Status Financeiro',
      'Status Produção',
    ];

    const rows = filteredSales.map((s) => [
      s.receiptNumber,
      new Date(s.createdAt).toLocaleString('pt-BR'),
      s.customerName,
      s.branchName || 'Matriz',
      s.salespersonName,
      s.origin,
      s.itemsCount,
      s.totalAmount.toFixed(2),
      s.amountPaid.toFixed(2),
      s.pendingBalance.toFixed(2),
      s.financialStatus,
      s.productionStatus,
    ]);

    exportToCsv('vendas_pamda_cases', headers, rows);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Todas as Vendas & Pedidos
          </h1>
          <p className="text-xs text-slate-500">
            Histórico completo de vendas B2B com numeração sequencial a partir de 10000
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar CSV</span>
          </button>
          <button
            onClick={onNewSaleClick}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <span>+ Nova Venda</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 text-xs font-bold">
          {[
            { id: 'todos', label: 'Todas' },
            { id: 'aguardando_pagamento', label: 'Aguardando Pagamento' },
            { id: 'pago', label: 'Pagas' },
            { id: 'vencido', label: 'Vencidas' },
            { id: 'cancelada', label: 'Canceladas' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-xl whitespace-nowrap cursor-pointer transition-colors ${
                statusFilter === tab.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Recibo, cliente, filial..."
            className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-600 focus:outline-none"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[11px] font-bold">
              <tr>
                <th className="py-3 px-5">Recibo</th>
                <th className="py-3 px-4">Data Venda</th>
                <th className="py-3 px-4">Cliente / Rede</th>
                <th className="py-3 px-4">Filial</th>
                <th className="py-3 px-4 text-center">Itens</th>
                <th className="py-3 px-4 text-right">Total (R$)</th>
                <th className="py-3 px-4 text-center">Financeiro</th>
                <th className="py-3 px-4 text-center">Produção</th>
                <th className="py-3 px-5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredSales.map((sale) => (
                <tr key={sale.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-5 font-mono font-bold text-blue-600">
                    Nº {sale.receiptNumber}
                  </td>
                  <td className="py-3 px-4 text-slate-600">
                    {new Date(sale.createdAt).toLocaleDateString('pt-BR')} {new Date(sale.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="py-3 px-4 font-bold text-slate-900">
                    {sale.customerName}
                  </td>
                  <td className="py-3 px-4 text-slate-600">
                    {sale.branchName || '-'}
                  </td>
                  <td className="py-3 px-4 text-center font-bold">
                    {sale.itemsCount}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                    R$ {sale.totalAmount.toFixed(2)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        sale.financialStatus === 'pago'
                          ? 'bg-emerald-100 text-emerald-800'
                          : sale.financialStatus === 'vencido'
                          ? 'bg-rose-100 text-rose-800'
                          : sale.financialStatus === 'parcialmente_pago'
                          ? 'bg-blue-100 text-blue-800'
                          : sale.financialStatus === 'cancelado'
                          ? 'bg-slate-200 text-slate-600'
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
                          ? 'bg-emerald-100 text-emerald-800'
                          : sale.productionStatus === 'em_producao'
                          ? 'bg-indigo-100 text-indigo-800'
                          : sale.productionStatus === 'aguardando_liberacao'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {sale.productionStatus.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="py-3 px-5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => onViewReceipt(sale)}
                        className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded text-[11px] transition-colors cursor-pointer flex items-center gap-1"
                      >
                        <Printer className="w-3 h-3" />
                        <span>Recibo</span>
                      </button>

                      {sale.saleStatus !== 'cancelada' && (
                        <button
                          onClick={() => handleCancelSale(sale)}
                          title="Cancelar Venda"
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                        >
                          <Ban className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
