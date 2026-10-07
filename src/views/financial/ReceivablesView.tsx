import React, { useState } from 'react';
import {
  Wallet,
  Calendar,
  Filter,
  Download,
  DollarSign,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Printer,
  ChevronRight,
} from 'lucide-react';
import { Sale, PaymentMethod } from '../../types/erp';
import { dbService } from '../../services/db';
import { Modal } from '../../components/common/Modal';
import { exportToCsv } from '../../services/csvExport';

interface ReceivablesViewProps {
  onViewReceipt: (sale: Sale) => void;
}

export const ReceivablesView: React.FC<ReceivablesViewProps> = ({ onViewReceipt }) => {
  const [sales, setSales] = useState<Sale[]>(dbService.getSales());
  const [statusFilter, setStatusFilter] = useState<string>('todas');
  const [customerFilter, setCustomerFilter] = useState<string>('todos');

  // Modal de baixa financeira
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedSaleForPayment, setSelectedSaleForPayment] = useState<Sale | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix_online');
  const [paymentNotes, setPaymentNotes] = useState<string>('');

  const refresh = () => {
    setSales(dbService.getSales());
  };

  const customers = dbService.getCustomers();

  // Filtragem
  const filteredSales = sales.filter((s) => {
    if (s.saleStatus === 'cancelada') return false;

    // Filtro de status
    if (statusFilter === 'aberto' && s.financialStatus !== 'aguardando_pagamento') return false;
    if (statusFilter === 'pago' && s.financialStatus !== 'pago') return false;
    if (statusFilter === 'vencido' && s.financialStatus !== 'vencido') return false;
    if (statusFilter === 'parcial' && s.financialStatus !== 'parcialmente_pago') return false;

    // Filtro de cliente
    if (customerFilter !== 'todos' && s.customerId !== customerFilter) return false;

    return true;
  });

  const handleOpenPaymentModal = (sale: Sale) => {
    setSelectedSaleForPayment(sale);
    setPaymentAmount(sale.pendingBalance);
    setPaymentMethod('pix_manual');
    setPaymentNotes('');
    setIsPaymentModalOpen(true);
  };

  const handleRegisterPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSaleForPayment) return;
    if (paymentAmount <= 0) {
      alert('Informe um valor de pagamento válido.');
      return;
    }

    const res = dbService.registerPayment({
      saleId: selectedSaleForPayment.id,
      amount: Number(paymentAmount),
      paymentMethod,
      notes: paymentNotes.trim() || undefined,
    });

    if (res.success) {
      alert(`Baixa de R$ ${paymentAmount.toFixed(2)} registrada com sucesso no Recibo Nº ${selectedSaleForPayment.receiptNumber}!`);
      setIsPaymentModalOpen(false);
      refresh();
    } else {
      alert(res.message);
    }
  };

  const handleExportCsv = () => {
    const headers = [
      'Recibo',
      'Data Venda',
      'Cliente',
      'Filial',
      'Vencimento',
      'Valor Original (R$)',
      'Recebido (R$)',
      'Saldo Pendente (R$)',
      'Status',
    ];

    const rows = filteredSales.map((s) => [
      s.receiptNumber,
      new Date(s.createdAt).toLocaleDateString('pt-BR'),
      s.customerName,
      s.branchName || 'Matriz',
      s.dueDate,
      s.totalAmount.toFixed(2),
      s.amountPaid.toFixed(2),
      s.pendingBalance.toFixed(2),
      s.financialStatus,
    ]);

    exportToCsv('contas_a_receber_pamda', headers, rows);
  };

  return (
    <div className="space-y-6">
      {/* Header matching Screen 8 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Contas a Receber
          </h1>
          <p className="text-xs text-slate-500">
            Controle financeiro de recebimentos, baixas manuais, Pix e pendências
          </p>
        </div>

        <button
          onClick={handleExportCsv}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer self-start sm:self-auto"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Exportar CSV</span>
        </button>
      </div>

      {/* Filter Row matching Screen 8 */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-medium">
        <div>
          <label className="block text-slate-500 font-bold uppercase text-[11px] mb-1">
            Período
          </label>
          <div className="flex items-center gap-2 px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 text-slate-700 font-semibold">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span>01/10/2026 - 31/10/2026</span>
          </div>
        </div>

        <div>
          <label className="block text-slate-500 font-bold uppercase text-[11px] mb-1">
            Status
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-xl font-semibold bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none"
          >
            <option value="todas">Todas as Contas</option>
            <option value="aberto">Abertas</option>
            <option value="parcial">Parcialmente Pagas</option>
            <option value="vencido">Vencidas</option>
            <option value="pago">Pagas</option>
          </select>
        </div>

        <div>
          <label className="block text-slate-500 font-bold uppercase text-[11px] mb-1">
            Cliente / Rede
          </label>
          <select
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-xl font-semibold bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none"
          >
            <option value="todos">Todos os Clientes</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Receivables Table matching Screen 8 */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[11px]">
              <tr>
                <th className="py-3 px-5">Recibo</th>
                <th className="py-3 px-4">Data</th>
                <th className="py-3 px-4">Cliente</th>
                <th className="py-3 px-4">Filial</th>
                <th className="py-3 px-4">Vencimento</th>
                <th className="py-3 px-4 text-right">Valor (R$)</th>
                <th className="py-3 px-4 text-right">Recebido (R$)</th>
                <th className="py-3 px-4 text-right">Saldo (R$)</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-5 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredSales.map((sale) => {
                const isPaid = sale.pendingBalance <= 0;
                return (
                  <tr key={sale.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-5 font-mono font-bold text-blue-600">
                      {sale.receiptNumber}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">
                      {new Date(sale.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      {sale.customerName}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">
                      {sale.branchName || '-'}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-semibold text-slate-800">
                      {sale.dueDate}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900">
                      {sale.totalAmount.toFixed(2)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-emerald-700 font-semibold">
                      {sale.amountPaid.toFixed(2)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-black text-slate-950">
                      {sale.pendingBalance.toFixed(2)}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                          sale.financialStatus === 'pago'
                            ? 'bg-emerald-100 text-emerald-800'
                            : sale.financialStatus === 'vencido'
                            ? 'bg-rose-100 text-rose-800'
                            : sale.financialStatus === 'parcialmente_pago'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {sale.financialStatus === 'pago'
                          ? 'Pago'
                          : sale.financialStatus === 'vencido'
                          ? 'Vencido'
                          : sale.financialStatus === 'parcialmente_pago'
                          ? 'Parcial'
                          : 'Aberto'}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => onViewReceipt(sale)}
                          title="Ver Recibo"
                          className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>

                        {!isPaid && (
                          <button
                            onClick={() => handleOpenPaymentModal(sale)}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded text-[11px] transition-colors cursor-pointer flex items-center gap-1"
                          >
                            <DollarSign className="w-3 h-3" />
                            <span>Baixar</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Baixa Financeira Manual */}
      <Modal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        title={`Baixa Financeira - Recibo Nº ${selectedSaleForPayment?.receiptNumber}`}
        subtitle={`Cliente: ${selectedSaleForPayment?.customerName} • Saldo atual: R$ ${selectedSaleForPayment?.pendingBalance.toFixed(2)}`}
        maxWidth="md"
      >
        <form onSubmit={handleRegisterPayment} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Valor do Pagamento (R$) *
            </label>
            <input
              type="number"
              step="0.01"
              required
              max={selectedSaleForPayment?.pendingBalance}
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(Number(e.target.value))}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-mono font-bold text-emerald-700 focus:ring-2 focus:ring-blue-600 focus:outline-none"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Permite pagamento total ou parcial.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Forma de Pagamento *
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as any)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-600 focus:outline-none bg-white"
            >
              <option value="pix_online">Pix online / chave oficial</option>
              <option value="pix_manual">Pix manual (comprovante em anexo)</option>
              <option value="dinheiro">Dinheiro em espécie</option>
              <option value="transferencia">Transferência TED/DOC</option>
              <option value="outro">Outro meio</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Observações do Recebimento
            </label>
            <input
              type="text"
              value={paymentNotes}
              onChange={(e) => setPaymentNotes(e.target.value)}
              placeholder="Ex: Pago na filial centro pelo motoboy"
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-600 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIsPaymentModalOpen(false)}
              className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Confirmar Baixa</span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
