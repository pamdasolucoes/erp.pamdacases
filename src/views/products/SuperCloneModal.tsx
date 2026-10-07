import React, { useState } from 'react';
import { Product } from '../../types/erp';
import { dbService } from '../../services/db';
import { Modal } from '../../components/common/Modal';
import { Sparkles, ArrowRight, Layers, Check } from 'lucide-react';

interface SuperCloneModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCloneSuccess: () => void;
}

export const SuperCloneModal: React.FC<SuperCloneModalProps> = ({
  isOpen,
  onClose,
  onCloneSuccess,
}) => {
  const products = dbService.getProducts();

  const physicalProducts = products.filter((p) => p.type === 'fisico');
  const kitProducts = products.filter((p) => p.type === 'kit');

  const [sourcePhysicalId, setSourcePhysicalId] = useState(
    physicalProducts[0]?.id || ''
  );
  const [sourceKitId, setSourceKitId] = useState(kitProducts[0]?.id || '');
  const [newModelName, setNewModelName] = useState('iPhone 16');
  const [newCost, setNewCost] = useState('2.50');
  const [newSalePrice, setNewSalePrice] = useState('25.00');

  const selectedPhysical = physicalProducts.find((p) => p.id === sourcePhysicalId);
  const selectedKit = kitProducts.find((p) => p.id === sourceKitId);

  const handleExecute = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourcePhysicalId || !sourceKitId || !newModelName.trim()) {
      alert('Selecione o produto físico, o kit e digite o novo modelo.');
      return;
    }

    const res = dbService.superCloneProductAndKit({
      sourcePhysicalProductId: sourcePhysicalId,
      sourceKitId: sourceKitId,
      newModelName: newModelName.trim(),
      newPhysicalCost: Number(newCost),
      newSalePrice: Number(newSalePrice),
    });

    if (res) {
      alert(`Sucesso! Criados com sucesso:\n- ${res.newPhysicalProduct.name}\n- ${res.newKit.name} (com substituição inteligente)`);
      onCloneSuccess();
      onClose();
    } else {
      alert('Erro ao executar a clonagem inteligente.');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="⚡ Clonagem Inteligente (Produto + Kit)"
      subtitle="Crie a capa física e o kit personalizado do novo modelo em um único clique"
      maxWidth="2xl"
    >
      <form onSubmit={handleExecute} className="space-y-4">
        <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-xs leading-relaxed">
          <strong>Como funciona:</strong> Ao lançar um novo aparelho (ex: iPhone 16),
          o sistema duplica a capa física base e o kit de personalização,
          substituindo o componente físico antigo pelo novo e preservando o serviço de DTF UV!
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block font-bold text-slate-700 uppercase mb-1">
              1. Selecionar Produto Físico Base
            </label>
            <select
              value={sourcePhysicalId}
              onChange={(e) => setSourcePhysicalId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium focus:ring-2 focus:ring-blue-600 focus:outline-none bg-white"
            >
              {physicalProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (R$ {p.currentCost.toFixed(2)})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-bold text-slate-700 uppercase mb-1">
              2. Selecionar Kit Composto Base
            </label>
            <select
              value={sourceKitId}
              onChange={(e) => setSourceKitId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium focus:ring-2 focus:ring-blue-600 focus:outline-none bg-white"
            >
              {kitProducts.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name} (R$ {k.salePrice.toFixed(2)})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-200">
          <label className="block text-xs font-bold text-slate-900 uppercase mb-1">
            Nome do Novo Modelo de Celular *
          </label>
          <input
            type="text"
            required
            value={newModelName}
            onChange={(e) => setNewModelName(e.target.value)}
            placeholder="Ex: iPhone 16 ou Galaxy S26"
            className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Custo Estimado da Nova Capa (R$)
            </label>
            <input
              type="number"
              step="0.01"
              value={newCost}
              onChange={(e) => setNewCost(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono focus:ring-2 focus:ring-blue-600 focus:outline-none"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Preço de Venda do Novo Kit (R$)
            </label>
            <input
              type="number"
              step="0.01"
              value={newSalePrice}
              onChange={(e) => setNewSalePrice(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono font-bold text-blue-700 focus:ring-2 focus:ring-blue-600 focus:outline-none"
            />
          </div>
        </div>

        {/* Visual Preview */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
            Pré-visualização do resultado:
          </span>
          <div className="text-slate-700">
            ✅ Será criado: <strong>Capa TPU Transparente {newModelName}</strong> (Físico)
          </div>
          <div className="text-slate-700">
            ✅ Será criado: <strong>Capa personalizada TPU transparente - {newModelName}</strong> (Kit composto)
          </div>
          <div className="text-slate-500 text-[11px] pl-4">
            Componentes: 1x Capa TPU {newModelName} + 1x Impressão DTF UV
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Sparkles className="w-4 h-4" />
            <span>Gerar Produto + Kit Automaticamente</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
