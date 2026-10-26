import React, { useEffect, useState } from 'react';
import type { OfficialCustomer } from '../../types/pamdaCore';
import { authService } from '../../services/auth';
import { coreService } from '../../services/coreService';
import { useCommercialContext } from '../../hooks/useCommercialContext';
import { useCorePermission } from '../../hooks/useCorePermission';
import { defaultBranchId } from '../../services/defaultBranch';
import { centsInput, formatMoney, parsePriceInput } from '../../services/salePricing';
import { usePaymentCatalog } from '../../hooks/usePaymentCatalog';
import { paymentCondition } from '../../services/payments';
import { CustomerPaymentPanel } from './CustomerPaymentPanel';


export function CustomerCommercialPanel({ customer }: { customer: OfficialCustomer }) {
  const user = authService.getCurrentUser()!;
  const [branchId, setBranchId] = useState(() => defaultBranchId(customer));
  const context = useCommercialContext(user.id, customer.id, branchId);
  const permission = useCorePermission(user.id, 'customers.shipping.manage');
  const financial = useCorePermission(user.id, 'finance.read');
  const manage = useCorePermission(user.id, 'customers.manage');
  const catalog = usePaymentCatalog(user.id);
  const [branchAmount, setBranchAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    setBranchAmount(centsInput(context.data?.effectiveShippingCents??0));
    setError('');
  }, [context.data]);
  async function save() {
    if(busy||!context.data||context.loading||!permission.allowed)return;
    const input = branchAmount;
    const cents = input.trim() ? parsePriceInput(input) : 0;
    if (input.trim() && cents === null) { setError('Informe um valor válido, não negativo, com até duas casas decimais.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      await coreService.saveFreight(user.id, customer.id, branchId, 'branch', cents, 'Alteração do frete padrão da unidade pelo cadastro do cliente');
      context.reload(); setNotice('Frete padrão salvo com sucesso.');
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
    {context.data&&<><dl className="grid sm:grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-slate-500">Frete padrão</dt><dd className="font-bold">{money(context.data.effectiveShippingCents??0)}</dd></div>{financial.allowed&&<div><dt className="text-xs text-slate-500">Limite de crédito</dt><dd>{money(context.data.creditLimitCents)}</dd></div>}</dl><p className="text-xs text-slate-600">{paymentCondition(catalog.data,context.data.paymentMethodId,context.data.paymentTermId)}</p>
      {permission.allowed&&<fieldset disabled={busy||context.loading} className="space-y-3"><label className="block text-xs font-bold">Frete padrão (R$)<input aria-label="Frete padrão (R$)" inputMode="decimal" placeholder="0,00" value={branchAmount} onChange={event=>{setBranchAmount(event.target.value);setNotice('');}} className="block w-full mt-1 border rounded-lg p-2 font-normal"/></label><p className="text-xs text-slate-500">Valor usado nas novas vendas da unidade selecionada. Vazio equivale a R$ 0,00.</p><button type="button" onClick={()=>void save()} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Salvar frete padrão</button></fieldset>}
    </>}
    {catalog.loading && <p role="status" className="text-xs text-slate-500">Consultando catálogo de pagamentos…</p>}
    {catalog.error && <p role="alert" className="text-xs text-rose-800">{catalog.error} <button type="button" onClick={catalog.reload} className="underline">Atualizar catálogo</button></p>}
    {catalog.data && <CustomerPaymentPanel userId={user.id} customerId={customer.id} branchId={branchId} catalog={catalog.data} canEdit={manage.allowed && user.role === 'admin_gerencial'} financial={financial.allowed} onSaved={context.reload} reloadCatalog={catalog.reload} />}
    {busy&&<p role="status" className="text-xs text-slate-500">Confirmando frete no servidor…</p>}
    {notice&&<p role="status" className="text-xs text-emerald-800">{notice}</p>}
    {error&&<p role="alert" className="text-xs text-rose-800">{error}</p>}
    
  </section>;
}
