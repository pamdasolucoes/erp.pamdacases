import React, { useState } from 'react';
import { Save } from 'lucide-react';
import type { OfficialCustomer } from '../../types/pamdaCore';
import { customerService } from '../../services/customerService';
import { Modal } from '../../components/common/Modal';
import { buildCustomerUpdate, createCustomerForm, customerFields, branchFields } from './customerForm';
import { customerFreightLabel } from '../../services/freight';
import { centsInput } from '../../services/salePricing';

export function CustomerEditModal({ customer, onClose, onSaved }: { customer: OfficialCustomer; onClose(): void; onSaved(customer: OfficialCustomer): void }) {
  const [form, setForm] = useState(() => createCustomerForm(customer));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError('');
    try {
      const update = buildCustomerUpdate(customer, form);
      if (!Object.keys(update.changes).length && !update.branches.length) { setError('Nenhuma alteração para salvar.'); return; }
      setBusy(true);
      const confirmed = await customerService.update(update);
      if (confirmed.customerCode !== customer.customerCode) throw new Error('O código retornado não corresponde ao cadastro original. Atualize a lista.');
      onSaved(confirmed);
    } catch (error) { setError(error instanceof Error ? error.message : 'Não foi possível salvar o cadastro.'); }
    finally { setBusy(false); }
  }
  const inputClass = 'mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50';
  return (
    <Modal isOpen onClose={() => { if (!busy) onClose(); }} title="Editar cliente e unidades" subtitle="Atualize os dados cadastrais do cliente selecionado" maxWidth="4xl">
      <form onSubmit={save} className="space-y-6">
        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
        <fieldset disabled={busy} className="space-y-4">
          <legend className="font-bold text-slate-900">Dados do cliente</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="text-xs font-bold text-slate-600">Código comercial<input readOnly value={customer.customerCode} className={`${inputClass} bg-slate-50 font-mono`} /></label>
            <label className="text-xs font-bold text-slate-600">UUID interno<input readOnly value={customer.id} className={`${inputClass} bg-slate-50 font-mono`} /></label>
            {customerFields.map(([key, label]) => <label key={key} className={`text-xs font-bold text-slate-600 ${key === 'notes' ? 'sm:col-span-2' : ''}`}>{label}
              {key === 'notes' ? <textarea rows={3} value={form.values[key]} onChange={event => setForm({ ...form, values: { ...form.values, [key]: event.target.value } })} className={inputClass} /> : <input type="text" inputMode={key === 'email' ? 'email' : 'text'} required={key === 'name'} value={form.values[key]} onChange={event => setForm({ ...form, values: { ...form.values, [key]: event.target.value } })} className={inputClass} />}
            </label>)}
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={event => setForm({ ...form, active: event.target.checked })} />Cliente ativo</label>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
            <label className="block text-xs font-bold text-slate-600">FRETE PADRÃO (R$)<input disabled readOnly inputMode="decimal" value={customer.defaultFreight.status === 'available' && customer.defaultFreight.amountCents !== null ? centsInput(customer.defaultFreight.amountCents) : ''} placeholder={customerFreightLabel(customer.defaultFreight)} aria-describedby="customer-freight-pending" className={`${inputClass} max-w-xs`} /></label>
            <p id="customer-freight-pending" className="text-xs text-amber-900">Frete padrão pendente de integração de gravação. Este campo não pode ser salvo nesta etapa. Os demais dados cadastrais mantêm seu fluxo de edição.</p>
          </div>
        </fieldset>
        {form.branches.map((draft, index) => <fieldset key={draft.id} disabled={busy} className="space-y-4 rounded-xl border border-slate-200 p-4">
          <legend className="px-2 text-sm font-bold text-slate-900">Unidade {index + 1}: {customer.branches.find(branch => branch.id === draft.id)?.name}</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="text-xs font-bold text-slate-600 sm:col-span-2">UUID da unidade<input readOnly value={draft.id} className={`${inputClass} bg-slate-50 font-mono`} /></label>
            {branchFields.map(([key, label]) => <label key={key} className="text-xs font-bold text-slate-600">{label}<input value={draft.values[key]} required={key === 'name'} onChange={event => setForm({ ...form, branches: form.branches.map(branch => branch.id === draft.id ? { ...branch, values: { ...branch.values, [key]: event.target.value } } : branch) })} className={inputClass} /></label>)}
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.active} onChange={event => setForm({ ...form, branches: form.branches.map(branch => branch.id === draft.id ? { ...branch, active: event.target.checked } : branch) })} />Unidade ativa</label>
          {customer.branches.find(branch => branch.id === draft.id)?.addressNeedsReview && <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><input type="checkbox" checked={draft.confirmAddressReviewed} onChange={event => setForm({ ...form, branches: form.branches.map(branch => branch.id === draft.id ? { ...branch, confirmAddressReviewed: event.target.checked } : branch) })} className="mt-1" /><span>Conferi este endereço e confirmo que pode ser marcado como revisado.</span></label>}
        </fieldset>)}
        <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 border-t border-slate-100 pt-4">
          <button type="button" disabled={busy} onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold">Cancelar</button>
          <button disabled={busy} className="inline-flex justify-center items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-50"><Save className="h-4 w-4" />{busy ? 'Salvando no PAMDA CORE...' : 'Salvar alterações'}</button>
        </div>
      </form>
    </Modal>
  );
}
