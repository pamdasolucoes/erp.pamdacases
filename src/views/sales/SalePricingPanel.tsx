import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ShoppingCart, Trash2, RotateCcw, AlertTriangle } from 'lucide-react';
import type { OfficialProduct } from '../../types/productCatalog';
import type { PricePreparationEvent, PricingDraftItem, PricingLine } from '../../types/salePricing';
import { authService } from '../../services/auth';
import { calculateSalePricing, captureProductPricing, centsInput, formatMoney, parsePriceInput } from '../../services/salePricing';
import type { CustomerFreightSetting } from '../../types/freight';
import { captureSaleFreight, pendingCustomerFreight, saleTotalWithFreight } from '../../services/freight';
import type { OfficialCustomer, OfficialCustomerBranch } from '../../types/pamdaCore';
import type { ReceiptDocumentData } from '../../types/receipt';
import { SearchDropdown } from '../../components/common/SearchDropdown';
import { ProductThumbnail } from '../../components/common/ProductThumbnail';
import { searchSaleProducts } from '../../services/saleSearch';
import { checkDraftStock } from '../../services/draftStock';
import { createReceiptPreview } from '../../services/receiptPreview';
import type { PricingPreparation } from '../../types/salePreparation';

const inputClass = 'w-full px-3 py-2 border border-slate-300 rounded-xl text-sm bg-white';
function usePreparationField<K extends keyof PricingPreparation>(draft:PricingPreparation,update:React.Dispatch<React.SetStateAction<PricingPreparation>>,key:K):[PricingPreparation[K],React.Dispatch<React.SetStateAction<PricingPreparation[K]>>] {
  return [draft[key],value=>update(previous=>({...previous,[key]:typeof value==='function'?(value as (old:PricingPreparation[K])=>PricingPreparation[K])(previous[key]):value}))];
}

export function SalePricingPanel({ products, customerId, branchId, draft, onDraftChange, sellerName, paymentCondition, customerFreight = pendingCustomerFreight, selectedCustomer = null, selectedBranch = null, onFirstProductAdded, freightEditable = false, paymentSection, finalizationAction, onReceiptPreview }: { products: readonly OfficialProduct[]; customerId: string | null; branchId: string | null; draft:PricingPreparation; onDraftChange:React.Dispatch<React.SetStateAction<PricingPreparation>>; sellerName?:string; paymentCondition?:string; customerFreight?: CustomerFreightSetting; selectedCustomer?: OfficialCustomer | null; selectedBranch?: OfficialCustomerBranch | null; onFirstProductAdded():Promise<void>; freightEditable?:boolean; paymentSection:React.ReactNode; finalizationAction?:React.ReactNode; onReceiptPreview(data:ReceiptDocumentData):void }) {
  const [items, setItems] = usePreparationField(draft,onDraftChange,'items');
  const [discount, setDiscount] = usePreparationField(draft,onDraftChange,'discount');
  const [discountReason, setDiscountReason] = usePreparationField(draft,onDraftChange,'discountReason');
  const [notes, setNotes] = usePreparationField(draft,onDraftChange,'notes');
  const [freight, setFreight] = usePreparationField(draft,onDraftChange,'freight');
  const [freightReason, setFreightReason] = usePreparationField(draft,onDraftChange,'freightReason');
  const [manualFreight, setManualFreight] = usePreparationField(draft,onDraftChange,'manualFreight');
  const [productQuery, setProductQuery] = useState('');
  const [, setEvents] = usePreparationField(draft,onDraftChange,'events');
  const [error, setError] = useState('');
  const revisionRef = useRef(crypto.randomUUID());
  const committedPrices = useRef(new Map<string, number | null>());
  const committedReasons = useRef(new Map<string, string>());
  const committedDiscount = useRef(0);
  const committedDiscountReason = useRef(discountReason);
  const committedFreight = useRef(freight);
  const user = authService.getCurrentUser();
  const calculation = useMemo(() => calculateSalePricing(items, discount), [items, discount]);
  const stock = useMemo(() => checkDraftStock(items, products), [items, products]);
  const productMatches = useMemo(() => searchSaleProducts(products, productQuery).map(product => ({ ...product, disabled: !product.active || (product.controlsInventory && product.stockVerified && product.currentInventory <= 0) })), [products, productQuery]);
  const required = calculation.lines.some(line => line.requiresAuthorization);
  const freightSnapshot = captureSaleFreight(customerId, customerFreight, freight, freightReason, manualFreight);
  const orderTotal = saleTotalWithFreight(calculation.totals?.netCents ?? null, freight);
  const invalidate = () => {
    revisionRef.current = crypto.randomUUID();
    setError('');
  };
  useEffect(() => { invalidate(); }, [customerId, branchId]);
  const changeItem = (id: string, patch: Partial<Pick<PricingDraftItem, 'priceInput' | 'quantityInput' | 'reason' | 'customization'>>) => {
    invalidate(); setItems(previous => previous.map(item => item.id === id ? { ...item, ...patch } : item));
  };
  function record(kind: PricePreparationEvent['kind'], line?: PricingLine, previous: number | null = null, reason?: string) {
    if (!user?.active) return;
    const event: PricePreparationEvent = {
      id: crypto.randomUUID(), kind, itemId: line?.item.id || null, productName: line?.item.snapshot.productName || null,
      productSnapshot: line?.item.snapshot || null, quantity: line?.quantity || null,
      actorId: user.id, actorUsername: user.username,
      recordedAt: new Date().toISOString(), originalUnitPriceCents: line?.item.snapshot.originalUnitPriceCents ?? null,
      previousUnitPriceCents: previous, practicedUnitPriceCents: line?.unitPriceCents ?? null,
      additionalDiscountCents: calculation.totals?.additionalDiscountCents ?? 0, netLineCents: line?.netCents ?? null,
      reason: reason ?? line?.item.reason ?? discountReason, authorizationRequired: line?.requiresAuthorization ?? required,
      revision: revisionRef.current,
      freightSnapshot,
    };
    setEvents(previousEvents => [...previousEvents, event]);
  }
  const addItem = async(id: string) => {
    const product = products.find(value => value.id === id && value.active);
    if (!product) return;
    try {
      const existing = items.find(item => item.snapshot.productId === id);
      if (existing && (!/^\d+$/.test(existing.quantityInput) || !Number.isSafeInteger(Number(existing.quantityInput)) || Number(existing.quantityInput) < 1)) throw new Error('Corrija a quantidade do item antes de acrescentar outra unidade.');
      const snapshot = captureProductPricing(product, products, new Date().toISOString());
      const item = { id: crypto.randomUUID(), snapshot, quantityInput: '1', priceInput: snapshot.originalUnitPriceCents === null ? '' : centsInput(snapshot.originalUnitPriceCents), reason: '' };
      const next = existing ? items.map(row => row.id === existing.id ? { ...row, quantityInput: String(Number(row.quantityInput) + 1) } : row) : [...items, item];
      const availability = checkDraftStock(next, products);
      if (availability.errors.length) throw new Error(availability.errors.join(' '));
      if (existing) { invalidate(); setItems(next); return; }
      committedPrices.current.set(item.id, snapshot.originalUnitPriceCents);
      committedReasons.current.set(item.id, '');
      invalidate(); setItems(next);
      if(items.length===0)await onFirstProductAdded();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Preço de catálogo inválido.'); }
  };
  const commitPrice = (item: PricingDraftItem) => {
    const price = parsePriceInput(item.priceInput);
    if (price === null) return;
    const previous = committedPrices.current.get(item.id) ?? item.snapshot.originalUnitPriceCents;
    const line = calculation.lines.find(value => value.item.id === item.id);
    if (previous !== price && line) record('price_changed', line, previous);
    committedPrices.current.set(item.id, price);
    setItems(rows => rows.map(row => row.id === item.id ? { ...row, priceInput: centsInput(price) } : row));
  };
  const restore = (item: PricingDraftItem) => {
    const previous = parsePriceInput(item.priceInput);
    const rows = items.map(row => row.id === item.id ? { ...row, priceInput: row.snapshot.originalUnitPriceCents === null ? '' : centsInput(row.snapshot.originalUnitPriceCents) } : row);
    const line = calculateSalePricing(rows, discount).lines.find(value => value.item.id === item.id);
    invalidate(); setItems(rows);
    if (line && previous !== item.snapshot.originalUnitPriceCents) record('price_restored', line, previous);
    committedPrices.current.set(item.id, item.snapshot.originalUnitPriceCents);
  };
  return <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
    <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row justify-between gap-3">
      <h2 className="font-bold flex items-center gap-2"><ShoppingCart className="w-5 h-5" />Produtos</h2>
      <div className="w-full sm:max-w-xl"><SearchDropdown label="Adicionar produto do catálogo oficial" placeholder="Pesquisar por nome, aparelho, SKU ou código" query={productQuery} onQueryChange={setProductQuery} options={productMatches} onSelect={product => addItem(product.id)}
        renderOption={product => <div className="flex items-center gap-3"><ProductThumbnail url={product.imageUrl} /><div className="min-w-0"><p className="font-semibold">{product.name}</p><p className="text-xs text-slate-500">Código {product.code} · {product.salePrice === null ? 'Preço a informar' : formatMoney(Math.round(product.salePrice*100))}</p></div></div>} /></div>
    </div>
    {error && <p role="alert" className="m-4 p-3 rounded-xl bg-rose-50 text-rose-800 text-sm">{error}</p>}
    {calculation.errors.map(message => <p key={message} role="alert" className="m-4 text-rose-800 text-sm">{message}</p>)}
    {stock.errors.map(message => <p key={message} role="alert" className="m-4 text-rose-800 text-sm">{message}</p>)}
    <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead className="bg-slate-50"><tr><th className="p-2">Produto</th><th className="p-2">Quantidade</th><th className="p-2">Preço unitário</th><th className="p-2 text-right">Subtotal</th><th className="p-2"> </th></tr></thead>
      <tbody>{items.length === 0 ? <tr><td colSpan={5} className="text-center p-8 text-slate-500">Adicione um produto para começar.</td></tr> : items.map((item, index) => {
        const line = calculation.lines.find(value => value.item.id === item.id);
        const parsed = parsePriceInput(item.priceInput);
        const changed = parsed !== null && parsed !== item.snapshot.originalUnitPriceCents;
        return <React.Fragment key={item.id}>
          <tr className={`border-t border-slate-100 ${changed ? 'bg-amber-50/60' : ''}`}>
            <td className="p-2 min-w-40"><p className="font-semibold">{item.snapshot.productName}</p><p className="text-xs text-slate-500">Cód. {item.snapshot.productCode}</p>{changed && <span className="text-xs font-semibold text-amber-800">Preço negociado</span>}</td>
            <td className="p-2"><input aria-label={`Quantidade do item ${index + 1}`} className="w-16 rounded border p-2" type="number" min="1" step="1" value={item.quantityInput} onChange={event => changeItem(item.id, { quantityInput: event.target.value })} /></td>
            <td className="p-2"><input aria-label={`Valor unitário do item ${index + 1}`} aria-invalid={parsed === null} className={`w-28 rounded border p-2 ${parsed === null ? 'border-rose-500' : changed ? 'border-amber-500' : ''}`} inputMode="decimal" type="text" value={item.priceInput} onChange={event => changeItem(item.id, { priceInput: event.target.value })} onBlur={() => commitPrice(item)} />{(changed || item.snapshot.originalUnitPriceCents === null) && <button type="button" disabled={item.snapshot.productType === null && item.snapshot.originalUnitPriceCents === null} title={item.snapshot.productType === null ? 'O preço original não consta no histórico deste item.' : undefined} onClick={() => restore(item)} aria-label={`Restaurar preço do item ${index + 1}`} className="mt-1 block text-xs text-blue-700">Restaurar preço</button>}</td>
            <td className="whitespace-nowrap p-2 text-right font-semibold">{line ? formatMoney(line.grossCents) : 'Valor inválido'}</td>
            <td className="p-2"><button type="button" aria-label={`Remover item ${index + 1}`} onClick={() => { invalidate(); setItems(previous => previous.filter(row => row.id !== item.id)); committedPrices.current.delete(item.id); committedReasons.current.delete(item.id); }} className="p-2 text-rose-600"><Trash2 className="h-4 w-4" /></button></td>
          </tr>
          <tr className="border-b border-slate-100">
            <td colSpan={5} className="px-2 pb-2">
              <details className="text-xs">
                <summary className="cursor-pointer text-slate-600">Personalização e motivo (opcional)</summary>
                <div className="mt-2 flex flex-wrap gap-2">
                  <label className="min-w-36 flex-1">Modelo<input aria-label={`Modelo informado do item ${index + 1}`} value={item.customization?.model || ''} maxLength={200} onChange={event => changeItem(item.id, { customization: { ...(item.customization || { model: '', color: '', walletFaces: '' }), model: event.target.value } })} className={`${inputClass} mt-1`} /></label>
                  <label className="min-w-36 flex-1">Cor<input aria-label={`Cor informada do item ${index + 1}`} value={item.customization?.color || ''} maxLength={100} onChange={event => changeItem(item.id, { customization: { ...(item.customization || { model: '', color: '', walletFaces: '' }), color: event.target.value } })} className={`${inputClass} mt-1`} /></label>
                  <label className="min-w-36 flex-1">Carteira<select aria-label={`Faces da carteira do item ${index + 1}`} value={item.customization?.walletFaces || ''} onChange={event => changeItem(item.id, { customization: { ...(item.customization || { model: '', color: '', walletFaces: '' }), walletFaces: event.target.value as '' | '1' | '2' } })} className={`${inputClass} mt-1`}><option value="">Não informado / não se aplica</option><option value="1">Uma face</option><option value="2">Duas faces</option></select></label>
                  <label className="min-w-48 flex-1">Motivo da negociação<input aria-label={`Motivo da alteração do item ${index + 1}`} maxLength={1000} value={item.reason} onChange={event => changeItem(item.id, { reason: event.target.value })} onBlur={() => { if (committedReasons.current.get(item.id) !== item.reason) { if (line) record('reason_changed', line); committedReasons.current.set(item.id, item.reason); } }} className={`${inputClass} mt-1`} /></label>
                </div>
              </details>
              {line?.requiresAuthorization && user?.role !== 'admin_gerencial' && (
                <p role="status" className="mt-1 flex items-start gap-2 text-xs text-rose-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {line.directCostCents === null
                    ? 'Preço não validado. Solicite análise gerencial antes de concluir a venda.'
                    : 'Este preço requer análise gerencial antes de concluir a venda.'}
                </p>
              )}
            </td>
          </tr>
        </React.Fragment>;
      })}</tbody></table></div>
    <div className="grid grid-cols-1 gap-4 border-t border-slate-200 bg-slate-50 p-4 lg:grid-cols-2">
      <div className="space-y-3">
        <label className="block text-sm font-bold">
          DESCONTO GERENCIAL (R$)
          <input
            aria-label="DESCONTO GERENCIAL (R$)"
            inputMode="decimal"
            type="text"
            value={discount}
            onChange={event => { invalidate(); setDiscount(event.target.value); }}
            onBlur={() => {
              const parsed = parsePriceInput(discount);
              if (parsed !== null) {
                if (parsed !== committedDiscount.current && calculation.totals) record('discount_changed');
                committedDiscount.current = parsed;
                setDiscount(centsInput(parsed));
              }
            }}
            className={`${inputClass} mt-1`}
          />
        </label>
        <label className="block text-sm">
          Motivo do desconto
          <input
            aria-label="Motivo do desconto"
            value={discountReason}
            onChange={event => { invalidate(); setDiscountReason(event.target.value); }}
            onBlur={() => {
              if (committedDiscountReason.current !== discountReason) {
                if (calculation.totals) record('reason_changed', undefined, null, discountReason);
                committedDiscountReason.current = discountReason;
              }
            }}
            maxLength={1000}
            className={`${inputClass} mt-1`}
          />
        </label>
        <label className="block text-sm font-bold">
          FRETE COBRADO (R$)
          <input
            aria-label="Frete cobrado (R$)"
            disabled={!freightEditable}
            inputMode="decimal"
            value={freight}
            placeholder="0,00"
            onChange={event => { invalidate(); setManualFreight(true); setFreight(event.target.value); }}
            onBlur={() => {
              const parsed = parsePriceInput(freight);
              if (parsed !== null) {
                if (committedFreight.current !== freight) record('freight_changed', undefined, null, freightReason);
                committedFreight.current = centsInput(parsed);
                setFreight(centsInput(parsed));
              }
            }}
            className={`${inputClass} mt-1`}
            aria-invalid={!!freight.trim() && parsePriceInput(freight) === null}
          />
        </label>
        {!freightEditable && <p className="text-xs text-slate-500">A alteração do frete exige autorização do servidor.</p>}
        {orderTotal.error && <p role="status" className="text-sm text-amber-900">{orderTotal.error}</p>}
        <label className="block text-sm font-bold">
          OBSERVAÇÕES
          <textarea
            aria-label="OBSERVAÇÕES"
            rows={3}
            value={notes}
            onChange={event => setNotes(event.target.value)}
            className={`${inputClass} mt-1`}
          />
        </label>
      </div>
      <div className="space-y-2 self-center text-sm" aria-live="polite">
        <p className="flex justify-between gap-4"><span>Subtotal dos produtos</span><strong data-testid="negotiated-subtotal">{calculation.totals ? formatMoney(calculation.totals.negotiatedCents) : 'Valor inválido'}</strong></p>
        {calculation.totals?.additionalDiscountCents ? <p className="flex justify-between gap-4"><span>Desconto gerencial</span><strong>− {formatMoney(calculation.totals.additionalDiscountCents)}</strong></p> : null}
        <p className="flex justify-between gap-4"><span>Frete</span><strong>{freightSnapshot.chargedCents === null ? 'Não informado' : formatMoney(freightSnapshot.chargedCents)}</strong></p>
        <p className="flex justify-between gap-4 border-t border-slate-300 pt-2 text-lg font-black">
          <span>Total da venda</span>
          <strong data-testid="pricing-total">{calculation.totals === null ? 'Valor inválido' : orderTotal.totalCents === null ? 'Informe um frete válido' : formatMoney(orderTotal.totalCents)}</strong>
        </p>
      </div>
      {paymentSection}
      <div className="flex flex-col items-start gap-3 border-t pt-4 sm:flex-row sm:items-center lg:col-span-2">
        <button
          type="button"
          onClick={() => {
            setError('');
            try {
              if (stock.errors.length) throw new Error(stock.errors.join(' '));
              onReceiptPreview(createReceiptPreview({
                customer: selectedCustomer,
                branch: selectedBranch,
                items,
                discount,
                freight: freightSnapshot,
                notes,
                seller: user&&sellerName?{...user,name:sellerName}:user,
                generatedAt: new Date().toISOString(),
                paymentCondition,
              }));
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : 'Não foi possível gerar o recibo.');
            }
          }}
          className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white"
        >
          Ver / imprimir recibo
        </button>
        {finalizationAction}
      </div>
    </div>
  </section>;
}
