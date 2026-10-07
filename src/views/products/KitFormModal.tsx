import React, { useState, useEffect } from 'react';
import { Product, KitComponent } from '../../types/erp';
import { dbService } from '../../services/db';
import { Modal } from '../../components/common/Modal';
import { Plus, Trash2, Save, Layers } from 'lucide-react';

interface KitFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  kit: Product | null;
  onSaved: () => void;
}

export const KitFormModal: React.FC<KitFormModalProps> = ({
  isOpen,
  onClose,
  kit,
  onSaved,
}) => {
  const allProducts = dbService.getProducts();

  const [form, setForm] = useState({
    name: kit?.name || '',
    sku: kit?.sku || '',
    code: kit?.code || '',
    category: kit?.category || 'Kits Personalizados',
    modelPhone: kit?.modelPhone || '',
    salePrice: kit?.salePrice || 25.0,
    managerialCost: kit?.managerialCost || 5.0,
    active: kit ? kit.active : true,
    b2bSiteVisible: kit ? kit.b2bSiteVisible : true,
  });

  const [components, setComponents] = useState<KitComponent[]>(kit?.components || []);

  // Sync state
  useEffect(() => {
    if (kit) {
      setForm({
        name: kit.name,
        sku: kit.sku,
        code: kit.code,
        category: kit.category,
        modelPhone: kit.modelPhone || '',
        salePrice: kit.salePrice,
        managerialCost: kit.managerialCost || 5.0,
        active: kit.active,
        b2bSiteVisible: kit.b2bSiteVisible,
      });
      setComponents(kit.components ? JSON.parse(JSON.stringify(kit.components)) : []);
    } else {
      setForm({
        name: '',
        sku: 'KIT-DTF-' + Math.floor(1000 + Math.random() * 9000),
        code: Math.floor(10000 + Math.random() * 89999).toString(),
        category: 'Kits Personalizados',
        modelPhone: '',
        salePrice: 25.0,
        managerialCost: 5.0,
        active: true,
        b2bSiteVisible: true,
      });

      // Se for novo kit, inicializar por conveniência com 1 Capa TPU e 1 Impressão DTF UV se disponíveis
      const defaultTpu = allProducts.find((p) => p.type === 'fisico');
      const defaultDtf = allProducts.find((p) => p.type === 'servico');
      const initial: KitComponent[] = [];

      if (defaultTpu) {
        initial.push({
          id: 'cmp-' + Date.now() + '-1',
          componentProductId: defaultTpu.id,
          componentName: defaultTpu.name,
          componentType: 'fisico',
          quantity: 1,
          currentUnitCost: defaultTpu.currentCost,
          controlsInventory: true,
          sortOrder: 1,
        });
      }
      if (defaultDtf) {
        initial.push({
          id: 'cmp-' + Date.now() + '-2',
          componentProductId: defaultDtf.id,
          componentName: defaultDtf.name,
          componentType: 'servico',
          quantity: 1,
          currentUnitCost: defaultDtf.currentCost,
          controlsInventory: false,
          sortOrder: 2,
        });
      }
      setComponents(initial);
    }
  }, [kit, isOpen]);

  // Custo Direto Calculado = soma(custo * qtd)
  const directCostCalculated = components.reduce(
    (acc, c) => acc + c.currentUnitCost * c.quantity,
    0
  );

  const managerialCost = form.managerialCost || directCostCalculated;
  const marginValue = form.salePrice - managerialCost;
  const marginPercent = form.salePrice > 0 ? (marginValue / form.salePrice) * 100 : 0;

  const handleAddComponent = (productId: string) => {
    const prod = allProducts.find((p) => p.id === productId);
    if (!prod) return;

    const newCmp: KitComponent = {
      id: 'cmp-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      componentProductId: prod.id,
      componentName: prod.name,
      componentType: prod.type,
      quantity: 1,
      currentUnitCost: prod.currentCost,
      controlsInventory: prod.controlsInventory,
      sortOrder: components.length + 1,
    };

    setComponents([...components, newCmp]);
  };

  const handleUpdateComponentQty = (index: number, qty: number) => {
    const updated = [...components];
    updated[index].quantity = Math.max(1, qty);
    setComponents(updated);
  };

  const handleRemoveComponent = (index: number) => {
    setComponents(components.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      alert('Nome do kit é obrigatório.');
      return;
    }
    if (components.length === 0) {
      alert('Adicione pelo menos um componente ao kit.');
      return;
    }

    const payload: Omit<Product, 'id' | 'createdAt' | 'updatedAt'> = {
      name: form.name.trim(),
      sku: form.sku.trim(),
      code: form.code.trim(),
      description: `Kit Composto: ${components.map((c) => `${c.quantity}x ${c.componentName}`).join(' + ')}`,
      category: form.category,
      brand: 'Pamda',
      modelPhone: form.modelPhone || undefined,
      type: 'kit',
      currentCost: directCostCalculated,
      managerialCost: Number(form.managerialCost),
      salePrice: Number(form.salePrice),
      controlsInventory: false,
      currentInventory: 0,
      minInventory: 0,
      active: form.active,
      b2bSiteVisible: form.b2bSiteVisible,
      components,
    };

    if (kit) {
      dbService.saveProduct({ ...payload, id: kit.id });
    } else {
      dbService.saveProduct(payload);
    }

    onSaved();
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={kit ? `Editar Kit: ${kit.name}` : 'Cadastro de Kit / Produto Composto'}
      subtitle="Defina os componentes físicos e serviços que integram este kit"
      maxWidth="3xl"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Nome do Kit Composto *
            </label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ex: Capa personalizada TPU transparente iPhone 15"
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Preço de Venda B2B (R$) *
            </label>
            <input
              type="number"
              step="0.01"
              required
              value={form.salePrice}
              onChange={(e) => setForm({ ...form, salePrice: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono font-bold text-blue-700 focus:ring-2 focus:ring-blue-600 focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Código / Recibo
            </label>
            <input
              type="text"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono font-medium focus:ring-2 focus:ring-blue-600 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              SKU
            </label>
            <input
              type="text"
              value={form.sku}
              onChange={(e) => setForm({ ...form, sku: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono font-medium focus:ring-2 focus:ring-blue-600 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Modelo de Aparelho
            </label>
            <input
              type="text"
              value={form.modelPhone}
              onChange={(e) => setForm({ ...form, modelPhone: e.target.value })}
              placeholder="Ex: iPhone 15"
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-600 focus:outline-none"
            />
          </div>
        </div>

        {/* Componentes do Kit (Screen 5) */}
        <div className="pt-2 border-t border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Componentes do Kit
              </h4>
              <p className="text-[11px] text-slate-500">
                Ao vender o kit, o sistema dá baixa apenas nos produtos físicos do estoque e soma os custos.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    handleAddComponent(e.target.value);
                    e.target.value = '';
                  }
                }}
                className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-medium bg-slate-50 focus:ring-2 focus:ring-blue-600 focus:outline-none cursor-pointer"
              >
                <option value="">+ Adicionar componente...</option>
                {allProducts
                  .filter((p) => p.type !== 'kit')
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.type}) - R$ {p.currentCost.toFixed(2)}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[11px]">
                <tr>
                  <th className="py-2.5 px-3 w-8">#</th>
                  <th className="py-2.5 px-3">Componente</th>
                  <th className="py-2.5 px-3">Tipo</th>
                  <th className="py-2.5 px-3 w-20 text-center">Qtd</th>
                  <th className="py-2.5 px-3 text-right">Custo Atual (R$)</th>
                  <th className="py-2.5 px-3 text-right">Subtotal (R$)</th>
                  <th className="py-2.5 px-3 w-10 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {components.map((c, idx) => (
                  <tr key={c.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-3 text-slate-400 font-medium">{idx + 1}</td>
                    <td className="py-2.5 px-3 font-semibold text-slate-900">
                      {c.componentName}
                    </td>
                    <td className="py-2.5 px-3 capitalize">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          c.componentType === 'fisico'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-purple-50 text-purple-700 border border-purple-200'
                        }`}
                      >
                        {c.componentType}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <input
                        type="number"
                        min="1"
                        value={c.quantity}
                        onChange={(e) => handleUpdateComponentQty(idx, Number(e.target.value))}
                        className="w-14 px-2 py-1 border border-slate-300 rounded text-center font-bold focus:ring-1 focus:ring-blue-600 focus:outline-none"
                      />
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      R$ {c.currentUnitCost.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                      R$ {(c.currentUnitCost * c.quantity).toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveComponent(idx)}
                        className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summaries matching Screen 5 exactly */}
          <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="space-y-2">
              <div className="flex justify-between text-slate-600">
                <span>Custo direto calculado:</span>
                <span className="font-mono font-bold text-slate-900">
                  R$ {directCostCalculated.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-700 font-semibold">Custo gerencial (R$):</span>
                <input
                  type="number"
                  step="0.01"
                  value={form.managerialCost}
                  onChange={(e) => setForm({ ...form, managerialCost: Number(e.target.value) })}
                  className="w-24 px-2 py-1 bg-white border border-slate-300 rounded font-mono font-bold text-right focus:ring-1 focus:ring-blue-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-2 border-t sm:border-t-0 sm:border-l border-slate-200 sm:pl-4">
              <div className="flex justify-between text-slate-600">
                <span>Preço de venda (R$):</span>
                <span className="font-mono font-bold text-slate-900">
                  R$ {form.salePrice.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-xs font-bold text-emerald-700">
                <span>Margem (gerencial):</span>
                <span className="font-mono">
                  R$ {marginValue.toFixed(2)} ({marginPercent.toFixed(1)}%)
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Save className="w-4 h-4" />
            <span>Salvar Kit</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
