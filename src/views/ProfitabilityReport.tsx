import React from 'react';
import {profitabilityLine,profitabilityTotals,type ProfitabilityInput} from '../services/profitability';
import {money,displayDate} from '../services/operations';
import {exportToCsv} from '../services/csvExport';
const cash=(c:number|null)=>c===null?'Não informado':money(c/100);
const percent=(n:number|null)=>n===null?'—':n.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%';
export function ProfitabilityReport({rows,expenses,filtered}:{rows:ProfitabilityInput[];expenses:number;filtered:boolean}){
 const lines=rows.map(profitabilityLine),total=profitabilityTotals(lines);
 const headers=['Pedido','Data','Cliente','Venda bruta','Desconto','Venda líquida','Custo dos produtos','Lucro dos produtos','Frete cobrado','Custo da entrega','Resultado com frete','Markup'];
 const cells=lines.map(r=>[r.order_number,displayDate(r.confirmed_at),r.customer_name,cash(r.gross),cash(r.discount),cash(r.net),r.cost===null?'Custo pendente':cash(r.cost),r.profit===null?'Custo pendente':cash(r.profit),cash(r.shipping),cash(r.delivery),r.result===null?'Custo pendente':cash(r.result),percent(r.markup)]);
 const metrics=[['Venda bruta',cash(total.gross)],['Descontos',cash(total.discount)],['Venda líquida',cash(total.net)],['Custo dos produtos',total.cost===null?'Custo pendente':cash(total.cost)],['Lucro dos produtos',total.profit===null?'Custo pendente':cash(total.profit)],['Markup',percent(total.markup)],['Frete cobrado',cash(total.shipping)],['Custo das entregas',cash(total.delivery)],['Resultado com frete',total.result===null?'Custo pendente':cash(total.result)]];
 return <section aria-label="Análise de lucratividade" className="space-y-4">
  <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">{metrics.map(([label,value])=><div key={label} className={`rounded-xl border p-4 ${label==='Lucro dos produtos'||label==='Markup'?'bg-blue-100 border-blue-200':'bg-white'}`}><p className="text-xs text-slate-600">{label}</p><p className="text-xl font-black mt-1">{value}</p></div>)}</div>
  <p className="text-sm text-slate-600">Venda líquida = venda bruta − descontos, sem frete. Lucro dos produtos = venda líquida − custo gerencial registrado na venda. Markup = lucro dos produtos ÷ custo × 100. Resultado com frete = lucro dos produtos + frete cobrado − custo da entrega.</p>
  {lines.some(r=>r.cost===null)&&<p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Há produtos sem custo confirmado. O lucro e o markup dessas vendas ficam pendentes até a correção do cadastro.</p>}
  <button className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white" onClick={()=>exportToCsv('lucratividade',headers,cells)}>Exportar CSV</button>
  <div className="overflow-auto rounded-xl border bg-white"><table className="w-full text-left text-sm"><thead><tr>{headers.map(h=><th key={h} className="p-3 whitespace-nowrap">{h}</th>)}</tr></thead><tbody>{cells.length?cells.map((cells,i)=><tr key={lines[i].id} className="border-t">{cells.map((c,j)=><td key={j} className={`p-3 ${j>2?'whitespace-nowrap':''}`}>{c}</td>)}</tr>):<tr><td colSpan={headers.length} className="p-8 text-center text-slate-500">Nenhuma venda encontrada no período.</td></tr>}</tbody></table></div>
  <div className="rounded-xl border bg-white p-4 text-sm"><p>Despesas gerais do período: <strong>{money(expenses)}</strong> (sem rateio por cliente).</p>{!filtered&&<p className="mt-1">Resultado após frete e despesas: <strong>{total.result===null?'Custos pendentes':money(total.result/100-expenses)}</strong></p>}</div>
 </section>;
}
