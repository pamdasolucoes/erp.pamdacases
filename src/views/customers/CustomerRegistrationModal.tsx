import { useState } from 'react';
import { Modal } from '../../components/common/Modal';
import type { OfficialCustomer, OfficialCustomerBranch } from '../../types/pamdaCore';
import { customerAdminService } from '../../services/customerAdminService';
import { authService } from '../../services/auth';
import { UnconfirmedWriteError } from '../../services/core';

export function CustomerRegistrationModal({ customer, branch, onClose, onSaved }: {
  customer?: OfficialCustomer; branch?: OfficialCustomerBranch; onClose(): void; onSaved(customer: OfficialCustomer): void;
}) {
  const [form, setForm] = useState({ customerCode: customer?.customerCode || '', name: branch?.name || '', address: branch?.address || '',
    number: branch?.number || '', neighborhood: branch?.neighborhood || '', city: branch?.city || '', state: branch?.state || '', zipCode: branch?.zipCode || '', phone: branch?.phone || '' });
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [uncertain, setUncertain] = useState(false);
  const title = !customer ? 'Novo cliente e matriz' : branch ? 'Editar unidade' : 'Nova filial';
  return <Modal isOpen onClose={() => { if (!busy) onClose(); }} title={title} subtitle="Gravação oficial por RPC protegida. Confira os dados antes de salvar.">
    <form aria-label={title} className="space-y-4" onSubmit={async event => {
      event.preventDefault(); if (busy || uncertain) return; setBusy(true); setError('');
      try {
        const userId = authService.getCurrentUser()!.id;
        const saved = !customer ? await customerAdminService.createCustomer(userId, form)
          : branch ? await customerAdminService.updateBranch(userId, customer, branch, form) : await customerAdminService.createBranch(userId, customer, form);
        onSaved(saved);
      } catch (reason) { setError(reason instanceof Error ? reason.message : 'Falha ao confirmar o cadastro.'); setUncertain(reason instanceof UnconfirmedWriteError); }
      finally { setBusy(false); }
    }}>
      <fieldset disabled={busy || uncertain} className="grid sm:grid-cols-2 gap-3">
        {Object.entries({ customerCode: 'Código comercial', name: !customer ? 'Nome do cliente' : 'Nome da unidade', address: 'Endereço', number: 'Número', neighborhood: 'Bairro', city: 'Cidade', state: 'Estado', zipCode: 'CEP', phone: 'Telefone' }).map(([key, label]) => <label key={key} className="text-xs font-bold text-slate-600">{label}<input aria-label={label} required={key === 'name' || key === 'customerCode'} readOnly={key === 'customerCode' && !!customer} value={form[key as keyof typeof form]} onChange={event => setForm(previous => ({ ...previous, [key]: event.target.value }))} className="block mt-1 w-full rounded-xl border border-slate-300 p-2 text-sm font-normal read-only:bg-slate-50" /></label>)}
      </fieldset>
      {!customer && <p className="text-xs text-slate-500">O código é texto e será preservado exatamente. A unidade inicial será criada pelo servidor como matriz. Nenhuma condição comercial será presumida.</p>}
      {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}
      <div className="flex gap-3"><button disabled={busy || uncertain} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Confirmando…' : 'Salvar cadastro'}</button><button type="button" disabled={busy} onClick={onClose} className="text-sm underline">{uncertain ? 'Fechar e revisar a lista' : 'Voltar'}</button></div>
    </form>
  </Modal>;
}
