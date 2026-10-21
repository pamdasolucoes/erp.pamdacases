import React, { useEffect, useMemo, useState } from 'react';
import { Layers, Plus, Copy, Sparkles, Edit2, Search, RefreshCw } from 'lucide-react';
import { authService } from '../../services/auth';
import { ProductAdminModal } from './ProductAdminModal';
import type { OfficialProduct } from '../../types/productCatalog';
import { useProducts } from '../../hooks/useProducts';
import { searchProducts } from '../../services/productMapping';
import { ProductThumbnail } from '../../components/common/ProductThumbnail';
import { useProgressiveRows } from '../../hooks/useProgressiveRows';

const money = (value: number | null) => value === null ? 'Não informado' : value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const writePending = 'Operação indisponível nesta etapa de leitura. Aguarda integração e testes das funções protegidas.';
export const ProductsView: React.FC = () => {
  const [admin, setAdmin] = useState(false);
  const [selection, setSelection] = useState<{ product: OfficialProduct; action: 'sku' | 'archive' } | null>(null);
  useEffect(() => authService.subscribe((user, loading, error) => {
    setAdmin(!loading && !error && user?.active === true && user.role === 'admin_gerencial');
    setSelection(null);
  }), []);
  const { products, loading, refreshing, error, reload } = useProducts();
  const [filterType, setFilterType] = useState('todos');
  const [searchQuery, setSearchQuery] = useState('');
  const filteredProducts = useMemo(() => searchProducts(products, searchQuery).filter(product => filterType === 'todos' || product.type === filterType), [products, filterType, searchQuery]);
  const list = useProgressiveRows(filteredProducts, `${filterType}:${searchQuery}`);
  const countType = (type: string) => products.filter(product => product.type === type).length;
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Catálogo de Produtos, Serviços & Kits</h1>
          <p className="text-xs text-slate-500">Controle de capas físicas, serviços DTF UV, kits compostos e custos históricos</p>
          <button onClick={reload} disabled={loading} className="inline-flex items-center gap-1.5 mt-2 text-xs text-blue-700 disabled:opacity-50"><RefreshCw className="w-3.5 h-3.5" />Atualizar catálogo</button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button disabled title={writePending} className="flex items-center gap-1.5 px-3 py-2 bg-purple-50 text-purple-700 border border-purple-200 text-xs font-bold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"><Sparkles className="w-4 h-4 text-purple-600" /><span>Duplicar Produto + Kit</span></button>
          <button disabled title={writePending} className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-bold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"><Layers className="w-4 h-4 text-indigo-600" /><span>Novo Kit Composto</span></button>
          <button disabled title={writePending} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"><Plus className="w-4 h-4" /><span>Novo Produto</span></button>
        </div>
      </div>
      <p className="text-xs text-slate-500">PAMDA CORE · SKU e arquivamento restritos a administradores; funções protegidas exigem homologação.</p>
      {admin && selection && <ProductAdminModal key={`${selection.product.id}:${selection.action}`} {...selection} products={products} close={() => setSelection(null)} />}{refreshing && <p role="status" className="text-xs text-slate-500">Atualizando catálogo oficial...</p>}
      {!loading && !error && <p aria-live="polite" className="text-xs text-slate-600">{products.length} itens oficiais · {countType('fisico')} físicos · {countType('servico')} serviços · {countType('kit')} kits · {countType('insumo')} insumos · {products.reduce((sum, product) => sum + product.components.length, 0)} vínculos de componentes</p>}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          {[{ id:'todos',label:'Todos' },{ id:'fisico',label:'Produtos Físicos' },{ id:'servico',label:'Serviços (DTF UV)' },{ id:'kit',label:'Kits Compostos' },{ id:'insumo',label:'Insumos' }].map(tab => <button key={tab.id} onClick={() => setFilterType(tab.id)} className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer transition-colors ${filterType === tab.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{tab.label}</button>)}
        </div>
        <div className="relative w-full sm:w-64"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" /><input type="text" aria-label="Buscar produtos por nome, SKU ou código" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="Buscar por nome, SKU, código..." className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-600 focus:outline-none" /></div>
      </div>
      {loading ? <p role="status" className="rounded-2xl bg-white border border-slate-200 p-8 text-sm text-slate-600">Carregando catálogo e componentes oficiais...</p> : error ? <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800"><p>{error}</p><button onClick={reload} className="underline mt-3 font-bold">Tentar novamente</button></div> :
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[11px] font-bold"><tr><th className="py-3 px-5">Código / SKU</th><th className="py-3 px-4">Nome do Item</th><th className="py-3 px-4">Tipo</th><th className="py-3 px-4 text-right">Custo Direto</th><th className="py-3 px-4 text-right">Custo Gerencial</th><th className="py-3 px-4 text-right">Preço Venda</th><th className="py-3 px-4 text-center">Estoque</th><th className="py-3 px-4 text-center">Status</th><th className="py-3 px-5 text-right">Ações</th></tr></thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {!filteredProducts.length && <tr><td colSpan={9} className="p-8 text-center text-slate-500">{products.length ? 'Nenhum produto encontrado para esta pesquisa.' : 'Nenhum produto disponível para esta conta.'}</td></tr>}
            {list.visible.map(product => <tr key={product.id} data-testid={`product-${product.id}`} className="hover:bg-slate-50/80 transition-colors">
              <td className="py-3 px-5 font-mono"><span className="font-bold text-slate-900 whitespace-pre-wrap">{product.code}</span><span className="block text-[10px] text-slate-400 whitespace-pre-wrap">{product.sku}</span></td>
              <td className="py-3 px-4"><div className="flex items-start gap-2"><ProductThumbnail url={product.imageUrl} /><div><div className="font-bold text-slate-900 text-sm">{product.name}</div>{product.modelPhone && <span className="inline-block mt-0.5 text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">{product.modelPhone}</span>}{product.type === 'kit' && <div className="text-[10px] text-slate-400 mt-0.5">{product.components.length} componentes ({product.components.map(component => `${component.quantity} × ${component.componentName}`).join(', ')})</div>}</div></div></td>
              <td className="py-3 px-4"><span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${product.type === 'fisico' ? 'bg-blue-100 text-blue-800' : product.type === 'servico' ? 'bg-purple-100 text-purple-800' : product.type === 'kit' ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-700'}`}>{product.type}</span></td>
              <td className="py-3 px-4 text-right font-mono text-slate-600">{money(product.currentCost)}</td><td className="py-3 px-4 text-right font-mono text-slate-700 font-semibold">{money(product.managerialCost)}</td><td className="py-3 px-4 text-right font-mono font-bold text-emerald-700 text-sm">{money(product.salePrice)}</td>
              <td className="py-3 px-4 text-center">{product.controlsInventory ? <><span className={`font-mono font-bold px-2 py-0.5 rounded ${product.stockVerified && product.currentInventory <= product.minInventory ? 'bg-rose-100 text-rose-800' : product.stockVerified ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>{product.currentInventory} un</span>{!product.stockVerified && <span className="block text-[10px] text-amber-800 mt-1">Não conferido</span>}</> : <span className="text-slate-400 text-[10px] uppercase">{product.type === 'servico' ? 'Serviço' : product.type === 'kit' ? 'Composto' : 'Não'}</span>}</td>
              <td className="py-3 px-4 text-center"><span className={`text-[10px] font-bold px-2 py-0.5 rounded ${product.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>{product.active ? 'Ativo' : 'Inativo'}</span></td>
              <td className="py-3 px-5 text-right"><div className="flex items-center justify-end gap-1.5">{admin && <><button onClick={() => setSelection({ product, action: 'sku' })} className="text-blue-700 text-xs">Alterar SKU</button><button disabled={!product.active} onClick={() => setSelection({ product, action: 'archive' })} className="text-rose-700 text-xs disabled:opacity-50">Excluir produto</button></>}<button disabled title={writePending} aria-label={`Editar ${product.name}`} className="p-1.5 text-slate-500 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"><Edit2 className="w-3.5 h-3.5" /></button><button disabled title={writePending} aria-label={`Clonar ${product.name}`} className="p-1.5 text-slate-500 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"><Copy className="w-3.5 h-3.5" /></button></div></td>
            </tr>)}
          </tbody>
        </table></div>
        {list.hasMore && <button type="button" onClick={list.showMore} className="w-full border-t p-3 text-xs font-bold text-blue-700">Mostrar mais produtos ({list.visible.length} de {filteredProducts.length})</button>}
      </div>}
    </div>
  );
};
