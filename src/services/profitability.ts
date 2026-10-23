// Postgres soma custos com precisão maior que centavos; arredonda uma vez por pedido.
function dbCents(value:unknown):number {
 const text=String(value);if(!/^\d+(?:\.\d+)?$/.test(text))throw new Error('Valor incompatível no relatório de lucratividade.');
 const [whole,fraction='']=text.split('.');const cents=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0').slice(0,2))+(Number(fraction[2]||0)>=5?1n:0n);
 const result=Number(cents);if(!Number.isSafeInteger(result))throw new Error('Valor fora da precisão do relatório.');return result;
}
export interface ProfitabilityInput {id:string;order_number:number;confirmed_at:string;customer_name:string;subtotal:number|string;discount_amount:number|string;shipping_charged:number|string;delivery_cost:number|string|null;product_cost:number|string|null;cost_verified:boolean;}
export function profitabilityLine(row:ProfitabilityInput){
 const gross=dbCents(row.subtotal),discount=dbCents(row.discount_amount),net=gross-discount,shipping=dbCents(row.shipping_charged);
 const cost=row.cost_verified&&row.product_cost!==null?dbCents(row.product_cost):null;
 const delivery=row.delivery_cost===null?null:dbCents(row.delivery_cost);
 const profit=cost===null?null:net-cost;
 return {...row,gross,discount,net,shipping,cost,delivery,profit,markup:cost!==null&&cost>0&&profit!==null?profit/cost*100:null,result:profit===null||delivery===null?null:profit+shipping-delivery};
}
export function profitabilityTotals(rows:ReturnType<typeof profitabilityLine>[]){
 const gross=rows.reduce((s,r)=>s+r.gross,0),discount=rows.reduce((s,r)=>s+r.discount,0),net=gross-discount,shipping=rows.reduce((s,r)=>s+r.shipping,0);
 const cost=rows.some(r=>r.cost===null)?null:rows.reduce((s,r)=>s+r.cost!,0);
 const delivery=rows.some(r=>r.delivery===null)?null:rows.reduce((s,r)=>s+r.delivery!,0);
 const profit=cost===null?null:net-cost;
 return {gross,discount,net,shipping,cost,delivery,profit,markup:cost!==null&&cost>0&&profit!==null?profit/cost*100:null,result:profit===null||delivery===null?null:profit+shipping-delivery};
}
