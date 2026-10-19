import React, { useEffect, useState } from 'react';
import type { OfficialCustomer } from '../../types/pamdaCore';
import { authService } from '../../services/auth';
import { coreService } from '../../services/coreService';
import { useCommercialContext } from '../../hooks/useCommercialContext';
import { useCorePermission } from '../../hooks/useCorePermission';
import { defaultBranchId } from '../../services/defaultBranch';
import { centsInput, formatMoney, parsePriceInput } from '../../services/salePricing';

export function CustomerCommercialPanel({ customer }: { customer: OfficialCustomer }) {
  const user = authService.getCurrentUser()!;
  const [branchId, setBranchId] = useState(() => defaultBranchId(customer));
  const context = useCommercialContext(user.id, customer.id, branchId);
  const permission = useCorePermission(user.id, 'customers.manage');
  const [customerAmount, setCustomerAmount] = useState('');
  const [branchAmount, setBranchAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    setCustomerAmount(context.data?.customerShippingCents == null ? '' : centsInput(context.data.customerShippingCents));
    setBranchAmount(context.data?.branchShippingCents == null ? '' : centsInput(context.data.branchShippingCents));
    setError('');
  }, [context.data]);
  async function save(target: 'customer' | 'branch') {
    const input = target === 'customer' ? customerAmount : branchAmount;
    const cents = input.trim() ? parsePriceInput(input) : null;
    if (input.trim() && cents === null) { setError('Informe um valor válido, não negativo, com até duas casas decimais.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      await coreService.saveFreight(user.id, customer.id, branchId, target, cents, reason);
      context.reload(); setReason(''); setNotice('Frete confirmado pelo PAMDA CORE.');
    } catch (error) { setError(error instanceof Error ? error.message : 'Não foi possível confirmar o frete.'); }
    finally { setBusy(false); }
  }
  const money = (value: number | null) => value === null ? 'Não configurado' : formatMoney(value);
  return <section className="mt-5 border-t border-slate-100 pt-4 space-y-3" aria-label="Condições comerciais oficiais">
    <h3 className="text-sm font-bold">Frete e condições comerciais</h3>
    <label className="block text-xs font-bold text-slate-500">Consultar unidade<select disabled={busy} aria-label="Unidade das condições comerciais" value={branchId} onChange={event=>setBranchId(event.target.value)} className="mt-1 block w-full border rounded-xl p-2 text-sm font-normal"><option value="">Selecione uma unidade</option>{customer.branches.map(branch=><option key={branch.id} value={branch.id}>{branch.name}{branch.isPrimary?' · Matriz':''}{!branch.active?' · Inativa':''}</option>)}</select></label>
    {!branchId&&<p className="text-xs text-slate-500">Selecione a unidade para consultar as condições oficiais.</p>}
    {context.loading&&<p role="status" className="text-sm text-slate-500">Consultando condições comerciais…</p>}
    {(context.error||permission.error)&&<p role="alert" className="text-sm text-rose-800">{context.error||permission.error}{context.error&&<button type="button" onClick={context.reload} className="ml-2 underline">Atualizar condições</button>}</p>}
    {context.data&&<><dl className="grid sm:grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-slate-500">Frete padrão do cliente</dt><dd>{money(context.data.customerShippingCents)}</dd></div><div><dt className="text-xs text-slate-500">Frete específico da unidade</dt><dd>{context.data.branchShippingCents===null?'Herdar do cliente':money(context.data.branchShippingCents)}</dd></div><div><dt className="text-xs text-slate-500">Frete efetivo</dt><dd className="font-bold">{money(context.data.effectiveShippingCents)}</dd></div>{user.canViewFinancialMetrics&&<div><dt className="text-xs text-slate-500">Limite de crédito</dt><dd>{money(context.data.creditLimitCents)}</dd></div>}</dl><p className="text-xs text-slate-600">{context.data.paymentMethodId||context.data.paymentTermId?'Condição de pagamento cadastrada no servidor.':'Condição de pagamento não configurada'}</p>
      {permission.allowed&&<fieldset disabled={busy} className="space-y-3 rounded-xl border border-slate-200 p-3"><legend className="px-1 text-xs font-bold">Configurar frete</legend><label className="block text-xs font-bold">Frete padrão do cliente (R$)<input aria-label="Frete padrão do cliente (R$)" inputMode="decimal" value={customerAmount} onChange={event=>setCustomerAmount(event.target.value)} className="block w-full mt-1 border rounded-lg p-2 font-normal"/></label><button type="button" onClick={()=>void save('customer')} disabled={!reason.trim()} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Salvar frete do cliente</button><label className="block text-xs font-bold">Frete da unidade (R$)<input aria-label="Frete da unidade (R$)" inputMode="decimal" value={branchAmount} onChange={event=>setBranchAmount(event.target.value)} className="block w-full mt-1 border rounded-lg p-2 font-normal"/></label><p className="text-xs text-slate-500">Vazio remove o valor específico. Zero representa frete grátis explícito. O custo real da entrega é independente.</p><button type="button" onClick={()=>void save('branch')} disabled={!reason.trim()} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Salvar frete da unidade</button><label className="block text-xs font-bold">Motivo da alteração de frete<input aria-label="Motivo da alteração de frete" value={reason} maxLength={4000} onChange={event=>setReason(event.target.value)} className="block w-full mt-1 border rounded-lg p-2 font-normal"/></label></fieldset>}
    </>}
    {busy&&<p role="status" className="text-xs text-slate-500">Confirmando frete no servidor…</p>}
    {notice&&<p role="status" className="text-xs text-emerald-800">{notice}</p>}
    {error&&<p role="alert" className="text-xs text-rose-800">{error}</p>}
  </section>;
}
