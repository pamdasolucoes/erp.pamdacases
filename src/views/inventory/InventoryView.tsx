import React, { useState } from 'react';
import { Box, Plus, Minus, ArrowUpDown, History, AlertTriangle } from 'lucide-react';
import { dbService } from '../../services/db';
import { Product, InventoryMovement, InventoryMovementType } from '../../types/erp';
import { Modal } from '../../components/common/Modal';

export const InventoryView: React.FC = () => {
  const [products, setProducts] = useState<Product[]>(dbService.getProducts());
  const [movements, setMovements] = useState<InventoryMovement[]>(dbService.getInventoryMovements());
  const [activeTab, setActiveTab] = useState<'estoque' | 'movimentacoes'>('estoque');

  // Modal de Ajuste Manual
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(10);
  const [movementType, setMovementType] = useState<InventoryMovementType>('ajuste_positivo');
  const [notes, setNotes] = useState<string>('');

  const refresh = () => {
    setProducts(dbService.getProducts());
    setMovements(dbService.getInventoryMovements());
  };

  const physicalProducts = products.filter((p) => p.type === 'fisico' && p.controlsInventory);

  const handleOpenAdjust = (prod?: Product) => {
    setSelectedProductId(prod ? prod.id : physicalProducts[0]?.id || '');
    setQuantity(10);
    setMovementType('ajuste_positivo');
    setNotes('');
    setIsModalOpen(true);
  };

  const handleSaveAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId || quantity <= 0) {
      alert('Selecione um produto e uma quantidade válida.');
      return;
    }

    const signedQuantity =
      movementType === 'ajuste_negativo' ? -Math.abs(quantity) : Math.abs(quantity);

    dbService.registerInventoryAdjustment({
      productId: selectedProductId,
      quantity: signedQuantity,
      movementType,
      notes: notes.trim() || undefined,
    });

    refresh();
    setIsModalOpen(false);
    alert('Ajuste de estoque concluído com sucesso!');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Controle de Estoque & Movimentações
          </h1>
          <p className="text-xs text-slate-500">
            Acompanhamento em tempo real de capas físicas, estoque disponível e histórico de baixas
          </p>
        </div>

        <button
          onClick={() => handleOpenAdjust()}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
        >
          <ArrowUpDown className="w-4 h-4" />
          <span>Ajustar Estoque</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('estoque')}
          className={`pb-3 text-xs font-bold border-b-2 cursor-pointer transition-colors ${
            activeTab === 'estoque'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Saldos de Produtos Físicos ({physicalProducts.length})
        </button>
        <button
          onClick={() => setActiveTab('movimentacoes')}
          className={`pb-3 text-xs font-bold border-b-2 cursor-pointer transition-colors ${
            activeTab === 'movimentacoes'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Histórico de Movimentações ({movements.length})
        </button>
      </div>

      {activeTab === 'estoque' ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[11px] font-bold">
                <tr>
                  <th className="py-3 px-5">Código / SKU</th>
                  <th className="py-3 px-4">Produto Físico</th>
                  <th className="py-3 px-4">Modelo</th>
                  <th className="py-3 px-4 text-center">Estoque Físico</th>
                  <th className="py-3 px-4 text-center">Estoque Mínimo</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Custo Unit. (R$)</th>
                  <th className="py-3 px-4 text-right">Valor em Estoque</th>
                  <th className="py-3 px-5 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {physicalProducts.map((p) => {
                  const isLow = p.currentInventory <= p.minInventory;
                  const totalInventoryValue = p.currentInventory * p.currentCost;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-5 font-mono">
                        <span className="font-bold text-slate-900">{p.code}</span>
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {p.name}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {p.modelPhone || '-'}
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-black text-sm">
                        {p.currentInventory} un
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-slate-500">
                        {p.minInventory} un
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            isLow
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {isLow ? 'Estoque Baixo' : 'Normal'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-600">
                        R$ {p.currentCost.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        R$ {totalInventoryValue.toFixed(2)}
                      </td>
                      <td className="py-3 px-5 text-right">
                        <button
                          onClick={() => handleOpenAdjust(p)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded text-[11px] transition-colors cursor-pointer"
                        >
                          Ajustar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[11px] font-bold">
                <tr>
                  <th className="py-3 px-5">Data/Hora</th>
                  <th className="py-3 px-4">Produto</th>
                  <th className="py-3 px-4 text-center">Tipo de Movimento</th>
                  <th className="py-3 px-4 text-center">Qtd</th>
                  <th className="py-3 px-4 text-center">Anterior</th>
                  <th className="py-3 px-4 text-center">Resultado</th>
                  <th className="py-3 px-4">Usuário</th>
                  <th className="py-3 px-5">Observações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {movements.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-5 font-mono text-slate-600">
                      {new Date(m.recordedAt).toLocaleString('pt-BR')}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-900">
                      {m.productName}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                        {m.movementType.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-bold">
                      <span className={m.quantity > 0 ? 'text-emerald-700' : 'text-rose-600'}>
                        {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center font-mono text-slate-500">
                      {m.previousInventory}
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-slate-900">
                      {m.resultingInventory}
                    </td>
                    <td className="py-3 px-4 font-semibold text-blue-700">
                      {m.username}
                    </td>
                    <td className="py-3 px-5 text-slate-500">
                      {m.notes || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Ajuste Manual */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Ajuste Manual de Estoque"
        subtitle="Entrada por compra, correção de contagem ou devolução"
        maxWidth="md"
      >
        <form onSubmit={handleSaveAdjustment} className="space-y-4 text-xs">
          <div>
            <label className="block font-bold text-slate-700 uppercase mb-1">
              Produto Físico *
            </label>
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium focus:ring-2 focus:ring-blue-600 focus:outline-none bg-white"
            >
              {physicalProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (Atual: {p.currentInventory} un)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-bold text-slate-700 uppercase mb-1">
              Tipo de Movimentação *
            </label>
            <select
              value={movementType}
              onChange={(e) => setMovementType(e.target.value as any)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl font-semibold focus:ring-2 focus:ring-blue-600 focus:outline-none bg-white"
            >
              <option value="ajuste_positivo">Ajuste Positivo (+)</option>
              <option value="ajuste_negativo">Ajuste Negativo (-)</option>
              <option value="compra">Entrada por Compra (+)</option>
              <option value="devolucao">Devolução (+)</option>
              <option value="correcao_manual">Correção de Contagem</option>
            </select>
          </div>

          <div>
            <label className="block font-bold text-slate-700 uppercase mb-1">
              Quantidade de Unidades *
            </label>
            <input
              type="number"
              min="1"
              required
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold focus:ring-2 focus:ring-blue-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 uppercase mb-1">
              Motivo / Observações
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Contagem física quinzenal"
              className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium focus:ring-2 focus:ring-blue-600 focus:outline-none"
            />
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
              Registrar Movimentação
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
