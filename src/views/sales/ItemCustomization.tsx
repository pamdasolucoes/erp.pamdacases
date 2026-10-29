import type {PricingDraftItem} from '../../types/salePricing';

export function ItemCustomization({item,index,onChange}:{item:PricingDraftItem;index:number;onChange(value:NonNullable<PricingDraftItem['customization']>):void}){
 const value=item.customization||{model:'',color:'',walletFaces:'' as const};
 const multiple=item.snapshot.productType==='servico'&&/capa.*(?:fornecida|cedida).*cliente/i.test(item.snapshot.productName);
 const rows=Array.isArray(value.customerCases)?value.customerCases as {model:string;color:string}[]:[{model:value.model,color:value.color}];
 const save=(next:{model:string;color:string}[])=>onChange({...value,model:next[0]?.model||'',color:next[0]?.color||'',...(multiple?{customerCases:next}:{})});
 return <div className="w-full space-y-2">{rows.map((row,i)=><div key={i} className="flex flex-wrap items-end gap-2">
  <label className="min-w-36 flex-1">Modelo<input aria-label={`Modelo informado do item ${index+1}${i?` capa ${i+1}`:''}`} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" maxLength={200} value={row.model} onChange={e=>save(rows.map((r,j)=>j===i?{...r,model:e.target.value}:r))}/></label>
  <label className="min-w-36 flex-1">Cor<input aria-label={`Cor informada do item ${index+1}${i?` capa ${i+1}`:''}`} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" maxLength={100} value={row.color} onChange={e=>save(rows.map((r,j)=>j===i?{...r,color:e.target.value}:r))}/></label>
  {multiple&&i>0&&<button type="button" className="p-2 text-rose-700" onClick={()=>save(rows.filter((_,j)=>j!==i))}>Remover modelo e cor</button>}
 </div>)}{multiple&&rows.length<30&&<button type="button" className="text-emerald-800 underline" onClick={()=>save([...rows,{model:'',color:''}])}>Adicionar modelo e cor</button>}</div>;
}
