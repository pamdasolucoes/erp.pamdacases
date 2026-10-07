import React, { useState } from 'react';
import { ShoppingBag, Plus, Building2, Calendar, CheckCircle2 } from 'lucide-react';
import { dbService } from '../../services/db';
import { Supplier, Purchase, Product } from '../../types/erp';
import { Modal } from '../../components/common/Modal';

export const PurchasesView: React.FC = () => {
  const [purchases, setPurchases] = useState<Purchase[]>(dbService.getPurchases());
  const [suppliers, setSuppliers] = useState<Supplier[]>(dbService.getSuppliers());
  const [products] = useState<Product[]>(dbService.getProducts());

  const [activeTab, setActiveTab] = useState<'compras' | 'fornecedores'>('compras');

  // Modais
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);

  // Form compra
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(suppliers[0]?.id || '');
  const [selectedProductId, setSelectedProductId] = useState<string>(products.filter((p) => p.type === 'fisico')[0]?.id || '');
  const [purchaseQty, setPurchaseQty] = useState<number>(50);
  const [purchaseUnitCost, setPurchaseUnitCost] = useState<number>(2.5);
  const [updateCost, setUpdateCost] = useState<boolean>(true);
  const [purchaseNotes, setPurchaseNotes] = useState<string>('');

  // Form fornecedor
  const [supplierName, setSupplierName] = useState('');
  const [supplierContact, setSupplierContact] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');

  const refresh = () => {
    setPurchases(dbService.getPurchases());
    setSuppliers(dbService.getSuppliers());
  };

  const handleCreatePurchase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplierId || !selectedProductId || purchaseQty <= 0) {
      alert('Preencha os campos obrigatórios da compra.');
      return;
    }

    const prod = products.find((p) => p.id === selectedProductId);

    dbService.createPurchase({
      supplierId: selectedSupplierId,
      purchaseDate: new Date().toISOString().split('T')[0],
      items: [
        {
          productId: selectedProductId,
          productName: prod ? prod.name : 'Produto Físico',
          quantity: purchaseQty,
          unitCost: purchaseUnitCost,
          subtotal: purchaseQty * purchaseUnitCost,
          updateProductCurrentCost: updateCost,
        },
      ],
      notes: purchaseNotes.trim() || undefined,
    });

    refresh();
    setIsPurchaseModalOpen(false);
    alert('Compra confirmada! Estoque atualizado automaticamente.');
  };

  const handleCreateSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierName.trim()) {
      alert('Nome do fornecedor é obrigatório.');
      return;
    }

    dbService.saveSupplier({
      name: supplierName.trim(),
      contactName: supplierContact.trim() || 'Comercial',
      phone: supplierPhone.trim() || '-',
      active: true,
    });

    refresh();
    setIsSupplierModalOpen(false);
    setSupplierName('');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Compras, Fornecedores & Entrada de Lotes
          </h1>
          <p className="text-xs text-slate-500">
            Registro de pedidos de compra, entrada em estoque e histórico de custo por lote
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsSupplierModalOpen(true)}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            + Fornecedor
          </button>
          <button
            onClick={() => setIsPurchaseModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Registrar Compra</span>
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('compras')}
          className={`pb-3 text-xs font-bold border-b-2 cursor-pointer transition-colors ${
            activeTab === 'compras'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Histórico de Compras ({purchases.length})
        </button>
        <button
          onClick={() => setActiveTab('fornecedores')}
          className={`pb-3 text-xs font-bold border-b-2 cursor-pointer transition-colors ${
            activeTab === 'fornecedores'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Fornecedores Cadastrados ({suppliers.length})
        </button>
      </div>

      {activeTab === 'compras' ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {purchases.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-400">
              Nenhuma compra registrada ainda. Clique em "Registrar Compra" para dar entrada em estoque.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[11px]">
                  <tr>
                    <th className="py-3 px-5">Data Compra</th>
                    <th className="py-3 px-4">Fornecedor</th>
                    <th className="py-3 px-4">Itens Comprados</th>
                    <th className="py-3 px-4 text-right">Valor Total (R$)</th>
                    <th className="py-3 px-4">Comprador</th>
                    <th className="py-3 px-5">Observações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {purchases.map((pur) => (
                    <tr key={pur.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-5 font-mono text-slate-600">
                        {pur.purchaseDate}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {pur.supplierName}
                      </td>
                      <td className="py-3 px-4">
                        {pur.items.map((i) => `${i.quantity}x ${i.productName} (R$ ${i.unitCost.toFixed(2)})`).join(', ')}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        R$ {pur.totalAmount.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-blue-700 font-semibold">
                        {pur.createdByUser}
                      </td>
                      <td className="py-3 px-5 text-slate-500">
                        {pur.notes || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[11px]">
                <tr>
                  <th className="py-3 px-5">Fornecedor</th>
                  <th className="py-3 px-4">Contato</th>
                  <th className="py-3 px-4">Telefone</th>
                  <th className="py-3 px-5">Observações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {suppliers.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-5 font-bold text-slate-900">
                      {s.name}
                    </td>
                    <td className="py-3 px-4 text-slate-700">
                      {s.contactName}
                    </td>
                    <td className="py-3 px-4 font-mono">
                      {s.phone}
                    </td>
                    <td className="py-3 px-5 text-slate-500">
                      {s.notes || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Registrar Compra */}
      <Modal
        isOpen={isPurchaseModalOpen}
        onClose={() => setIsPurchaseModalOpen(false)}
        title="Registrar Compra e Entrada de Lote"
        subtitle="Dá entrada automática no estoque do produto físico e registra o custo"
        maxWidth="md"
      >
        <form onSubmit={handleCreatePurchase} className="space-y-4 text-xs">
          <div>
            <label className="block font-bold text-slate-700 uppercase mb-1">
              Fornecedor *
            </label>
            <select
              value={selectedSupplierId}
              onChange={(e) => setSelectedSupplierId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl font-semibold bg-white"
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-bold text-slate-700 uppercase mb-1">
              Produto Físico *
            </label>
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl font-semibold bg-white"
            >
              {products
                .filter((p) => p.type === 'fisico')
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 uppercase mb-1">
                Quantidade Comprada *
              </label>
              <input
                type="number"
                min="1"
                required
                value={purchaseQty}
                onChange={(e) => setPurchaseQty(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold font-mono"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 uppercase mb-1">
                Custo Unitário (R$) *
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={purchaseUnitCost}
                onChange={(e) => setPurchaseUnitCost(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold font-mono text-blue-700"
              />
            </div>
          </div>

          <div className="pt-1">
            <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800">
              <input
                type="checkbox"
                checked={updateCost}
                onChange={(e) => setUpdateCost(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600"
              />
              <span>Atualizar custo atual do produto no cadastro para R$ {purchaseUnitCost.toFixed(2)}</span>
            </label>
          </div>

          <div>
            <label className="block font-bold text-slate-700 uppercase mb-1">
              Observações
            </label>
            <input
              type="text"
              value={purchaseNotes}
              onChange={(e) => setPurchaseNotes(e.target.value)}
              placeholder="Ex: Lote com 100 capas iPhone 15"
              className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIsPurchaseModalOpen(false)}
              className="px-4 py-2 border border-slate-300 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-xs transition-colors cursor-pointer"
            >
              Confirmar Entrada de Compra
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Novo Fornecedor */}
      <Modal
        isOpen={isSupplierModalOpen}
        onClose={() => setIsSupplierModalOpen(false)}
        title="Cadastrar Fornecedor"
        subtitle="Fornecedor de capas, embalagens ou tintas"
        maxWidth="md"
      >
        <form onSubmit={handleCreateSupplier} className="space-y-4 text-xs">
          <div>
            <label className="block font-bold text-slate-700 uppercase mb-1">
              Nome do Fornecedor *
            </label>
            <input
              type="text"
              required
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              placeholder="Ex: Shenzhen Cases Tech Co."
              className="w-full px-3 py-2 border border-slate-300 rounded-xl font-semibold"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 uppercase mb-1">
              Contato
            </label>
            <input
              type="text"
              value={supplierContact}
              onChange={(e) => setSupplierContact(e.target.value)}
              placeholder="Ex: Lin Chen"
              className="w-full px-3 py-2 border border-slate-300 rounded-xl"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 uppercase mb-1">
              Telefone
            </label>
            <input
              type="text"
              value={supplierPhone}
              onChange={(e) => setSupplierPhone(e.target.value)}
              placeholder="Ex: (11) 98888-0000"
              className="w-full px-3 py-2 border border-slate-300 rounded-xl"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIsSupplierModalOpen(false)}
              className="px-4 py-2 border border-slate-300 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-xs transition-colors cursor-pointer"
            >
              Salvar Fornecedor
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
