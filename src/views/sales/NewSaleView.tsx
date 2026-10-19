import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import type { CustomerContext } from '../../types/pamdaCore';
import { searchSaleCustomers } from '../../services/saleSearch';
import { SearchDropdown } from '../../components/common/SearchDropdown';
import { useCustomers } from '../../hooks/useCustomers';
import { SalePricingPanel } from './SalePricingPanel';
import { pendingCustomerFreight } from '../../services/freight';
import { useProducts } from '../../hooks/useProducts';
import { authService } from '../../services/auth';
import { useSalePreparation } from '../../hooks/useSalePreparation';
import { defaultBranchId } from '../../services/defaultBranch';
import type { PricingPreparation } from '../../types/salePreparation';
import { useCommercialContext } from '../../hooks/useCommercialContext';
import { useCorePermission } from '../../hooks/useCorePermission';
import { centsInput } from '../../services/salePricing';
import { usePaymentCatalog } from '../../hooks/usePaymentCatalog';
import { PaymentSelect } from '../../components/common/PaymentSelect';
import { paymentCondition } from '../../services/payments';

interface NewSaleViewProps {
  initialCustomer?: CustomerContext | null;
  onDiscard?: () => void;
}

const inputClass = 'w-full px-3 py-2 border border-slate-300 rounded-xl text-sm bg-white';

function branchLabel(branch: { name: string; active: boolean; isPrimary?: boolean | null }, unique: boolean) {
  if (unique && branch.active) return 'Matriz';
  return branch.isPrimary ? 'Matriz' : branch.name;
}

export const NewSaleView: React.FC<NewSaleViewProps> = ({ initialCustomer, onDiscard }) => {
  const { customers, loading, error, reload } = useCustomers();
  const { products, loading: productsLoading, error: productsError, reload: reloadProducts } = useProducts();
  const userId = authService.getCurrentUser()!.id;
  const { draft, setDraft, storageError, sync, workspace } = useSalePreparation(userId);
  const { customerId, branchId } = draft;
  const commercial = useCommercialContext(userId, customerId, branchId);
  const shippingPermission = useCorePermission(userId, 'sales.shipping.override');
  const paymentCatalog = usePaymentCatalog(userId);
  const customerFreight = useMemo(() => commercial.data ? { status: 'available' as const, amountCents: commercial.data.effectiveShippingCents,
    source: commercial.data.branchShippingCents !== null ? 'branch_override' as const : 'customer_default' as const } : pendingCustomerFreight, [commercial.data]);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const locked=sync.status==='closed'||!!draft.remote&&draft.remote.status!=='draft';
  const setPricing = useCallback<React.Dispatch<React.SetStateAction<PricingPreparation>>>(
    value => setDraft(previous => ({
      ...previous,
      pricing: typeof value === 'function' ? value(previous.pricing) : value,
    })),
    [setDraft],
  );
  const matches = useMemo(() => searchSaleCustomers(customers, query), [customers, query]);
  const selected = !loading && !error ? customers.find(customer => customer.id === customerId) : undefined;
  const branch = selected?.branches.find(unit => unit.id === branchId);
  const contextMismatch = selected &&
    initialCustomer?.id === selected.id &&
    initialCustomer.customerCode !== selected.customerCode;

  useEffect(() => {
    if (!selected || locked || draft.remote?.saleId && !draft.commercialDefaultsPending || (branchId && selected.branches.some(unit => unit.id === branchId && unit.active))) return;
    const next = defaultBranchId(selected);
    if (branchId !== next) {
      setDraft(previous => previous.customerId === selected.id ? { ...previous, branchId: next } : previous);
    }
  }, [selected, branchId, setDraft,locked,draft.remote?.saleId,draft.commercialDefaultsPending]);
  useEffect(()=>{
    if(!locked&&selected?.active&&branch?.active&&!contextMismatch&&commercial.data)workspace.begin();
  },[selected,branch,contextMismatch,workspace,locked,commercial.data]);
  useEffect(() => {
    const context = commercial.data;
    if (!context || locked) return;
    setDraft(previous => {
      if (previous.customerId !== context.customerId || previous.branchId !== context.branchId || previous.remote?.saleId && !previous.commercialDefaultsPending) return previous;
      return { ...previous, commercialDefaultsPending:false, paymentMethodId: context.paymentMethodId, paymentTermId: context.paymentTermId,
        pricing: previous.pricing.manualFreight ? previous.pricing : { ...previous.pricing, freight: context.effectiveShippingCents === null ? '' : centsInput(context.effectiveShippingCents), manualFreight: false } };
    });
  }, [commercial.data, draft.commercialDefaultsPending, locked, setDraft]);
  useEffect(()=>{
    const discardEmpty=()=>{void workspace.discardEmptyOnExit();};
    window.addEventListener('pagehide',discardEmpty);
    return()=>window.removeEventListener('pagehide',discardEmpty);
  },[workspace]);
  const confirmFirstProduct=useCallback(async()=>{
    if(!await workspace.flush())throw new Error('O primeiro produto ainda não foi confirmado pelo Supabase. Tente novamente antes de continuar.');
  },[workspace]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-black tracking-tight text-slate-900">NOVA VENDA</h1>
        <div className="text-right">
          <button
            disabled
            title="A finalização oficial requer integração de vendas no backend."
            className="rounded-xl bg-slate-200 px-5 py-3 font-bold text-slate-500 cursor-not-allowed"
          >
            Concluir venda
          </button>
          <p className="mt-1 text-xs text-slate-500">Finalização indisponível no momento</p>
        </div>
      </div>

      {notice && <p role="alert" className="text-sm text-amber-900">{notice}</p>}
      {storageError && <p role="alert" className="text-sm text-rose-800">{storageError}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        {draft.remote?.orderNumber!==null&&draft.remote?.orderNumber!==undefined&&
          <p className="rounded-lg bg-blue-50 px-3 py-2 font-bold text-blue-900">Pedido nº {draft.remote.orderNumber}{draft.remote.firstProductAt===null?' · provisório':''}</p>}
        <p role="status" data-testid="sale-save-state" className={sync.status==='error'?'text-rose-700':'text-slate-500'}>
          {sync.status==='idle'?'Selecione cliente e unidade para iniciar uma pendência.':sync.status==='saving'?'Salvando…':sync.status==='saved'?'Salvo · Pendente':sync.status==='closed'?sync.message:'Erro ao salvar'}
        </p>
        {sync.status==='error'&&<button type="button" className="underline text-blue-700" onClick={()=>{void workspace.retry();}}>Tentar salvar novamente</button>}
      {draft.remote&&<button
        type="button"
        className="text-xs text-slate-500 underline underline-offset-2"
        onClick={async() => {
          try{const discarded=await workspace.newDraft();onDiscard?.();setNotice(discarded?'Preparação vazia descartada pelo servidor.':'A venda anterior permanece registrada no Supabase.');}
          catch(error){setNotice(error instanceof Error?error.message:'Não foi possível abrir outra venda.');}
        }}
      >
        Nova venda
      </button>}
      </div>
      {sync.status==='error'&&<p role="alert" className="text-sm text-rose-800">{sync.message} As alterações ainda não confirmadas permanecem nesta aba.</p>}

      <form
        onSubmit={event => {
          event.preventDefault();
          setNotice('A finalização de vendas ainda não está disponível.');
        }}
        className="space-y-4"
      >
        <fieldset disabled={locked} inert={locked} className="space-y-4 min-w-0">
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <SearchDropdown
            label="Cliente"
            placeholder="Pesquisar por código ou nome"
            selectedLabel={selected ? `${selected.customerCode} - ${selected.name}` : undefined}
            query={query}
            onQueryChange={setQuery}
            options={matches}
            onSelect={customer => {
              setDraft(previous => ({
                ...previous,
                customerId: customer.id,
                branchId: defaultBranchId(customer),
                commercialDefaultsPending: previous.customerId !== customer.id || previous.branchId !== defaultBranchId(customer),
                paymentMethodId: previous.customerId === customer.id && previous.branchId === defaultBranchId(customer) ? previous.paymentMethodId : null,
                paymentTermId: previous.customerId === customer.id && previous.branchId === defaultBranchId(customer) ? previous.paymentTermId : null,
                pricing: previous.customerId === customer.id && previous.branchId === defaultBranchId(customer)
                  ? previous.pricing
                  : { ...previous.pricing, freight: '', freightReason: '', manualFreight: false },
              }));
            }}
            loading={loading}
            error={error}
            onRetry={reload}
            renderOption={customer => (
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold">{customer.name}</span>
                <span className="text-xs text-slate-500">{customer.customerCode}</span>
              </div>
            )}
          />

          {loading && <p role="status" className="text-sm text-slate-500">Carregando clientes…</p>}
          {error && (
            <div role="alert" className="text-sm text-rose-800">
              <p>{error}</p>
              <button type="button" onClick={reload} className="mt-2 underline">Tentar novamente</button>
            </div>
          )}
          {!loading && !error && (
            <>
              {initialCustomer && !selected && !customerId && (
                <p role="alert" className="text-sm text-amber-800">Selecione novamente o cliente para continuar.</p>
              )}
              {customerId && !selected && (
                <p role="alert" className="text-sm text-rose-800">O cliente selecionado não está disponível. Atualize a consulta ou selecione outro.</p>
              )}
              {contextMismatch && (
                <p role="alert" className="text-sm text-rose-800">O código recebido não corresponde ao cadastro. Retorne à ficha do cliente.</p>
              )}
              {selected && !contextMismatch && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-bold">
                    Unidade / Filial
                    <select
                      aria-label="Unidade / Filial"
                      className={`${inputClass} mt-1`}
                      value={branchId}
                      onChange={event => {const id=event.target.value;setDraft(previous => ({ ...previous, branchId:id,commercialDefaultsPending:!!id,paymentMethodId:null,paymentTermId:null,pricing:{...previous.pricing,freight:'',freightReason:'',manualFreight:false} }));}}
                    >
                      <option value="">
                        {selected.branches.length ? 'Selecione a unidade' : 'Nenhuma unidade disponível'}
                      </option>
                      {selected.branches.map(unit => (
                        <option key={unit.id} value={unit.id} disabled={!unit.active}>
                          {branchLabel(unit, selected.branches.filter(item=>item.active).length === 1)}
                          {unit.active
                            ? ` — ${[unit.address, unit.number, unit.city, unit.state].filter(Boolean).join(', ')}`
                            : ' — Inativa'}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!branchId && (
                    <p role="status" className="self-center text-sm text-amber-800">
                      {selected.branches.length > 1
                        ? 'Selecione a unidade desejada.'
                        : 'Nenhuma unidade ativa disponível.'}
                    </p>
                  )}
                  {branch && (
                    <div className="self-center text-sm text-slate-700">
                      <p>{[branch.address, branch.number, branch.complement, branch.neighborhood, branch.city, branch.state, branch.zipCode].filter(Boolean).join(' · ')}</p>
                      {branch.addressNeedsReview && (
                        <p className="mt-1 flex items-center gap-2 text-amber-800">
                          <AlertCircle className="h-4 w-4 shrink-0" />Endereço sinalizado para revisão.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </section>
        {commercial.loading&&<p role="status" className="text-sm text-slate-500">Consultando frete e condições comerciais…</p>}
        {commercial.error&&<p role="alert" className="text-sm text-rose-800">{commercial.error} <button type="button" onClick={commercial.reload} className="underline">Atualizar condições comerciais</button></p>}
        {shippingPermission.error&&<p role="alert" className="text-sm text-amber-800">{shippingPermission.error} A alteração do frete está bloqueada até validar a permissão.</p>}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3" aria-label="Pagamento da venda">
          <p className="text-xs text-slate-500">{paymentCondition(paymentCatalog.data,draft.paymentMethodId,draft.paymentTermId)}</p>
          {paymentCatalog.loading && <p role="status" className="text-sm text-slate-500">Consultando pagamentos…</p>}
          {paymentCatalog.error && <p role="alert" className="text-sm text-rose-800">{paymentCatalog.error} <button type="button" onClick={paymentCatalog.reload} className="underline">Atualizar pagamentos</button></p>}
          <div className="grid sm:grid-cols-2 gap-3">
            <PaymentSelect label="Forma de pagamento da venda" value={draft.paymentMethodId} rows={paymentCatalog.data?.methods || []} disabled={!paymentCatalog.data || commercial.loading || draft.commercialDefaultsPending} onChange={id => setDraft(previous => ({ ...previous, paymentMethodId: id }))} />
            <PaymentSelect label="Prazo de pagamento da venda" value={draft.paymentTermId} rows={paymentCatalog.data?.terms || []} disabled={!paymentCatalog.data || commercial.loading || draft.commercialDefaultsPending} onChange={id => setDraft(previous => ({ ...previous, paymentTermId: id }))} />
          </div>
        </section>

        {productsLoading
          ? <p role="status" className="rounded-xl border bg-white p-5">Carregando produtos…</p>
          : productsError
            ? (
              <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
                <p>{productsError}</p>
                <button type="button" onClick={reloadProducts} className="mt-3 font-bold underline">Tentar novamente</button>
              </div>
            )
            : (
              <SalePricingPanel
                draft={draft.pricing}
                onDraftChange={setPricing}
                products={products}
                customerId={customerId || null}
                branchId={branch?.id || null}
                customerFreight={customerFreight}
                freightEditable={shippingPermission.allowed}
                selectedCustomer={contextMismatch ? null : selected || null}
                selectedBranch={branch || null}
                sellerName={draft.remote?.sellerName}
                paymentCondition={paymentCondition(paymentCatalog.data,draft.paymentMethodId,draft.paymentTermId)}
                onFirstProductAdded={confirmFirstProduct}
              />
            )}
        </fieldset>
      </form>
    </div>
  );
};
