import React, { useEffect, useState } from 'react';
import type { OfficialProduct } from '../../types/productCatalog';
import { pandaState, type PandaModel, validateAssetFile } from '../../services/productAdmin';
import { productAdminService } from '../../services/productAdminService';
import { inspectAsset, validateAssetPair } from '../../services/pandaAssets';

function AssetPreview({ file, url, label }: { file?: File; url: string | null; label: string }) {
  const [local, setLocal] = useState('');
  useEffect(() => { if (!file) { setLocal(''); return; } const value = URL.createObjectURL(file); setLocal(value); return () => URL.revokeObjectURL(value); }, [file]);
  return local || url ? <div className="space-y-1"><img src={local || url!} alt={label} className="h-44 w-full object-contain border rounded-lg bg-slate-100" />{file && <p className="text-xs break-all text-slate-600">{file.name} · arquivo selecionado, ainda não salvo</p>}</div> : <p className="text-xs text-slate-500">Arquivo não enviado</p>;
}
export function PandaModelPanel({ kit, onSaved }: { kit: OfficialProduct; onSaved: () => void }) {
  const [model, setModel] = useState<PandaModel | null>(null), [loaded, setLoaded] = useState(false);
  const [savedModel, setSavedModel] = useState<PandaModel | null>(null);
  const [body, setBody] = useState<File>(), [mask, setMask] = useState<File>();
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  useEffect(() => { let active = true; void productAdminService.model(kit.id).then(value => { if (active) { setSavedModel(value); setModel(value ?? { kit_product_id: kit.id, model_label: kit.modelPhone ?? '', brand: kit.brand, body_url: null, mask_url: null, technical_verified: false, published: false }); setLoaded(true); } }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [kit.id]);
  const change = (changes: Partial<PandaModel>) => { setNotice(''); setModel(value => value && ({ ...value, ...changes })); };
  const choose = (file: File | undefined, isMask: boolean) => {
    if (!file) return;
    try { validateAssetFile(file, isMask); isMask ? setMask(file) : setBody(file); change({ technical_verified: false, published: false }); setError(''); } catch (e) { setError((e as Error).message); }
  };
  return <section className="border-t pt-4 space-y-3"><h4 className="font-bold">Modelo técnico | Panda IA</h4>
    {error && <p role="alert" className="text-rose-800 text-sm">{error}</p>}{notice && <p role="status" className="text-emerald-800 text-sm">{notice}</p>}
    {!loaded ? <p className="text-sm">{error ? 'Feche o detalhe e abra novamente para tentar consultar.' : 'Carregando associação técnica…'}</p> : model && <form className="space-y-4" onSubmit={async e => {
      e.preventDefault(); if (busy) return; setBusy(true); setError(''); setNotice('');
      try {
        const bodySource = body ?? model.body_url, maskSource = mask ?? model.mask_url;
        if (bodySource && maskSource) await validateAssetPair(bodySource, maskSource);
        else { if (body) await inspectAsset(body, false); if (mask) await inspectAsset(mask, true); }
        // Check before uploads; retain uploaded URLs after a failed RPC so retry does not upload again.
        if (model.published && (!bodySource || !maskSource || !model.technical_verified || !kit.active || kit.salePrice === null)) throw new Error('Para publicar, envie molde e máscara, confirme a conferência técnica e configure kit ativo com preço.');
        let next = { ...model };
        if (body) { next.body_url = await productAdminService.upload(kit.id, body, false); setModel({ ...next }); setBody(undefined); }
        if (mask) { next.mask_url = await productAdminService.upload(kit.id, mask, true); setModel({ ...next }); setMask(undefined); }
        await productAdminService.saveModel(kit, next);
        setModel(next); setSavedModel(next); setNotice(next.published ? 'Modelo publicado no catálogo Panda IA.' : 'Modelo técnico salvo sem publicação.'); onSaved();
      } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar o modelo.'); } finally { setBusy(false); }
    }}>
      <p className="text-sm font-semibold">Estado: {pandaState(savedModel)}</p>
      <p className="text-xs text-slate-500">As alterações e a escolha de publicação serão aplicadas ao salvar.</p>
      <fieldset disabled={busy} className="space-y-4 disabled:opacity-60">
        <div className="grid sm:grid-cols-2 gap-3"><label className="text-sm">Nome apresentado no site<input required minLength={2} className="block w-full border rounded-lg p-2" value={model.model_label} onChange={e => change({ model_label: e.target.value, technical_verified: false, published: false })} /></label><label className="text-sm">Marca<input required minLength={2} className="block w-full border rounded-lg p-2" value={model.brand} onChange={e => change({ brand: e.target.value, technical_verified: false, published: false })} /></label></div>
        <p className="text-xs text-slate-600">Envie apenas arquivos técnicos, sem imagens pessoais de clientes. PNG/JPEG/WebP até 10 MB. A máscara deve ser PNG com alfa, áreas visíveis e transparentes e as mesmas dimensões do molde. Confira o alinhamento para uso no editor.</p>
        <div className="grid sm:grid-cols-2 gap-4">{[false, true].map(isMask => <div key={String(isMask)} className="space-y-2"><label className="block text-sm">{isMask ? 'Máscara de câmera' : 'Imagem do molde'}<input type="file" accept={isMask ? 'image/png' : 'image/png,image/jpeg,image/webp'} className="block w-full text-xs py-2" onChange={e => { choose(e.target.files?.[0], isMask); e.target.value = ''; }} /></label><AssetPreview file={isMask ? mask : body} url={isMask ? model.mask_url : model.body_url} label={isMask ? 'Preview da máscara de câmera' : 'Preview do molde'} /></div>)}</div>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={model.technical_verified} onChange={e => change({ technical_verified: e.target.checked, published: false })} />Confirmo a conferência técnica do molde, da máscara e do alinhamento no editor.</label>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={model.published} onChange={e => change({ published: e.target.checked })} />Publicar no Panda IA</label>
        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">{busy ? 'Salvando…' : 'Salvar modelo técnico'}</button>
      </fieldset>
    </form>}
  </section>;
}
