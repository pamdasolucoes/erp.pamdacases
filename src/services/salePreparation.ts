import type { SalePreparation, PricingPreparation } from '../types/salePreparation';
import type { PricingDraftItem } from '../types/salePricing';

export const emptyPricingPreparation = (): PricingPreparation => ({items:[],discount:'0,00',discountReason:'',notes:'',freight:'',freightReason:'',manualFreight:false,events:[]});
export const emptySalePreparation = (userId:string):SalePreparation => ({version:1,userId,customerId:'',branchId:'',paymentMethodId:null,paymentTermId:null,pricing:emptyPricingPreparation()});
export const salePreparationKey = (project:string,userId:string) => `pamda_sale_preparation:v1:${encodeURIComponent(project)}:${userId}`;

// Browser draft only. Never supplies authentication, permissions or official records.
export function parseSalePreparation(raw:string|null,userId:string):SalePreparation|null {
  if(!raw || raw.length>2_000_000) return null;
  try {
    const value=JSON.parse(raw);
    const text=(v:unknown,max=20000)=>typeof v==='string'&&v.length<=max;
    if(value?.version!==1 || value.userId!==userId || !text(value.customerId,100) || !text(value.branchId,100)) return null;
    const p=value.pricing;
    if(!p || !Array.isArray(p.items) || p.items.length>500 || typeof p.manualFreight!=='boolean' ||
      !['discount','discountReason','notes','freight','freightReason'].every(key=>text(p[key]))) return null;
    const ids=new Set<string>();
    for(const item of p.items as PricingDraftItem[]){
      const s=item?.snapshot;
      if(!item || !text(item.id,100) || ids.has(item.id) || !text(item.quantityInput,100) || !text(item.priceInput,100) || !text(item.reason) ||
        !s || !text(s.productId,100) || !text(s.productCode,100) || !text(s.productName) || s.catalogSource!=='supabase' ||
        !(s.productType===null||['fisico','kit','servico','insumo'].includes(s.productType)) || !text(s.catalogUpdatedAt,100) || !text(s.capturedAt,100) ||
        ![s.originalUnitPriceCents,s.directUnitCostMicros,s.managerialUnitCostMicros].every(n=>n===null || (Number.isSafeInteger(n)&&n!>=0)) ||
        !(s.productSku===null || text(s.productSku)) || !(s.productDescription===null || text(s.productDescription)) || !Array.isArray(s.components)) return null;
      if(item.customization && (!text(item.customization.model,200) || !text(item.customization.color,100) || !['','1','2'].includes(item.customization.walletFaces))) return null;
      ids.add(item.id);
    }
    // Audit/authorization payloads are deliberately not trusted or recovered from browser storage.
    const remote=value.remote;
    if(remote&&(![remote.draftKey,remote.initialCustomerId,remote.initialBranchId].every(id=>typeof id==='string'&&/^[0-9a-f-]{36}$/i.test(id))||
      !(remote.saleId===null||typeof remote.saleId==='string'&&/^[0-9a-f-]{36}$/i.test(remote.saleId))||!['draft','confirmed','cancelled'].includes(remote.status)||
      !(remote.savedFingerprint===null||text(remote.savedFingerprint,500000))))return null;
    return {version:1,userId,customerId:value.customerId,branchId:value.branchId,
      ...(remote?{remote:{draftKey:remote.draftKey,saleId:remote.saleId,initialCustomerId:remote.initialCustomerId,initialBranchId:remote.initialBranchId,status:remote.status,savedFingerprint:remote.savedFingerprint,sellerName:typeof remote.sellerName==='string'?remote.sellerName:undefined}}:{}),
      paymentMethodId:typeof value.paymentMethodId==='string'?value.paymentMethodId:null,paymentTermId:typeof value.paymentTermId==='string'?value.paymentTermId:null,
      pricing:{items:p.items,discount:p.discount,discountReason:p.discountReason,notes:p.notes,freight:p.freight,freightReason:p.freightReason,manualFreight:p.manualFreight,events:[]}};
  }catch{return null;}
}

export function serializeSalePreparation(draft:SalePreparation):string {
  return JSON.stringify({...draft,pricing:{...draft.pricing,events:[]}});
}
