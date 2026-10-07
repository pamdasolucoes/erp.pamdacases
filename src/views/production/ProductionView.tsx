import React, { useState } from 'react';
import {
  Factory,
  Clock,
  Play,
  CheckCircle2,
  PackageCheck,
  Truck,
  AlertTriangle,
  Lock,
  Printer,
} from 'lucide-react';
import { Sale, ProductionStatus } from '../../types/erp';
import { dbService } from '../../services/db';

interface ProductionViewProps {
  onViewReceipt: (sale: Sale) => void;
}

export const ProductionView: React.FC<ProductionViewProps> = ({ onViewReceipt }) => {
  const [sales, setSales] = useState<Sale[]>(dbService.getSales());
  const [activeTab, setActiveTab] = useState<ProductionStatus>('em_producao');

  const refresh = () => {
    setSales(dbService.getSales());
  };

  const getCountByStatus = (status: ProductionStatus) => {
    return sales.filter((s) => s.saleStatus !== 'cancelada' && s.productionStatus === status).length;
  };

  const tabs: Array<{ id: ProductionStatus; label: string; count: number }> = [
    { id: 'aguardando_liberacao', label: 'Aguardando liberação', count: getCountByStatus('aguardando_liberacao') },
    { id: 'aguardando_producao', label: 'Aguardando produção', count: getCountByStatus('aguardando_producao') },
    { id: 'em_producao', label: 'Em produção', count: getCountByStatus('em_producao') },
    { id: 'conferencia', label: 'Conferência', count: getCountByStatus('conferencia') },
    { id: 'pronto', label: 'Prontos', count: getCountByStatus('pronto') },
    { id: 'entregue', label: 'Entregues', count: getCountByStatus('entregue') },
  ];

  const filteredSales = sales.filter(
    (s) => s.saleStatus !== 'cancelada' && s.productionStatus === activeTab
  );

  const handleUpdateStatus = (saleId: string, newStatus: ProductionStatus) => {
    const res = dbService.updateProductionStatus(saleId, newStatus);
    if (!res.success) {
      alert(res.message);
    } else {
      refresh();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
          Fila de Produção & Estamparia UV
        </h1>
        <p className="text-xs text-slate-500">
          Acompanhamento dos pedidos liberados, modelos de celular, capas e impressão DTF UV
        </p>
      </div>

      {/* Status Tabs matching Screen 7 */}
      <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-1.5 overflow-x-auto">
        {tabs.map((tab) => {
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                isSelected
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                  isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Production Table matching Screen 7 */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[11px]">
              <tr>
                <th className="py-3 px-5">Recibo</th>
                <th className="py-3 px-4">Data/Hora</th>
                <th className="py-3 px-4">Cliente</th>
                <th className="py-3 px-4">Filial</th>
                <th className="py-3 px-4">Produto / Modelo</th>
                <th className="py-3 px-4 text-center">Qtd</th>
                <th className="py-3 px-4 text-center">Status Financeiro</th>
                <th className="py-3 px-5 text-right">Ações de Produção</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-slate-400">
                    Nenhum pedido nesta etapa de produção no momento.
                  </td>
                </tr>
              ) : (
                filteredSales.map((sale) => {
                  const isBlocked =
                    sale.productionStatus === 'aguardando_liberacao' &&
                    sale.paymentPolicySnapshot.produceOnlyAfterPayment &&
                    sale.pendingBalance > 0;

                  return (
                    <tr key={sale.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-5 font-mono font-bold text-blue-600">
                        {sale.receiptNumber}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {new Date(sale.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}{' '}
                        {new Date(sale.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {sale.customerName}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {sale.branchName || '-'}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">
                          {sale.items.map((i) => i.productName).join(' + ')}
                        </div>
                        {sale.notes && (
                          <div className="text-[10px] text-amber-700 font-medium mt-0.5">
                            Obs: {sale.notes}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center font-black text-slate-900">
                        {sale.itemsCount}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            sale.financialStatus === 'pago'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : sale.financialStatus === 'vencido'
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {sale.financialStatus === 'pago' ? 'Pago' : 'Pendente'}
                        </span>
                      </td>
                      <td className="py-3 px-5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Receipt quick preview */}
                          <button
                            onClick={() => onViewReceipt(sale)}
                            title="Ver Recibo"
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>

                          {/* Action Button depends on activeTab */}
                          {sale.productionStatus === 'aguardando_liberacao' && (
                            <button
                              onClick={() => handleUpdateStatus(sale.id, 'em_producao')}
                              className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1 ${
                                isBlocked
                                  ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                                  : 'bg-blue-600 text-white hover:bg-blue-700'
                              }`}
                            >
                              {isBlocked && <Lock className="w-3 h-3 text-amber-700" />}
                              <span>{isBlocked ? 'Aguardando Pgto' : 'Liberar Produção'}</span>
                            </button>
                          )}

                          {sale.productionStatus === 'aguardando_producao' && (
                            <button
                              onClick={() => handleUpdateStatus(sale.id, 'em_producao')}
                              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                            >
                              <Play className="w-3 h-3" />
                              <span>Em Produção</span>
                            </button>
                          )}

                          {sale.productionStatus === 'em_producao' && (
                            <button
                              onClick={() => handleUpdateStatus(sale.id, 'conferencia')}
                              className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                            >
                              <PackageCheck className="w-3 h-3" />
                              <span>Conferência</span>
                            </button>
                          )}

                          {sale.productionStatus === 'conferencia' && (
                            <button
                              onClick={() => handleUpdateStatus(sale.id, 'pronto')}
                              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Marcar Pronto</span>
                            </button>
                          )}

                          {sale.productionStatus === 'pronto' && (
                            <button
                              onClick={() => handleUpdateStatus(sale.id, 'entregue')}
                              className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                            >
                              <Truck className="w-3 h-3" />
                              <span>Entregue</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
