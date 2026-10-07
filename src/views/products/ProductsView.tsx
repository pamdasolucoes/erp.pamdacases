import React, { useState } from 'react';
import {
  Box,
  Layers,
  Plus,
  Copy,
  Sparkles,
  Edit2,
  Trash2,
  Search,
  CheckCircle2,
  XCircle,
  Eye,
} from 'lucide-react';
import { Product, ProductType } from '../../types/erp';
import { dbService } from '../../services/db';
import { ProductFormModal } from './ProductFormModal';
import { KitFormModal } from './KitFormModal';
import { SuperCloneModal } from './SuperCloneModal';

export const ProductsView: React.FC = () => {
  const [products, setProducts] = useState<Product[]>(dbService.getProducts());
  const [filterType, setFilterType] = useState<string>('todos');
  const [searchQuery, setSearchQuery] = useState('');

  // Modais
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const [isKitModalOpen, setIsKitModalOpen] = useState(false);
  const [editingKit, setEditingKit] = useState<Product | null>(null);

  const [isSuperCloneOpen, setIsSuperCloneOpen] = useState(false);

  const refreshProducts = () => {
    setProducts(dbService.getProducts());
  };

  const filteredProducts = products.filter((p) => {
    const matchesType = filterType === 'todos' || p.type === filterType;
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.modelPhone && p.modelPhone.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesType && matchesSearch;
  });

  const handleOpenNewProduct = () => {
    setEditingProduct(null);
    setIsProductModalOpen(true);
  };

  const handleOpenEditProduct = (prod: Product) => {
    if (prod.type === 'kit') {
      setEditingKit(prod);
      setIsKitModalOpen(true);
    } else {
      setEditingProduct(prod);
      setIsProductModalOpen(true);
    }
  };

  const handleOpenNewKit = () => {
    setEditingKit(null);
    setIsKitModalOpen(true);
  };

  // Clonar Produto Individual
  const handleCloneProduct = (prod: Product) => {
    const newName = prompt('Digite o nome do produto clonado:', `${prod.name} (Cópia)`);
    if (!newName) return;
    const newSku = prompt('Digite o novo SKU:', `${prod.sku}-COPY`);
    if (!newSku) return;

    dbService.cloneProduct(prod.id, {
      name: newName,
      sku: newSku,
      code: 'CAP-' + Math.floor(1000 + Math.random() * 9000),
    });
    refreshProducts();
    alert('Produto clonado com sucesso!');
  };

  // Clonar Kit Individual
  const handleCloneKit = (kit: Product) => {
    const newName = prompt('Digite o nome do kit clonado:', `${kit.name} (Cópia)`);
    if (!newName) return;
    const newSku = prompt('Digite o novo SKU:', `${kit.sku}-COPY`);
    if (!newSku) return;

    dbService.cloneKit(kit.id, {
      name: newName,
      sku: newSku,
      code: Math.floor(10000 + Math.random() * 89999).toString(),
    });
    refreshProducts();
    alert('Kit clonado com sucesso com todos os componentes replicados!');
  };

  const handleToggleActive = (id: string) => {
    dbService.toggleProductActive(id);
    refreshProducts();
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Catálogo de Produtos, Serviços & Kits
          </h1>
          <p className="text-xs text-slate-500">
            Controle de capas físicas, serviços DTF UV, kits compostos e custos históricos
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Super Clone Button */}
          <button
            onClick={() => setIsSuperCloneOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-purple-600" />
            <span>Duplicar Produto + Kit</span>
          </button>

          {/* Novo Kit */}
          <button
            onClick={handleOpenNewKit}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            <Layers className="w-4 h-4 text-indigo-600" />
            <span>Novo Kit Composto</span>
          </button>

          {/* Novo Produto */}
          <button
            onClick={handleOpenNewProduct}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Produto</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: 'todos', label: 'Todos' },
            { id: 'fisico', label: 'Produtos Físicos' },
            { id: 'servico', label: 'Serviços (DTF UV)' },
            { id: 'kit', label: 'Kits Compostos' },
            { id: 'insumo', label: 'Insumos' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterType(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer transition-colors ${
                filterType === tab.id
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
            placeholder="Buscar por nome, SKU, código..."
            className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-600 focus:outline-none"
          />
        </div>
      </div>

      {/* Products Table (Screens 4 e 5) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[11px] font-bold">
              <tr>
                <th className="py-3 px-5">Código / SKU</th>
                <th className="py-3 px-4">Nome do Item</th>
                <th className="py-3 px-4">Tipo</th>
                <th className="py-3 px-4 text-right">Custo Direto</th>
                <th className="py-3 px-4 text-right">Custo Gerencial</th>
                <th className="py-3 px-4 text-right">Preço Venda</th>
                <th className="py-3 px-4 text-center">Estoque</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredProducts.map((prod) => {
                const isKit = prod.type === 'kit';
                const isServico = prod.type === 'servico';
                return (
                  <tr key={prod.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-5 font-mono">
                      <span className="font-bold text-slate-900">{prod.code}</span>
                      <span className="block text-[10px] text-slate-400">{prod.sku}</span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900 text-sm">{prod.name}</div>
                      {prod.modelPhone && (
                        <span className="inline-block mt-0.5 text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">
                          {prod.modelPhone}
                        </span>
                      )}
                      {isKit && prod.components && (
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {prod.components.length} componentes ({prod.components.map((c) => c.componentName).join(', ')})
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          prod.type === 'fisico'
                            ? 'bg-blue-100 text-blue-800'
                            : prod.type === 'servico'
                            ? 'bg-purple-100 text-purple-800'
                            : prod.type === 'kit'
                            ? 'bg-indigo-100 text-indigo-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {prod.type}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-600">
                      R$ {prod.currentCost.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700 font-semibold">
                      {prod.managerialCost ? `R$ ${prod.managerialCost.toFixed(2)}` : '-'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700 text-sm">
                      R$ {prod.salePrice.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {prod.controlsInventory ? (
                        <span
                          className={`font-mono font-bold px-2 py-0.5 rounded ${
                            prod.currentInventory <= prod.minInventory
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-emerald-50 text-emerald-800'
                          }`}
                        >
                          {prod.currentInventory} un
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[10px] uppercase">
                          {isServico ? 'Serviço' : isKit ? 'Composto' : 'Não'}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => handleToggleActive(prod.id)}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded cursor-pointer transition-colors ${
                          prod.active
                            ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        {prod.active ? 'Ativo' : 'Inativo'}
                      </button>
                    </td>
                    <td className="py-3 px-5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenEditProduct(prod)}
                          title="Editar"
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => (isKit ? handleCloneKit(prod) : handleCloneProduct(prod))}
                          title="Clonar item"
                          className="p-1.5 text-slate-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      <ProductFormModal
        isOpen={isProductModalOpen}
        onClose={() => setIsProductModalOpen(false)}
        product={editingProduct}
        onSaved={refreshProducts}
      />

      <KitFormModal
        isOpen={isKitModalOpen}
        onClose={() => setIsKitModalOpen(false)}
        kit={editingKit}
        onSaved={refreshProducts}
      />

      <SuperCloneModal
        isOpen={isSuperCloneOpen}
        onClose={() => setIsSuperCloneOpen(false)}
        onCloneSuccess={refreshProducts}
      />
    </div>
  );
};
