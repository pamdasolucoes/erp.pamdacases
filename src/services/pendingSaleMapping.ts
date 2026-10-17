import type { SalePreparation } from '../types/salePreparation';
import type { SavePendingSaleArgs,SaleDetails,PendingSaleRow } from '../types/pendingSales';
import { emptySalePreparation } from './salePreparation';
import { centsInput,calculateSalePricing,parsePriceInput } from './salePricing';
import { isUuid } from './customerEdits';

export function dbCents(value:unknown):number {
  if(typeof value!=='number'&&typeof value!=='string') throw new Error('Valor monetário incompatível na venda salva.');
  const cents=parsePriceInput(String(value));
  if(cents===null) throw new Error('Valor monetário incompatível na venda salva.');
  return cents;
}
export const snapshotText=(snapshot:Record<string,unknown>,key:string)=>typeof snapshot?.[key]==='string'?snapshot[key] as string:'';
export const saleCustomerName=(sale:PendingSaleRow)=>snapshotText(sale.customer_snapshot,'name')||'Cliente não informado';
export const saleCustomerCode=(sale:PendingSaleRow)=>snapshotText(sale.customer_snapshot,'customer_code');

export function pendingSaleArgs(draft:SalePreparation,saleId:string):SavePendingSaleArgs {
  if(!isUuid(saleId)||!isUuid(draft.customerId)||!isUuid(draft.branchId)) throw new Error('Selecione cliente e unidade para salvar.');
  if(draft.pricing.items.length>200) throw new Error('A venda aceita no máximo 200 itens.');
  const calc=calculateSalePricing(draft.pricing.items,draft.pricing.discount);
  if(!calc.totals||calc.errors.length) throw new Error('Corrija quantidades, preços e desconto para salvar as alterações.');
  if(calc.totals.additionalDiscountCents>0&&!draft.pricing.discountReason.trim()) throw new Error('Informe o motivo do desconto para salvar.');
  const freight=draft.pricing.freight.trim()?parsePriceInput(draft.pricing.freight):null;
  if(draft.pricing.freight.trim()&&freight===null) throw new Error('Informe um frete válido, ou deixe vazio enquanto não definido.');
  const paymentId=(value:string|null|undefined)=>{if(value&&!isUuid(value))throw new Error('Condição de pagamento inválida.');return value||null;};
  return {p_cliente_id:draft.customerId,p_filial_id:draft.branchId,p_venda_id:saleId,
    p_itens:calc.lines.map(line=>{
      if(!isUuid(line.item.snapshot.productId)) throw new Error('Produto inválido no carrinho.');
      return {product_id:line.item.snapshot.productId,quantity:line.quantity,unit_price:line.unitPriceCents/100,
        customization:{...(line.item.customization||{}),...(line.item.reason?{priceChangeReason:line.item.reason}:{})}};
    }),
    p_frete:freight===null?null:freight/100,p_desconto:calc.totals.additionalDiscountCents/100,
    p_motivo:draft.pricing.discountReason||null,p_observacoes:draft.pricing.notes||null,
    p_forma_id:paymentId(draft.paymentMethodId),p_prazo_id:paymentId(draft.paymentTermId)};
}
// No identifier or browser-only audit data affects the dirty comparison.
export function pendingFingerprint(draft:SalePreparation):string {
  const args=pendingSaleArgs(draft,draft.remote?.saleId||'00000000-0000-4000-8000-000000000000');
  return JSON.stringify({...args,p_venda_id:null});
}
export function preparationFromSale(userId:string,details:SaleDetails):SalePreparation {
  const {sale,items}=details;
  const draft=emptySalePreparation(userId);
  draft.customerId=sale.customer_id;draft.branchId=sale.branch_id;
  draft.paymentMethodId=sale.payment_method_id;draft.paymentTermId=sale.payment_term_id;
  draft.pricing={...draft.pricing,discount:centsInput(dbCents(sale.discount_amount)),discountReason:sale.discount_reason||'',notes:sale.notes||'',
    freight:sale.shipping_confirmed&&sale.shipping_charged!==null?centsInput(dbCents(sale.shipping_charged)):'',manualFreight:sale.shipping_confirmed,
    items:items.map(item=>({id:item.id,quantityInput:String(item.quantity),priceInput:centsInput(dbCents(item.negotiated_unit_price)),reason:typeof item.customization?.priceChangeReason==='string'?item.customization.priceChangeReason:'',
      // These are the snapshots actually available in erp_sale_items. Never invent historical costs/catalog prices.
      snapshot:{productId:item.product_id,productCode:item.product_code_snapshot,productSku:item.product_sku_snapshot,
        productName:item.description_snapshot,productDescription:item.description_snapshot,productType:null,catalogSource:'supabase',
        catalogUpdatedAt:item.created_at,capturedAt:item.created_at,originalUnitPriceCents:null,directUnitCostMicros:null,managerialUnitCostMicros:null,components:[]},
      customization:{...item.customization,model:typeof item.customization?.model==='string'?item.customization.model:'',color:typeof item.customization?.color==='string'?item.customization.color:'',
        walletFaces:item.customization?.walletFaces==='1'||item.customization?.walletFaces==='2'?item.customization.walletFaces:''},
    }))};
  draft.remote={draftKey:sale.draft_key||crypto.randomUUID(),saleId:sale.id,initialCustomerId:sale.customer_id,initialBranchId:sale.branch_id,savedFingerprint:null,status:sale.status,sellerName:sale.seller_snapshot};
  // An uneditable/legacy value is retained for inspection, rather than silently dropped.
  try{draft.remote.savedFingerprint=pendingFingerprint(draft);}catch{}
  return draft;
}
