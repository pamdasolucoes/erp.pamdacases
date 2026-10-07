import React, { useState } from 'react';
import { Wallet, Calendar, Plus, CheckCircle2, ChevronRight, FileText } from 'lucide-react';
import { dbService } from '../../services/db';
import { BillingClosing, Customer, Sale } from '../../types/erp';
import { Modal } from '../../components/common/Modal';

export const ClosingsView: React.FC = () => {
  const [closings, setClosings] = useState<BillingClosing[]>(dbService.getBillingClosings());
  const [isModalOpen, setIsModalOpen] = useState(false);

  const customers = dbService.getCustomers();
  const sales = dbService.getSales();

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(customers[0]?.id || '');
  const [periodStart, setPeriodStart] = useState<string>('2026-10-01');
  const [periodEnd, setPeriodEnd] = useState<string>('2026-10-07');
  const [selectedSalesIds, setSelectedSalesIds] = useState<string[]>([]);

  const refresh = () => {
    setClosings(dbService.getBillingClosings());
  };

  // Vendas em aberto elegíveis para fechamento do cliente selecionado
  const eligibleSales = sales.filter((s) => {
    if (s.customerId !== selectedCustomerId) return false;
    if (s.saleStatus === 'cancelada') return false;
    const sDate = s.createdAt.split('T')[0];
    return sDate >= periodStart && sDate <= periodEnd;
  });

  const handleOpenNewClosing = () => {
    setSelectedSalesIds(eligibleSales.map((s) => s.id));
    setIsModalOpen(true);
  };

  const handleToggleSaleSelection = (saleId: string) => {
    if (selectedSalesIds.includes(saleId)) {
      setSelectedSalesIds(selectedSalesIds.filter((id) => id !== saleId));
    } else {
      setSelectedSalesIds([...selectedSalesIds, saleId]);
    }
  };

  const handleGenerateClosing = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedSalesIds.length === 0) {
      alert('Selecione pelo menos uma venda para o fechamento.');
      return;
    }

    const created = dbService.createBillingClosing({
      customerId: selectedCustomerId,
      periodStart,
      periodEnd,
      salesIds: selectedSalesIds,
    });

    if (created) {
      alert(`Fechamento ${created.code} gerado com sucesso! Total: R$ ${created.totalAmount.toFixed(2)}`);
      refresh();
      setIsModalOpen(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Fechamento Semanal & Mensal de Redes
          </h1>
          <p className="text-xs text-slate-500">
            Agrupamento de múltiplos pedidos/recibos em faturas unificadas para matriz ou filiais
          </p>
        </div>

        <button
          onClick={handleOpenNewClosing}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Gerar Novo Fechamento</span>
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {closings.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400">
            Nenhum fechamento semanal ou mensal consolidado até o momento.
            Clique em "Gerar Novo Fechamento" para agrupar as vendas de um cliente.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[11px]">
                <tr>
                  <th className="py-3 px-5">Código</th>
                  <th className="py-3 px-4">Cliente / Rede</th>
                  <th className="py-3 px-4">Período</th>
                  <th className="py-3 px-4">Recibos Vinculados</th>
                  <th className="py-3 px-4 text-right">Total Faturado</th>
                  <th className="py-3 px-4 text-right">Saldo Pendente</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {closings.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-5 font-mono font-bold text-blue-600">
                      {c.code}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-900">
                      {c.customerName}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {c.periodStart} até {c.periodEnd}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">
                      {c.receiptNumbers.map((n) => `#${n}`).join(', ')}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                      R$ {c.totalAmount.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-black text-rose-600">
                      R$ {c.pendingBalance.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          c.status === 'pago'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Gerar Fechamento */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Gerar Fechamento Periódico de Rede"
        subtitle="Selecione o cliente e os pedidos que farão parte do faturamento consolidado"
        maxWidth="2xl"
      >
        <form onSubmit={handleGenerateClosing} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-bold text-slate-700 uppercase mb-1">
                Cliente / Rede *
              </label>
              <select
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl font-semibold bg-white"
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 uppercase mb-1">
                Data Inicial *
              </label>
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 uppercase mb-1">
                Data Final *
              </label>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200">
            <h4 className="font-bold text-slate-900 uppercase mb-2">
              Vendas no Período para Seleção ({eligibleSales.length})
            </h4>

            {eligibleSales.length === 0 ? (
              <p className="text-slate-400 py-4 text-center">
                Nenhuma venda encontrada para este cliente no período selecionado.
              </p>
            ) : (
              <div className="border border-slate-200 rounded-xl max-h-56 overflow-y-auto divide-y divide-slate-100">
                {eligibleSales.map((s) => {
                  const isChecked = selectedSalesIds.includes(s.id);
                  return (
                    <div
                      key={s.id}
                      onClick={() => handleToggleSaleSelection(s.id)}
                      className={`p-3 flex items-center justify-between cursor-pointer transition-colors ${
                        isChecked ? 'bg-blue-50/80' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="w-4 h-4 rounded text-blue-600"
                        />
                        <span className="font-mono font-bold text-slate-900">
                          Recibo Nº {s.receiptNumber}
                        </span>
                        <span className="text-slate-500">
                          ({s.branchName || 'Matriz'}) - {s.itemsCount} itens
                        </span>
                      </div>
                      <div className="font-mono font-bold text-slate-900">
                        R$ {s.totalAmount.toFixed(2)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 border border-slate-300 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-xs transition-colors cursor-pointer"
            >
              Confirmar Fechamento
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
