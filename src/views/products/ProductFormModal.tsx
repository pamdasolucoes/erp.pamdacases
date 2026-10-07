import React, { useState } from 'react';
import { Product, ProductType } from '../../types/erp';
import { dbService } from '../../services/db';
import { Modal } from '../../components/common/Modal';
import { Save, History } from 'lucide-react';

interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  onSaved: () => void;
}

export const ProductFormModal: React.FC<ProductFormModalProps> = ({
  isOpen,
  onClose,
  product,
  onSaved,
}) => {
  const [activeTab, setActiveTab] = useState<'geral' | 'estoque' | 'historico'>('geral');

  const [form, setForm] = useState({
    name: product?.name || '',
    code: product?.code || '',
    sku: product?.sku || '',
    category: product?.category || 'Capas',
    brand: product?.brand || 'Pamda',
    modelPhone: product?.modelPhone || '',
    type: (product?.type || 'fisico') as ProductType,
    currentCost: product?.currentCost || 0,
    salePrice: product?.salePrice || 0,
    controlsInventory: product ? product.controlsInventory : true,
    currentInventory: product?.currentInventory || 0,
    minInventory: product?.minInventory || 10,
    b2bSiteVisible: product ? product.b2bSiteVisible : true,
    active: product ? product.active : true,
    description: product?.description || '',
  });

  // Re-sync when product changes
  React.useEffect(() => {
    if (product) {
      setForm({
        name: product.name,
        code: product.code,
        sku: product.sku,
        category: product.category,
        brand: product.brand,
        modelPhone: product.modelPhone || '',
        type: product.type,
        currentCost: product.currentCost,
        salePrice: product.salePrice,
        controlsInventory: product.controlsInventory,
        currentInventory: product.currentInventory,
        minInventory: product.minInventory,
        b2bSiteVisible: product.b2bSiteVisible,
        active: product.active,
        description: product.description,
      });
    } else {
      setForm({
        name: '',
        code: 'CAP-' + Math.floor(1000 + Math.random() * 9000),
        sku: 'SKU-' + Math.floor(1000 + Math.random() * 9000),
        category: 'Capas TPU',
        brand: 'Pamda',
        modelPhone: '',
        type: 'fisico',
        currentCost: 2.5,
        salePrice: 10.0,
        controlsInventory: true,
        currentInventory: 50,
        minInventory: 15,
        b2bSiteVisible: true,
        active: true,
        description: '',
      });
    }
  }, [product, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      alert('Nome do produto é obrigatório.');
      return;
    }

    const payload = {
      ...form,
      currentCost: Number(form.currentCost),
      salePrice: Number(form.salePrice),
      currentInventory: Number(form.currentInventory),
      minInventory: Number(form.minInventory),
    };

    if (product) {
      dbService.saveProduct({ ...payload, id: product.id });
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
      title={product ? `Editar: ${product.name}` : 'Cadastro de Produto'}
      subtitle="Defina os parâmetros do item, custos e controle de estoque"
      maxWidth="3xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Tabs inside modal */}
        <div className="flex items-center gap-4 border-b border-slate-200 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab('geral')}
            className={`text-xs font-bold pb-1 cursor-pointer transition-colors ${
              activeTab === 'geral' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Dados gerais
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('estoque')}
            className={`text-xs font-bold pb-1 cursor-pointer transition-colors ${
              activeTab === 'estoque' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Estoque & Venda
          </button>
          {product?.costHistory && product.costHistory.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab('historico')}
              className={`text-xs font-bold pb-1 cursor-pointer transition-colors flex items-center gap-1 ${
                activeTab === 'historico' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Histórico de Custos ({product.costHistory.length})</span>
            </button>
          )}
        </div>

        {activeTab === 'geral' && (
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Tipo de Produto *
                </label>
                <select
                  value={form.type}
                  onChange={(e) => {
                    const t = e.target.value as ProductType;
                    setForm({
                      ...form,
                      type: t,
                      controlsInventory: t === 'fisico' || t === 'insumo',
                    });
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-600 focus:outline-none bg-white"
                >
                  <option value="fisico">Produto físico</option>
                  <option value="servico">Serviço (ex: DTF UV)</option>
                  <option value="insumo">Insumo</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Nome do Item *
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex: Capa TPU Transparente iPhone 15"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Código Interno
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
                  Categoria
                </label>
                <input
                  type="text"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="Capas TPU, MagSafe, etc."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Modelo Celular
                </label>
                <input
                  type="text"
                  value={form.modelPhone}
                  onChange={(e) => setForm({ ...form, modelPhone: e.target.value })}
                  placeholder="Ex: iPhone 15, S25 FE"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Descrição Detalhada
              </label>
              <textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Ex: Capa TPU transparente anti-impacto para iPhone 15."
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-600 focus:outline-none"
              />
            </div>
          </div>
        )}

        {activeTab === 'estoque' && (
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <h4 className="text-xs font-bold text-slate-800 uppercase">Valores Financeiros</h4>
                <div>
                  <label className="block text-slate-600 text-xs font-semibold mb-1">
                    Custo Atual (R$) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={form.currentCost}
                    onChange={(e) => setForm({ ...form, currentCost: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Alterações de custo ficam registradas no histórico imutável.
                  </p>
                </div>

                <div>
                  <label className="block text-slate-600 text-xs font-semibold mb-1">
                    Preço de Venda B2B (R$) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={form.salePrice}
                    onChange={(e) => setForm({ ...form, salePrice: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono font-bold text-emerald-700 focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800 uppercase">Controle de Estoque</h4>
                  <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={form.controlsInventory}
                      onChange={(e) => setForm({ ...form, controlsInventory: e.target.checked })}
                      className="rounded text-blue-600 w-4 h-4"
                    />
                    <span>Controla Estoque</span>
                  </label>
                </div>

                {form.controlsInventory ? (
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-slate-600 text-xs font-semibold mb-1">
                        Estoque Atual
                      </label>
                      <input
                        type="number"
                        value={form.currentInventory}
                        onChange={(e) => setForm({ ...form, currentInventory: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 text-xs font-semibold mb-1">
                        Estoque Mínimo
                      </label>
                      <input
                        type="number"
                        value={form.minInventory}
                        onChange={(e) => setForm({ ...form, minInventory: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-600 focus:outline-none"
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 py-3">
                    Itens como serviços ou materiais não controlados não movimentam estoque.
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-6 pt-2 text-xs">
              <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={form.b2bSiteVisible}
                  onChange={(e) => setForm({ ...form, b2bSiteVisible: e.target.checked })}
                  className="rounded text-blue-600 w-4 h-4"
                />
                <span>Disponível no Site B2B</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  className="rounded text-blue-600 w-4 h-4"
                />
                <span>Produto Ativo</span>
              </label>
            </div>
          </div>
        )}

        {activeTab === 'historico' && product?.costHistory && (
          <div className="pt-2">
            <p className="text-xs text-slate-500 mb-3">
              Cada alteração de custo fica registrada de forma imutável para não corromper relatórios retroativos:
            </p>
            <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3">Data/Hora</th>
                    <th className="py-2.5 px-3">Custo Registrado</th>
                    <th className="py-2.5 px-3">Usuário</th>
                    <th className="py-2.5 px-3">Motivo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {product.costHistory.map((h) => (
                    <tr key={h.id}>
                      <td className="py-2 px-3">{new Date(h.recordedAt).toLocaleString('pt-BR')}</td>
                      <td className="py-2 px-3 font-mono font-bold text-slate-900">
                        R$ {h.cost.toFixed(2)}
                      </td>
                      <td className="py-2 px-3 font-semibold text-blue-700">{h.recordedByUsername}</td>
                      <td className="py-2 px-3 text-slate-500">{h.reason || 'Alteração de custo'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

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
            <span>Salvar Produto</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
