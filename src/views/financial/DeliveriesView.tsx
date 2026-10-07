import React, { useState } from 'react';
import { Truck, DollarSign, Edit2, CheckCircle2, ArrowRight } from 'lucide-react';
import { dbService } from '../../services/db';
import { Sale } from '../../types/erp';
import { Modal } from '../../components/common/Modal';

export const DeliveriesView: React.FC = () => {
  const [sales, setSales] = useState<Sale[]>(dbService.getSales());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [realDeliveryCost, setRealDeliveryCost] = useState<number>(0);
  const [deliveryStatus, setDeliveryStatus] = useState<Sale['deliveryStatus']>('entregue');

  const refresh = () => {
    setSales(dbService.getSales());
  };

  const salesWithDelivery = sales.filter((s) => s.saleStatus !== 'cancelada');

  const handleOpenEditDelivery = (sale: Sale) => {
    setSelectedSale(sale);
    setRealDeliveryCost(sale.realDeliveryCost || 0);
    setDeliveryStatus(sale.deliveryStatus || 'aguardando_entrega');
    setIsModalOpen(true);
  };

  const handleSaveDelivery = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSale) return;

    dbService.updateDeliveryCost(
      selectedSale.id,
      Number(realDeliveryCost),
      deliveryStatus
    );

    refresh();
    setIsModalOpen(false);
    alert('Custo real de entrega registrado com sucesso!');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
          Controle de Fretes & Entregas (Motoboys)
        </h1>
        <p className="text-xs text-slate-500">
          Apuração da diferença entre o frete cobrado do cliente e o valor real pago ao motoboy
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[11px]">
              <tr>
                <th className="py-3 px-5">Recibo</th>
                <th className="py-3 px-4">Cliente / Filial</th>
                <th className="py-3 px-4">Endereço de Entrega</th>
                <th className="py-3 px-4 text-right">Frete Cobrado (R$)</th>
                <th className="py-3 px-4 text-right">Custo Real Motoboy (R$)</th>
                <th className="py-3 px-4 text-right">Resultado Frete</th>
                <th className="py-3 px-4 text-center">Status Entrega</th>
                <th className="py-3 px-5 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {salesWithDelivery.map((sale) => {
                const diff = sale.shippingFeeCharged - (sale.realDeliveryCost || 0);
                return (
                  <tr key={sale.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-5 font-mono font-bold text-blue-600">
                      Nº {sale.receiptNumber}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-bold text-slate-900 block">{sale.customerName}</span>
                      <span className="text-[10px] text-slate-400">{sale.branchName || 'Matriz'}</span>
                    </td>
                    <td className="py-3 px-4 text-slate-600 max-w-xs truncate">
                      {sale.branchAddressSnapshot || 'Balcão'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                      R$ {sale.shippingFeeCharged.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-rose-600">
                      R$ {(sale.realDeliveryCost || 0).toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-black">
                      <span className={diff >= 0 ? 'text-emerald-700' : 'text-rose-600'}>
                        {diff >= 0 ? `+ R$ ${diff.toFixed(2)}` : `- R$ ${Math.abs(diff).toFixed(2)}`}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                        {sale.deliveryStatus.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-5 text-right">
                      <button
                        onClick={() => handleOpenEditDelivery(sale)}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded text-[11px] transition-colors cursor-pointer"
                      >
                        Lançar Custo
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Lançar Custo Real */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={`Custo Real de Entrega - Recibo Nº ${selectedSale?.receiptNumber}`}
        subtitle={`Frete cobrado do cliente: R$ ${selectedSale?.shippingFeeCharged.toFixed(2)}`}
        maxWidth="md"
      >
        <form onSubmit={handleSaveDelivery} className="space-y-4 text-xs">
          <div>
            <label className="block font-bold text-slate-700 uppercase mb-1">
              Valor Pago ao Motoboy / Transportadora (R$) *
            </label>
            <input
              type="number"
              step="0.01"
              required
              value={realDeliveryCost}
              onChange={(e) => setRealDeliveryCost(Number(e.target.value))}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono font-bold text-rose-600 focus:ring-2 focus:ring-blue-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 uppercase mb-1">
              Status da Entrega
            </label>
            <select
              value={deliveryStatus}
              onChange={(e) => setDeliveryStatus(e.target.value as any)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl font-semibold bg-white"
            >
              <option value="aguardando_entrega">Aguardando entrega</option>
              <option value="saiu_para_entrega">Saiu para entrega</option>
              <option value="entregue">Entregue com sucesso</option>
              <option value="retirada">Retirada em balcão</option>
            </select>
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
              Salvar Custo de Entrega
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
