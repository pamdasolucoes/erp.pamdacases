import { useEffect, useState } from 'react';
import type { PaymentCatalog, PaymentSettings } from '../../types/payments';
import { paymentsService } from '../../services/paymentsService';
import { PaymentSelect } from '../../components/common/PaymentSelect';
import { PaymentCatalogModal } from './PaymentCatalogModal';
import { centsInput, parsePriceInput } from '../../services/salePricing';
import { UnconfirmedWriteError } from '../../services/core';

function SettingsEditor({ userId, target, targetId, catalog, canEdit, financial, onSaved }: { userId: string; target: 'customer' | 'branch'; targetId: string; catalog: PaymentCatalog; canEdit: boolean; financial: boolean; onSaved(): void }) {
  const [saved, setSaved] = useState<PaymentSettings | null>(null), [methodId, setMethodId] = useState<string | null>(null), [termId, setTermId] = useState<string | null>(null);
  const [credit, setCredit] = useState(''), [notes, setNotes] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true; setSaved(null); setError('');
    paymentsService.settings(userId, target, targetId).then(value => {
      if (!active) return; setSaved(value); setMethodId(value.methodId); setTermId(value.termId); setCredit(value.creditLimitCents === null ? '' : centsInput(value.creditLimitCents)); setNotes(value.notes || ''); setUncertain(false);
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Falha ao consultar pagamento.'); });
    return () => { active = false; };
  }, [userId, target, targetId, revision]);
  return <div className="space-y-2"><fieldset disabled={busy || !saved || !canEdit || uncertain} className="rounded-xl border border-slate-200 p-3 space-y-3">
    <legend className="px-1 text-xs font-bold">Pagamento {target === 'customer' ? 'do cliente' : 'da unidade'}</legend>
    {!saved && !error && <p role="status" className="text-xs text-slate-500">Consultando configuração…</p>}
    <PaymentSelect label={target === 'customer' ? 'Forma padrão do cliente' : 'Forma específica da unidade'} value={methodId} rows={catalog.methods} onChange={setMethodId} />
    <PaymentSelect label={target === 'customer' ? 'Prazo padrão do cliente' : 'Prazo específico da unidade'} value={termId} rows={catalog.terms} onChange={setTermId} />
    {target === 'branch' && <p className="text-xs text-slate-500">Vazio mantém a herança do cliente conforme o contexto oficial retornado pelo servidor.</p>}
    {target === 'customer' && financial && <label className="block text-xs font-bold">Limite de crédito (R$)<input aria-label="Limite de crédito (R$)" inputMode="decimal" value={credit} onChange={event => setCredit(event.target.value)} className="mt-1 block w-full rounded-xl border p-2 font-normal" /><span className="font-normal text-slate-500">Vazio significa não configurado. Zero é um limite explícito.</span></label>}
    <label className="block text-xs font-bold">Observações {target === 'customer' ? 'do pagamento do cliente' : 'do pagamento da unidade'}<textarea aria-label={target === 'customer' ? 'Observações do pagamento do cliente' : 'Observações do pagamento da unidade'} value={notes} onChange={event => setNotes(event.target.value)} className="mt-1 block w-full rounded-xl border p-2 font-normal" /></label>
    {canEdit && <button type="button" onClick={async () => {
      if (!saved || busy) return;
      const amount = target === 'customer' && financial ? credit.trim() ? parsePriceInput(credit) : null : saved.creditLimitCents;
      if (credit.trim() && financial && amount === null) { setError('Informe um limite válido, não negativo, com até duas casas decimais.'); return; }
      setBusy(true); setError(''); setNotice('');
      try {
        const result = await paymentsService.saveSettings(userId, target, targetId, { methodId, termId, creditLimitCents: amount, notes: notes.trim() || null });
        setSaved(result); setNotice('Pagamento confirmado pelo PAMDA CORE.'); onSaved();
      } catch (reason) { setError(reason instanceof Error ? reason.message : 'Pagamento não confirmado.'); setUncertain(reason instanceof UnconfirmedWriteError); }
      finally { setBusy(false); }
    }} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Salvar pagamento {target === 'customer' ? 'do cliente' : 'da unidade'}</button>}
    {notice && <p role="status" className="text-xs text-emerald-800">{notice}</p>}
  </fieldset>{error && <p role="alert" className="text-xs text-rose-800">{error} <button type="button" disabled={busy} onClick={() => setRevision(value => value + 1)} className="underline">Atualizar configuração</button></p>}</div>;
}

export function CustomerPaymentPanel({ userId, customerId, branchId, catalog, canEdit, financial, onSaved, reloadCatalog }: { userId: string; customerId: string; branchId: string; catalog: PaymentCatalog; canEdit: boolean; financial: boolean; onSaved(): void; reloadCatalog(): void }) {
  const [managing, setManaging] = useState(false);
  return <div className="space-y-3">
    <SettingsEditor key={`customer:${customerId}`} userId={userId} target="customer" targetId={customerId} catalog={catalog} canEdit={canEdit} financial={financial} onSaved={onSaved} />
    {branchId && <SettingsEditor key={`branch:${branchId}`} userId={userId} target="branch" targetId={branchId} catalog={catalog} canEdit={canEdit} financial={false} onSaved={onSaved} />}
    {canEdit && <button type="button" onClick={() => setManaging(true)} className="text-xs font-bold text-blue-700 underline">Gerenciar catálogo de pagamentos</button>}
    {managing && <PaymentCatalogModal userId={userId} catalog={catalog} onClose={() => { setManaging(false); reloadCatalog(); }} onSaved={() => { setManaging(false); reloadCatalog(); onSaved(); }} />}
  </div>;
}
