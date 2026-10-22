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
import { centsInput,calculateSalePricing,parsePriceInput } from '../../services/salePricing';
import { usePaymentCatalog } from '../../hooks/usePaymentCatalog';
import { PaymentSelect } from '../../components/common/PaymentSelect';
import { paymentCondition } from '../../services/payments';
import {pendingSalesService} from '../../services/saleWorkspace';
import type {SaleDetails} from '../../types/pendingSales';
import type {ReceiptDocumentData} from '../../types/receipt';
import type {TestPaymentDraft} from '../../types/testSales';
import {ReceiptPreviewModal} from '../../components/receipt/ReceiptPreviewModal';
import {SaleFinalizationModal as TestSaleFinalizationModal} from './SaleFinalizationModal';

interface NewSaleViewProps {
  initialCustomer?: CustomerContext | null;
  onNewSale?: () => void;
}

const inputClass = 'w-full px-3 py-2 border border-slate-300 rounded-xl text-sm bg-white';
interface SalePaymentDraft extends Omit<TestPaymentDraft,'methodCode'> {methodId:string|null;}

function branchLabel(branch: { name: string; active: boolean; isPrimary?: boolean | null }, unique: boolean) {
  if (unique && branch.active) return 'Matriz';
  return branch.isPrimary ? 'Matriz' : branch.name;
}

export const NewSaleView: React.FC<NewSaleViewProps> = ({ initialCustomer, onNewSale }) => {
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
  useEffect(()=>{void workspace.ensureNumber().catch(error=>setNotice(error instanceof Error?error.message:'Não foi possível consultar o número da venda.'));},[workspace]);
  const [finalizing,setFinalizing]=useState<SaleDetails|null>(null);
  const [receiptPreview,setReceiptPreview]=useState<ReceiptDocumentData|null>(null);
  const [testReceipt,setTestReceipt]=useState<ReceiptDocumentData|null>(null);
  const [paymentPlan,setPaymentPlan]=useState<SalePaymentDraft[]>([{methodId:null,amount:'0,00',status:'pending',channel:'erp',scheduledFor:''}]);
  const [paymentAmountsEdited,setPaymentAmountsEdited]=useState(false);
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
  const openTestFinalization=async()=>{
    setNotice('');
    try{
      const currentUser=authService.getCurrentUser();
      if(userId!==currentUser?.id||currentUser.active!==true||!(currentUser.role==='admin_gerencial'||currentUser.permissions?.['sales.confirm']))throw new Error('Seu usuário não tem permissão para finalizar vendas.');
      if(!paymentCatalog.data)throw new Error('Aguarde o carregamento do catálogo oficial de pagamentos antes de finalizar.');
      if(!draft.remote?.saleId)throw new Error('Aguarde o Supabase iniciar a venda antes de finalizar.');
      if(!await workspace.flush())throw new Error('Há alterações não salvas. Corrija o erro ou tente salvar novamente antes de finalizar.');
      if(paymentPlanTotal===null||paymentTotalCents===null||paymentPlanTotal!==paymentTotalCents)throw new Error('A soma das formas de pagamento deve corresponder ao total atual da venda.');
      if(paymentPlan.some(payment=>!activePaymentMethods.some(method=>method.id===payment.methodId)))throw new Error('Selecione uma forma de pagamento ativa em cada parcela.');
      const details=await pendingSalesService.details(userId,draft.remote.saleId);
      if(details.sale.status!=='draft'||details.sale.order_number===null||!details.items.length||
        details.sale.first_product_at===null||!details.sale.shipping_confirmed||details.sale.shipping_charged===null)
        throw new Error('A venda precisa ter número confirmado, produto salvo e frete confirmado (inclusive R$ 0,00).');
      setFinalizing(details);
    }catch(reason){setNotice(reason instanceof Error?reason.message:'Não foi possível preparar a finalização.');}
  };
  const completeTestFinalization=(details:SaleDetails,receipt:ReceiptDocumentData)=>{
    workspace.acceptClosed(details);setFinalizing(null);setTestReceipt(receipt);
    setNotice('Venda confirmada. Estoque, financeiro e produção atualizados.');
  };
  const orderNumber=draft.remote?.orderNumber??draft.numberReservation?.orderNumber??null;
  const numberLabel=orderNumber===null?'':`Nº ${orderNumber.toLocaleString('pt-BR')}`;
  const admin=authService.getCurrentUser()?.active===true&&(authService.getCurrentUser()?.role==='admin_gerencial'||authService.getCurrentUser()?.permissions?.['sales.confirm']===true);
  const activePaymentMethods=useMemo(()=>{
    const priority=['pix','dinheiro','credito_cliente','cartao_debito','cartao_credito','boleto'];
    return paymentCatalog.data?.methods.filter(method=>method.active&&method.code!=='credito_cliente').sort((a,b)=>{
      const ai=priority.indexOf(a.code),bi=priority.indexOf(b.code);
      return (ai<0?priority.length:ai)-(bi<0?priority.length:bi)||a.name.localeCompare(b.name);
    })||[];
  },[paymentCatalog.data]);
  const paymentTotalCents=useMemo(()=>{
    const calculated=calculateSalePricing(draft.pricing.items,draft.pricing.discount);
    const freight=draft.pricing.freight.trim()?parsePriceInput(draft.pricing.freight):null;
    return calculated.totals&&freight!==null?calculated.totals.netCents+freight:null;
  },[draft.pricing.items,draft.pricing.discount,draft.pricing.freight]);
  useEffect(()=>{
    if(!activePaymentMethods.length)return;
    const methodId=draft.paymentMethodId??null;
    setPaymentPlan(current=>{
      if(current[0]?.methodId===methodId)return current;
      return [{...current[0],methodId},...current.slice(1)];
    });
  },[activePaymentMethods,draft.paymentMethodId]);
  useEffect(()=>{
    if(paymentAmountsEdited||paymentTotalCents===null)return;
    setPaymentPlan(current=>current.length===1&&current[0].amount!==centsInput(paymentTotalCents)
      ?[{...current[0],amount:centsInput(paymentTotalCents)}]:current);
  },[paymentAmountsEdited,paymentTotalCents]);
  const paymentPlanTotal=paymentPlan.reduce<number|null>((sum,payment)=>{
    const amount=parsePriceInput(payment.amount);
    return sum===null||amount===null?null:sum+amount;
  },0);
  const finalizationPayments:TestPaymentDraft[]=paymentPlan.map(payment=>({
    methodCode:paymentCatalog.data?.methods.find(method=>method.id===payment.methodId)?.code||'',
    amount:payment.amount,status:payment.status,channel:payment.channel,scheduledFor:payment.scheduledFor,
  }));

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-black tracking-tight text-slate-900">NOVA VENDA {numberLabel&&<span className="sale-number-badge whitespace-nowrap">{numberLabel}</span>}</h1>
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
        onClick={onNewSale}
      >
        Nova venda
      </button>}
      </div>
      {sync.status==='error'&&<p role="alert" className="text-sm text-rose-800">{sync.message} As alterações ainda não confirmadas permanecem nesta aba.</p>}

      <form
        onSubmit={event => {
          event.preventDefault();
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
              setPaymentAmountsEdited(false);
              setPaymentPlan([{methodId:null,amount:'0,00',status:'pending',channel:'erp',scheduledFor:''}]);
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
                      onChange={event => {const id=event.target.value;setPaymentAmountsEdited(false);setPaymentPlan([{methodId:null,amount:'0,00',status:'pending',channel:'erp',scheduledFor:''}]);setDraft(previous => ({ ...previous, branchId:id,commercialDefaultsPending:!!id,paymentMethodId:null,paymentTermId:null,pricing:{...previous.pricing,freight:'',freightReason:'',manualFreight:false} }));}}
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
                paymentSection={
                  <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3 lg:col-span-2" aria-label="Pagamento da venda">
                    <h2 className="font-bold text-slate-900">Condição de pagamento</h2>
                    {paymentCatalog.loading && <p role="status" className="text-sm text-slate-500">Consultando pagamentos…</p>}
                    {paymentCatalog.error && <p role="alert" className="text-sm text-rose-800">{paymentCatalog.error} <button type="button" onClick={paymentCatalog.reload} className="underline">Atualizar pagamentos</button></p>}
                    <div className="grid sm:grid-cols-2 gap-3">
                      <fieldset disabled={!paymentCatalog.data || commercial.loading || draft.commercialDefaultsPending} className="space-y-3">
                        <legend className="text-xs font-bold text-slate-600">Formas de pagamento</legend>
                        {paymentPlan.map((payment,index)=><div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)_auto] items-end gap-2">
                          <PaymentSelect label={index===0?'Forma de pagamento da venda':`Forma de pagamento da venda ${index+1}`} value={payment.methodId} rows={paymentCatalog.data?.methods.filter(method=>method.code!=='credito_cliente')||[]} onChange={id=>{
                            setPaymentPlan(rows=>rows.map((row,rowIndex)=>rowIndex===index?{...row,methodId:id}:row));
                            if(index===0)setDraft(previous=>({...previous,paymentMethodId:id}));
                          }} />
                          <label className="block text-xs font-bold text-slate-600">Valor (R$)<input aria-label={`Valor da forma de pagamento ${index+1}`} inputMode="decimal" value={payment.amount} onChange={event=>{setPaymentAmountsEdited(true);setPaymentPlan(rows=>rows.map((row,rowIndex)=>rowIndex===index?{...row,amount:event.target.value}:row));}} className="mt-1 block w-full rounded-xl border border-slate-300 bg-white p-2 text-sm font-normal"/></label>
                          <button type="button" aria-label={`Remover forma de pagamento ${index+1}`} disabled={paymentPlan.length===1||index===0} onClick={()=>setPaymentPlan(rows=>rows.filter((_row,rowIndex)=>rowIndex!==index))} className="rounded-lg p-2 text-rose-700 disabled:opacity-30">Remover</button>
                        </div>)}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <button type="button" disabled={!activePaymentMethods.length} onClick={()=>setPaymentPlan(rows=>[...rows,{methodId:activePaymentMethods.find(method=>!rows.some(row=>row.methodId===method.id))?.id||activePaymentMethods[0]?.id||null,amount:'0,00',status:'pending',channel:'erp',scheduledFor:''}])} className="text-xs font-bold text-blue-700">+ Adicionar forma de pagamento</button>
                          <p className={`text-xs font-bold ${paymentPlanTotal!==null&&paymentTotalCents!==null&&paymentPlanTotal===paymentTotalCents?'text-emerald-800':'text-amber-800'}`}>Soma dos pagamentos: {paymentPlanTotal===null?'Valor inválido':new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(paymentPlanTotal/100)}{paymentTotalCents!==null&&` · Total da venda: ${new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(paymentTotalCents/100)}`}</p>
                        </div>
                        <p className="text-xs text-slate-600">A divisão é confirmada na finalização da venda.</p>
                      </fieldset>
                      <PaymentSelect label="Prazo de pagamento da venda" value={draft.paymentTermId} rows={paymentCatalog.data?.terms || []} disabled={!paymentCatalog.data || commercial.loading || draft.commercialDefaultsPending} onChange={id => setDraft(previous => ({ ...previous, paymentTermId: id }))} />
                    </div>
                  </section>
                }
                finalizationAction={admin&&<div className="space-y-1"><button type="button" onClick={()=>void openTestFinalization()} disabled={!draft.remote?.saleId||draft.remote.orderNumber===null||sync.status!=='saved'||locked||!paymentCatalog.data} className="rounded-xl bg-amber-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">Finalizar venda</button><p className="text-xs text-slate-500">Operação real · estoque e financeiro</p></div>}
                onReceiptPreview={setReceiptPreview}
              />
            )}
        </fieldset>
      </form>
      {finalizing&&paymentCatalog.data&&<TestSaleFinalizationModal userId={userId} details={finalizing} catalog={paymentCatalog.data} initialPayments={finalizationPayments} onClose={()=>setFinalizing(null)} onCompleted={completeTestFinalization}/>}
      {receiptPreview&&<ReceiptPreviewModal data={receiptPreview} onClose={()=>setReceiptPreview(null)}/>}
      {testReceipt&&<ReceiptPreviewModal data={testReceipt} onClose={()=>setTestReceipt(null)}/>}
    </div>
  );
};
