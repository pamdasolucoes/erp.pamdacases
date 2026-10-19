import { useState } from 'react';
import type { PaymentCatalog, PaymentTerm } from '../../types/payments';
import { Modal } from '../../components/common/Modal';
import { paymentsService } from '../../services/paymentsService';
import { UnconfirmedWriteError } from '../../services/core';

export function PaymentCatalogModal({ userId, catalog, onClose, onSaved }: { userId: string; catalog: PaymentCatalog; onClose(): void; onSaved(): void }) {
  const [kind, setKind] = useState<'methods' | 'terms'>('methods'), [selectedId, setSelectedId] = useState('');
  const [form, setForm] = useState({ code: '', name: '', dueDays: '', installments: '', notes: '', active: true });
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [error, setError] = useState('');
  const select = (key: 'methods' | 'terms', id: string) => {
    const row = catalog[key].find(row => row.id === id) as PaymentTerm | undefined;
    setSelectedId(id); setError(''); setForm({ code: row?.code || '', name: row?.name || '', dueDays: row?.dueDays == null ? '' : String(row.dueDays), installments: row?.installments == null ? '' : String(row.installments), notes: row?.notes || '', active: row?.active ?? true });
  };
  return <Modal isOpen title="Catálogo de pagamentos" onClose={() => { if (!busy) onClose(); }}>
    <form aria-label="Catálogo de pagamentos" className="space-y-4" onSubmit={async event => {
      event.preventDefault(); if (busy || uncertain) return; setBusy(true); setError('');
      try {
        if (kind === 'methods') await paymentsService.saveMethod(userId, { code: form.code, name: form.name, active: form.active });
        else {
          if (!/^\d+$/.test(form.dueDays) || !/^\d+$/.test(form.installments)) throw new Error('Informe dias e parcelas inteiros.');
          await paymentsService.saveTerm(userId, { code: form.code, name: form.name, active: form.active, dueDays: Number(form.dueDays), installments: Number(form.installments), notes: form.notes.trim() || null });
        }
        onSaved();
      } catch (reason) { setError(reason instanceof Error ? reason.message : 'Pagamento não confirmado.'); setUncertain(reason instanceof UnconfirmedWriteError); }
      finally { setBusy(false); }
    }}>
      <fieldset disabled={busy || uncertain} className="space-y-3">
        <label className="block text-sm font-bold">Tipo<select aria-label="Tipo de catálogo" value={kind} onChange={event => { const key = event.target.value as typeof kind; setKind(key); select(key, ''); }} className="block w-full rounded-xl border p-2"><option value="methods">Forma de pagamento</option><option value="terms">Prazo de pagamento</option></select></label>
        <label className="block text-sm font-bold">Registro<select aria-label="Registro do catálogo" value={selectedId} onChange={event => select(kind, event.target.value)} className="block w-full rounded-xl border p-2"><option value="">Novo registro</option>{catalog[kind].map(row => <option key={row.id} value={row.id}>{row.name}{!row.active ? ' · Inativo' : ''}</option>)}</select></label>
        {(['code', 'name', ...(kind === 'terms' ? ['dueDays', 'installments', 'notes'] : [])] as const).map(key => <label key={key} className="block text-xs font-bold">{{ code: 'Código do pagamento', name: 'Nome do pagamento', dueDays: 'Dias de prazo', installments: 'Parcelas', notes: 'Observações do pagamento' }[key]}<input aria-label={{ code: 'Código do pagamento', name: 'Nome do pagamento', dueDays: 'Dias de prazo', installments: 'Parcelas', notes: 'Observações do pagamento' }[key]} required={key !== 'notes'} readOnly={key === 'code' && !!selectedId} value={form[key as 'code' | 'name' | 'dueDays' | 'installments' | 'notes']} onChange={event => setForm(previous => ({ ...previous, [key]: event.target.value }))} className="mt-1 block w-full rounded-xl border p-2 font-normal read-only:bg-slate-50" /></label>)}
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={event => setForm(previous => ({ ...previous, active: event.target.checked }))} />Ativo</label>
      </fieldset>
      <p className="text-xs text-slate-500">Cadastre somente condições comerciais aprovadas. Inativar preserva os vínculos históricos.</p>
      {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}
      <button disabled={busy || uncertain} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Confirmando…' : 'Salvar pagamento'}</button>
    </form>
  </Modal>;
}
