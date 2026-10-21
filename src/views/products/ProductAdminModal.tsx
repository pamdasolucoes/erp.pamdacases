import React, { useState } from 'react';
import type { OfficialProduct } from '../../types/productCatalog';
import { Modal } from '../../components/common/Modal';
import { supabase } from '../../services/supabase';
import { productCatalog } from '../../services/catalogResources';

export function ProductAdminModal({ product, action, products, close }: {
 product: OfficialProduct; action: 'sku' | 'archive'; products: readonly OfficialProduct[]; close: () => void;
}) {
 const [sku, setSku] = useState(product.sku);
 const [reason, setReason] = useState('');
 const [confirmation, setConfirmation] = useState('');
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState('');
 const linked = products.filter(p => p.components.some(c => c.componentProductId === product.id));
 const save = async (event: React.FormEvent) => {
  event.preventDefault(); if (busy || confirmation !== product.sku) return;
  setBusy(true); setError('');
  try {
   if (!supabase) throw new Error('Conexão indisponível.');
   const result = await supabase.rpc('pamda_admin_produto_acao', {
    p_id: product.id, p_expected: product.updatedAt, p_action: action,
    p_sku: action === 'sku' ? sku : null, p_reason: reason,
   });
   if (result.error) throw new Error(result.error.code === 'PGRST202'
    ? 'A função administrativa ainda precisa ser instalada e homologada no banco.' : result.error.message);
   productCatalog.invalidate(); close();
  } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar.'); }
  finally { setBusy(false); }
 };
 return <Modal isOpen onClose={() => { if (!busy) close(); }} title={action === 'sku' ? 'Alterar SKU' : 'Excluir produto — arquivamento seguro'} subtitle={product.name} maxWidth="lg">
  <form onSubmit={save} className="space-y-4">
   <p className="text-sm">{action === 'sku'
    ? 'O código e os vínculos por ID serão preservados. Kits personalizados ligados à capa recebem KIT- + novo SKU na mesma operação. Kits especiais exigem revisão. Integrações externas que usam SKU podem precisar de atualização.'
    : 'O produto ficará inativo para novas vendas. Estoque, vendas anteriores, produção, componentes e vínculos do Panda IA serão preservados. Publicações e kits ativos dependentes bloqueiam o arquivamento. Nenhum registro será apagado.'}</p>
   <p className="text-sm">Estoque atual: {product.currentInventory}. Kits dependentes: {linked.length ? linked.map(p => `${p.name} (${p.sku})`).join(', ') : 'nenhum no catálogo carregado'}. O servidor revalida as dependências ao confirmar.</p>
   {action === 'sku' && <label className="block text-sm">Novo SKU<input required maxLength={100} value={sku} onChange={e => setSku(e.target.value)} className="block w-full border rounded p-2" /></label>}
   <label className="block text-sm">Motivo obrigatório<textarea required minLength={5} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} className="block w-full border rounded p-2" /></label>
   <label className="block text-sm">Digite o SKU atual para confirmar: <strong>{product.sku}</strong><input required value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="off" className="block w-full border rounded p-2" /></label>
   {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
   <div className="flex gap-3"><button type="button" disabled={busy} onClick={close}>Cancelar</button><button disabled={busy || confirmation !== product.sku || reason.trim().length < 5} className="bg-blue-700 text-white rounded px-4 py-2 disabled:opacity-50">{busy ? 'Salvando…' : action === 'sku' ? 'Confirmar alteração' : 'Confirmar arquivamento'}</button></div>
  </form>
 </Modal>;
}
