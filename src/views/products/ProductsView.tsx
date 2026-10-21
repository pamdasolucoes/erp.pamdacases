import React, { useMemo, useState } from 'react';
import { Layers, Plus, Copy, Sparkles, Edit2, Search, RefreshCw, Tag, Archive } from 'lucide-react';
import { useProducts } from '../../hooks/useProducts';
import { selectCatalogProducts, type ProductStatusFilter } from '../../services/productMapping';
import { skuEditProduct } from '../../services/productAdmin';
import { ProductThumbnail } from '../../components/common/ProductThumbnail';
import { useProgressiveRows } from '../../hooks/useProgressiveRows';

import { authService } from '../../services/auth';
import { Modal } from '../../components/common/Modal';
import { ProductAdminModal, type ProductAction } from './ProductAdminModal';
import { PandaModelPanel } from './PandaModelPanel';
import type { OfficialProduct } from '../../types/productCatalog';
const money = (value: number | null) => value === null ? 'Não informado' : value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const ProductsView: React.FC = () => {
  const { products, loading, refreshing, error, reload } = useProducts();
  const user = authService.getCurrentUser();
  const admin = !authService.getError() && user?.active === true && user.role === 'admin_gerencial';
  const [action, setAction] = useState<ProductAction | null>(null);
  const [detailId, setDetailId] = useState('');
  const [duplicatePicker, setDuplicatePicker] = useState(false);
  const [notice, setNotice] = useState('');
  const detail = products.find(p => p.id === detailId);
  const clone = (product: OfficialProduct) => setAction({ mode: product.type === 'kit' ? 'case' : 'clone', product, duplicate: product.type === 'kit' });
  const [filterType, setFilterType] = useState('todos');
  const [filterStatus, setFilterStatus] = useState<ProductStatusFilter>('ativos');
  const [searchQuery, setSearchQuery] = useState('');
  const filteredProducts = useMemo(() => selectCatalogProducts(products, searchQuery, filterType, filterStatus), [products, filterType, filterStatus, searchQuery]);
  const list = useProgressiveRows(filteredProducts, `${filterType}:${filterStatus}:${searchQuery}`);
  const changeSku = (product: OfficialProduct) => {
    try { const target = skuEditProduct(product, products); setNotice(''); setAction({ mode: 'sku', product: target, skuSource: target.id !== product.id ? product : undefined }); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Não foi possível abrir a alteração de SKU.'); }
  };
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
          <button disabled={!admin} onClick={() => setDuplicatePicker(true)} className="flex items-center gap-1.5 px-3 py-2 bg-purple-50 text-purple-700 border border-purple-200 text-xs font-bold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"><Sparkles className="w-4 h-4 text-purple-600" /><span>Duplicar Produto + Kit</span></button>
          <button disabled={!admin} onClick={() => setAction({ mode: 'kit' })} className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-bold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"><Layers className="w-4 h-4 text-indigo-600" /><span>Novo Kit Composto</span></button>
          <button disabled={!admin} onClick={() => setAction({ mode: 'basic' })} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"><Plus className="w-4 h-4" /><span>Novo Produto</span></button>
        </div>
      </div>
      <button disabled={!admin} onClick={() => setAction({ mode: 'case' })} className="bg-blue-600 text-white rounded-xl px-4 py-2 text-xs font-bold disabled:opacity-50">Nova Capa + Kit</button>
      <p className="text-xs text-slate-500">PAMDA CORE · {admin ? 'Administração do catálogo oficial' : 'Acesso somente de leitura'}</p>
      {notice && <p role="status" className="text-sm text-emerald-800">{notice}</p>}
      {refreshing && <p role="status" className="text-xs text-slate-500">Atualizando catálogo oficial...</p>}
      {!loading && !error && <p aria-live="polite" className="text-xs text-slate-600">{products.length} itens oficiais · {countType('fisico')} físicos · {countType('servico')} serviços · {countType('kit')} kits · {countType('insumo')} insumos · {products.reduce((sum, product) => sum + product.components.length, 0)} vínculos de componentes</p>}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col gap-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          {[{ id:'todos',label:'Todos' },{ id:'fisico',label:'Produtos Físicos' },{ id:'servico',label:'Serviços (DTF UV)' },{ id:'kit',label:'Kits Compostos' },{ id:'insumo',label:'Insumos' }].map(tab => <button key={tab.id} onClick={() => setFilterType(tab.id)} className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer transition-colors ${filterType === tab.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{tab.label}</button>)}
        </div>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end justify-between"><div className="text-xs font-semibold text-slate-600"><label htmlFor="product-status-filter">Situação dos produtos</label><select id="product-status-filter" className="block mt-1 w-full sm:w-56 border border-slate-200 rounded-xl px-3 py-1.5 bg-white" value={filterStatus} onChange={event => setFilterStatus(event.target.value as ProductStatusFilter)}><option value="ativos">Ativos</option><option value="arquivados">Arquivados</option><option value="todos">Todos, incluindo arquivados</option></select></div><div className="relative w-full sm:w-64"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" /><input type="text" aria-label="Buscar produtos por nome, SKU ou código" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="Buscar por nome, SKU, código..." className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-600 focus:outline-none" /></div></div>
        {!loading && !error && <p className="text-xs text-slate-500">{filteredProducts.length} resultados · Kits primeiro, depois produtos base{filterStatus === 'ativos' ? ' · Arquivados ocultos' : ''}</p>}
      </div>
      {loading ? <p role="status" className="rounded-2xl bg-white border border-slate-200 p-8 text-sm text-slate-600">Carregando catálogo e componentes oficiais...</p> : error ? <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800"><p>{error}</p><button onClick={reload} className="underline mt-3 font-bold">Tentar novamente</button></div> :
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[11px] font-bold"><tr><th className="py-3 px-5">Código / SKU</th><th className="py-3 px-4">Nome do Item</th><th className="py-3 px-4">Tipo</th><th className="py-3 px-4 text-right">Custo Direto</th><th className="py-3 px-4 text-right">Custo Gerencial</th><th className="py-3 px-4 text-right">Preço Venda</th><th className="py-3 px-4 text-center">Estoque</th><th className="py-3 px-4 text-center">Status</th><th className="py-3 px-5 text-right">Ações</th></tr></thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {!filteredProducts.length && <tr><td colSpan={9} className="p-8 text-center text-slate-500">{products.length ? 'Nenhum produto encontrado para esta pesquisa.' : 'Nenhum produto disponível para esta conta.'}</td></tr>}
            {list.visible.map(product => <tr key={product.id} data-testid={`product-${product.id}`} className="hover:bg-slate-50/80 transition-colors">
              <td className="py-3 px-5 font-mono"><span className="font-bold text-slate-900 whitespace-pre-wrap">{product.code}</span><span className="block text-[10px] text-slate-400 whitespace-pre-wrap">{product.sku}</span></td>
              <td className="py-3 px-4"><div className="flex items-start gap-2"><ProductThumbnail url={product.imageUrl} /><div><button onClick={() => setDetailId(product.id)} className="font-bold text-slate-900 text-sm text-left hover:underline" aria-label={`Consultar ${product.name}`}>{product.name}</button>{product.modelPhone && <span className="inline-block mt-0.5 text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">{product.modelPhone}</span>}{product.type === 'kit' && <div className="text-[10px] text-slate-400 mt-0.5">{product.components.length} componentes ({product.components.map(component => `${component.quantity} × ${component.componentName}`).join(', ')})</div>}</div></div></td>
              <td className="py-3 px-4"><span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${product.type === 'fisico' ? 'bg-blue-100 text-blue-800' : product.type === 'servico' ? 'bg-purple-100 text-purple-800' : product.type === 'kit' ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-700'}`}>{product.type}</span></td>
              <td className="py-3 px-4 text-right font-mono text-slate-600">{money(product.currentCost)}</td><td className="py-3 px-4 text-right font-mono text-slate-700 font-semibold">{money(product.managerialCost)}</td><td className="py-3 px-4 text-right font-mono font-bold text-emerald-700 text-sm">{money(product.salePrice)}</td>
              <td className="py-3 px-4 text-center">{product.controlsInventory ? <><span className={`font-mono font-bold px-2 py-0.5 rounded ${product.stockVerified && product.currentInventory <= product.minInventory ? 'bg-rose-100 text-rose-800' : product.stockVerified ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>{product.currentInventory} un</span>{!product.stockVerified && <span className="block text-[10px] text-amber-800 mt-1">Não conferido</span>}</> : <span className="text-slate-400 text-[10px] uppercase">{product.type === 'servico' ? 'Serviço' : product.type === 'kit' ? 'Composto' : 'Não'}</span>}</td>
              <td className="py-3 px-4 text-center"><span className={`text-[10px] font-bold px-2 py-0.5 rounded ${product.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>{product.active ? 'Ativo' : 'Inativo'}</span></td>
              <td className="py-3 px-5 text-right"><div className="flex items-center justify-end gap-1.5">
                <button disabled={!admin || !product.active} onClick={() => setAction({ mode: 'edit', product })} aria-label={`Editar ${product.name}`} className="p-1.5 text-slate-500 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"><Edit2 className="w-3.5 h-3.5" /></button>
                <button disabled={!admin || !product.active} onClick={() => changeSku(product)} aria-label={`Alterar SKU de ${product.name}`} className="flex items-center gap-1 border border-slate-200 p-1.5 text-slate-600 rounded-lg whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"><Tag className="w-3.5 h-3.5" /><span>Alterar SKU</span></button>
                <button disabled={!admin || !product.active} onClick={() => setAction({ mode: 'archive', product })} aria-label={`Arquivar produto ${product.name}`} title="Arquivar produto (sem exclusão física)" className="p-1.5 text-slate-500 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"><Archive className="w-3.5 h-3.5" /></button>
                <button disabled={!admin} onClick={() => clone(product)} aria-label={`Clonar ${product.name}`} className="p-1.5 text-slate-500 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"><Copy className="w-3.5 h-3.5" /></button>
              </div></td>
            </tr>)}
          </tbody>
        </table></div>
        {list.hasMore && <button type="button" onClick={list.showMore} className="w-full border-t p-3 text-xs font-bold text-blue-700">Mostrar mais produtos ({list.visible.length} de {filteredProducts.length})</button>}
      </div>}
      {admin && action && <ProductAdminModal action={action} products={products} onClose={() => setAction(null)} onSaved={() => { setAction(null); setDetailId(''); setNotice('Produto salvo no PAMDA CORE. Catálogo sendo atualizado.'); }} />}
      {admin && duplicatePicker && <Modal isOpen title="Duplicar Produto + Kit" onClose={() => setDuplicatePicker(false)}><label className="block text-sm">Produto original<select className="block w-full border rounded-lg p-2 mt-2" value="" onChange={e => { const product = products.find(p => p.id === e.target.value); if (product) { setDuplicatePicker(false); setAction({ mode: 'case', product, duplicate: true }); } }}><option value="">Selecione uma capa ou kit...</option>{products.filter(p => p.active && (p.type === 'kit' || p.type === 'fisico')).map(p => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</select></label></Modal>}
      {detail && !action && <Modal isOpen title={detail.name} subtitle={detail.code + ' · ' + detail.sku} onClose={() => setDetailId('')}><div className="space-y-4 text-sm"><p>{detail.description || 'Sem descrição'}</p><p>{detail.brand} · {detail.category} · {detail.active ? 'Ativo' : 'Inativo'}</p><p>Preço: {money(detail.salePrice)}</p>{detail.type === 'kit' && <ul>{detail.components.map(c => <li key={c.id}>{c.quantity} · {c.componentName}</li>)}</ul>}{admin && <div className="flex flex-wrap gap-2">{detail.active && <><button className="border rounded-lg p-2" onClick={() => setAction({ mode: 'edit', product: detail })}>Editar Produto</button><button className="border rounded-lg p-2" onClick={() => changeSku(detail)}>Alterar SKU</button><button className="border rounded-lg p-2" title="Arquivamento lógico; não exclui o histórico" onClick={() => setAction({ mode: 'archive', product: detail })}>Arquivar produto</button></>}<button className="border rounded-lg p-2" onClick={() => clone(detail)}>Clonar Produto</button>{['fisico','kit'].includes(detail.type) && <button className="border rounded-lg p-2" onClick={() => setAction({ mode: 'case', product: detail, duplicate: true })}>Duplicar Produto + Kit</button>}</div>}{admin && detail.type === 'kit' && <PandaModelPanel key={detail.id} kit={detail} onSaved={() => setNotice('Modelo técnico salvo. Catálogo sendo atualizado.')} />}</div></Modal>}
    </div>
  );
};
