import React, { useState } from 'react';
import { Modal } from '../../components/common/Modal';
import type { OfficialProduct } from '../../types/productCatalog';
import { dependentKits, productDraft, type ProductDraft, type ProductMode } from '../../services/productAdmin';
import { productAdminService } from '../../services/productAdminService';

export interface ProductAction { mode: ProductMode; product?: OfficialProduct; duplicate?: boolean }
export function ProductAdminModal({ action, products, onClose, onSaved }: { action: ProductAction; products: readonly OfficialProduct[]; onClose: () => void; onSaved: () => void }) {
  const { mode, product } = action;
  const dependencies = product ? dependentKits(products, product.id) : [];
  const [draft, setDraft] = useState<ProductDraft>(() => {
    const base = productDraft(product);
    if (mode === 'case' && product) {
      const physical = product.type === 'kit' ? products.find(p => p.id === product.components.find(c => c.componentType === 'fisico')?.componentProductId) : product;
      const kit = product.type === 'kit' ? product : products.find(p => p.type === 'kit' && p.components.some(c => c.componentProductId === product.id));
      return { ...productDraft(physical), kitPrice: kit?.salePrice == null ? '' : String(kit.salePrice), kitManagerial: kit?.managerialCost == null ? '' : String(kit.managerialCost) };
    }
    return base;
  });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const field = (key: keyof ProductDraft, label: string, required = false, placeholder = '') => <label className="block text-sm">{label}<input className="block w-full rounded-lg border p-2 mt-1" value={String(draft[key])} onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))} required={required} placeholder={placeholder} /></label>;
  const title = mode === 'edit' ? 'Editar Produto' : mode === 'sku' ? 'Alterar SKU' : mode === 'archive' ? 'Excluir produto (arquivar)' : mode === 'case' ? action.duplicate ? 'Duplicar Produto + Kit' : 'Nova Capa + Kit' : mode === 'kit' ? 'Novo Kit Composto' : mode === 'clone' ? 'Clonar Produto' : 'Novo Produto';
  return <Modal isOpen onClose={() => { if (!busy) onClose(); }} title={title} subtitle={product ? `Origem: ${product.code} · ${product.sku}` : 'Cadastro oficial · códigos gerados pelo servidor'}>
    <form className="space-y-4" onSubmit={async e => { e.preventDefault(); if (busy) return; setBusy(true); setError(''); try { await productAdminService.save(mode, draft, products, product); onSaved(); } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao salvar.'); } finally { setBusy(false); } }}>
      {error && <p role="alert" className="text-sm text-rose-800 bg-rose-50 p-3 rounded-lg">{error}</p>}
      <fieldset disabled={busy} className="space-y-4 disabled:opacity-60">
        {mode === 'archive' ? <><p className="text-sm text-amber-900 bg-amber-50 p-3 rounded-lg">O produto será arquivado, sem exclusão física. Ficará inativo para novas operações. Vendas, estoque, produção, componentes, auditoria e vínculos do Panda IA serão preservados. Nenhum kit dependente será arquivado ou despublicado automaticamente.</p>
          <section aria-label="Impacto do arquivamento" className="text-sm space-y-2"><h4 className="font-bold">Kits dependentes ({dependencies.length})</h4>{dependencies.length ? <ul className="space-y-1">{dependencies.map(kit => <li key={kit.id}>{kit.sku} · {kit.name} · {kit.active ? 'Ativo: bloqueia o arquivamento' : 'Inativo: vínculo preservado'}{kit.b2bSiteVisible && ' · Publicado no Panda IA: despublique antes'}</li>)}</ul> : <p>Nenhum kit dependente no catálogo atual.</p>}<p>Arquive primeiro os kits dependentes ativos. Modelos publicados precisam ser despublicados previamente; o servidor verificará os vínculos atuais ao confirmar.</p>{product?.b2bSiteVisible && <p>Este produto está publicado no Panda IA. Despublique antes de arquivar.</p>}</section>
          {field('confirmSku', 'Digite o SKU atual para confirmar', true)}<p className="text-xs">SKU atual: <strong>{product?.sku}</strong></p></> :
          mode === 'sku' ? <>{field('sku', `Novo SKU de ${product?.name ?? 'produto'}`, true)}{product?.type === 'fisico' && dependencies.length > 0 && <p className="text-sm">O servidor atualizará o SKU do kit vinculado para <strong>KIT-{draft.sku.trim().toUpperCase() || '<SKU da capa>'}</strong>. Kits especiais ou múltiplos vínculos exigem revisão administrativa.</p>}{product?.type === 'kit' && <p className="text-sm text-amber-900">Altere o SKU pela capa vinculada. Kits especiais exigem revisão administrativa.</p>}</> :
            mode === 'case' && <p className="text-sm text-slate-600">Este fluxo cria uma nova capa TPU e seu kit com uma unidade da capa e uma unidade do serviço DTF UV. O novo modelo técnico começa sem publicação.</p>}
        {mode === 'kit' ? <><p className="text-sm text-slate-600">Composição suportada: uma capa física e um serviço, uma unidade de cada. O servidor valida a compatibilidade e gera código e SKU.</p>{(['caseId','serviceId'] as const).map((key, index) => <div key={key} className="text-sm"><label htmlFor={`product-${key}`}>{index ? 'Serviço' : 'Capa física'}</label><select id={`product-${key}`} required value={draft[key]} onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))} className="block w-full border p-2 rounded-lg"><option value="">Selecione...</option>{products.filter(p => p.active && p.type === (index ? 'servico' : 'fisico')).map(p => <option key={p.id} value={p.id}>{p.code} · {p.name} · {p.sku}</option>)}</select></div>)}</> : ['sku','archive'].includes(mode) ? null : <>
          {mode !== 'case' && field('name', 'Nome', true)}
          {mode === 'edit' ? <p className="text-sm">Código: {product?.code} · SKU: {product?.sku} · Tipo: {product?.type}</p> : field('sku', 'SKU novo', true)}
          {mode !== 'case' && mode !== 'edit' && <label className="block text-sm">Tipo<select className="block w-full border rounded-lg p-2" value={draft.type} onChange={e => setDraft(d => ({ ...d, type: e.target.value }))}><option value="fisico">Físico</option><option value="servico">Serviço</option><option value="insumo">Insumo</option></select></label>}
          <div className="grid sm:grid-cols-2 gap-3">{field('brand', 'Marca', mode === 'case' || mode === 'edit')}{field('model', 'Modelo', mode === 'case', 'Ex.: iPhone 18 Pro')}</div>
          {mode === 'case' && <p className="text-xs text-slate-500">Exemplos: iPhone 18 Pro Max, Samsung A08, Samsung A18, Moto G87, Redmi Note 17, Redmi 17. Preencha os dados reais para cadastrar.</p>}
          {mode !== 'case' && field('category', 'Categoria', mode === 'edit')}
        </>}
        {!['sku','archive'].includes(mode) && <>
          <div className="grid sm:grid-cols-2 gap-3">{field('price', mode === 'case' ? 'Preço da capa (R$)' : 'Preço de venda (R$)', mode === 'case' || mode === 'kit')}{mode === 'case' && field('kitPrice', 'Preço do kit (R$)', true)}{mode !== 'kit' && field('cost', 'Custo direto (R$) · opcional')}{field('managerial', 'Custo gerencial (R$) · opcional')}{mode === 'case' && field('kitManagerial', 'Custo gerencial do kit (R$) · opcional')}</div>
          {['basic','clone','edit'].includes(mode) && field('image', 'URL HTTPS da imagem · opcional')}
          {mode === 'edit' && <>{field('description', 'Descrição')}{field('reason', 'Motivo da alteração', true)}</>}
        </>}
        {['sku','archive'].includes(mode) && field('reason', 'Motivo da alteração', true)}
        {['basic','case','kit','clone'].includes(mode) && <p className="text-xs text-slate-600">Estoque inicial zero e não conferido. Valores opcionais vazios serão enviados como NULL.</p>}
        {product && ['case','clone'].includes(mode) && <label className="flex items-start gap-2 text-sm"><input type="checkbox" required checked={draft.confirmed} onChange={e => setDraft(d => ({ ...d, confirmed: e.target.checked }))} />Confirmo criar um novo produto com SKU novo e sem copiar estoque, código ou auditoria.</label>}
        <div className="flex justify-end gap-3"><button type="button" onClick={onClose} className="border px-4 py-2 rounded-lg">Cancelar</button><button className="bg-blue-600 text-white px-4 py-2 rounded-lg" type="submit">{busy ? 'Salvando…' : mode === 'archive' ? 'Arquivar produto' : mode === 'sku' ? 'Alterar SKU' : 'Confirmar e salvar'}</button></div>
      </fieldset>
    </form>
  </Modal>;
}
