import { useState } from 'react';
import { Modal } from '../../components/common/Modal';
import type { OfficialCustomer, OfficialCustomerBranch } from '../../types/pamdaCore';
import { customerAdminService } from '../../services/customerAdminService';
import { authService } from '../../services/auth';
import { UnconfirmedWriteError } from '../../services/core';

export function CustomerRegistrationModal({ customer, branch, onClose, onSaved }: {
  customer?: OfficialCustomer; branch?: OfficialCustomerBranch; onClose(review?: boolean): void; onSaved(customer: OfficialCustomer): void;
}) {
  const [form, setForm] = useState({ customerCode: customer?.customerCode || '', name: branch?.name || '', address: branch?.address || '',
    number: branch?.number || '', neighborhood: branch?.neighborhood || '', city: branch?.city || '', state: branch?.state || '', zipCode: branch?.zipCode || '', phone: branch?.phone || '' });
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [uncertain, setUncertain] = useState(false);
  const addingBranch = !!customer && !branch;
  const title = !customer ? 'Novo cliente e matriz' : branch ? 'Editar unidade' : 'Adicionar filial';
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
      {customer && <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 space-y-2">
        <p className="text-xs font-bold text-blue-900">Esta unidade pertence ao cliente abaixo</p>
        <label className="block text-xs font-bold">Cliente<input aria-label="Cliente vinculado" readOnly value={customer.name} className="mt-1 block w-full rounded-lg border border-blue-200 bg-white p-2 font-normal" /></label>
        <label className="block text-xs font-bold">Código comercial<input aria-label="Código comercial do cliente" readOnly value={customer.customerCode} className="mt-1 block w-full rounded-lg border border-blue-200 bg-white p-2 font-mono" /></label>
      </div>}
      {addingBranch && <p className="text-xs text-slate-600">Os campos marcados com * são obrigatórios. A matriz atual será preservada.</p>}
      <fieldset disabled={busy || uncertain} className="grid sm:grid-cols-2 gap-3">
        {Object.entries({ ...(!customer ? { customerCode: 'Código comercial' } : {}), name: !customer ? 'Nome do cliente' : addingBranch ? 'Nome da filial' : 'Nome da unidade', address: 'Endereço', number: 'Número', neighborhood: 'Bairro', city: 'Cidade', state: 'Estado', zipCode: 'CEP', phone: 'Telefone' }).map(([key, label]) => {
          const required = key === 'name' || key === 'customerCode' || addingBranch && ['address', 'city', 'state'].includes(key);
          return <label key={key} className="text-xs font-bold text-slate-600">{label}{required ? ' *' : ''}<input aria-label={label} required={required} value={form[key as keyof typeof form]} onChange={event => setForm(previous => ({ ...previous, [key]: event.target.value }))} className="block mt-1 w-full rounded-xl border border-slate-300 p-2 text-sm font-normal" /></label>;
        })}
      </fieldset>
      {!customer && <p className="text-xs text-slate-500">O código é texto e será preservado exatamente. A unidade inicial será criada pelo servidor como matriz. Nenhuma condição comercial será presumida.</p>}
      {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}
      {busy && <p role="status" className="text-sm text-slate-600">Salvando...</p>}
      <div className="flex gap-3"><button disabled={busy || uncertain} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Salvando...' : addingBranch ? 'Cadastrar filial' : 'Salvar cadastro'}</button><button type="button" disabled={busy} onClick={() => onClose(uncertain)} className="text-sm underline">{uncertain ? 'Fechar e revisar a lista' : 'Cancelar'}</button></div>
    </form>
  </Modal>;
}
