import {SaleMovementModal,CustomerSaleHistoryModal} from './sales/SaleMovementModal';
import {ProfitabilityReport} from './ProfitabilityReport';
import type {ProfitabilityInput} from '../services/profitability';
import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {operations,money,localDate,displayDate,type OperationModule,type DataRow} from '../services/operations';
import {authService} from '../services/auth';
import {exportToCsv} from '../services/csvExport';
import {useProgressiveRows} from '../hooks/useProgressiveRows';
import {productCatalog} from '../services/catalogResources';

const names:Record<OperationModule,string>={stock:'Estoque e movimentos',purchases:'Compras e entradas',expenses:'Despesas',receivables:'Contas a receber',closings:'Fechamentos',production:'Fila de produção',deliveries:'Fretes e entregas',reports:'Relatório de vendas',profitability:'Lucratividade',audit:'Auditoria e logs',settings:'Configurações'};
const statusNames:Record<string,string>={blocked:'Aguardando pagamento',queued:'Na fila',in_progress:'Em produção',ready:'Pronto',pending:'Pendente',dispatched:'Em entrega',delivered:'Entregue',cancelled:'Cancelado'};
const inputClass='w-full rounded-lg border border-slate-300 px-3 py-2 bg-white text-sm';
const buttonClass='rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50';
function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="grid gap-1 text-sm font-medium">{label}{children}</label>;}
function Input({label,name,type='text',required=true,value,onChange,min,step}:{label:string;name?:string;type?:string;required?:boolean;value?:string|number;onChange?:(e:React.ChangeEvent<HTMLInputElement>)=>void;min?:number;step?:string}){return <Field label={label}><input className={inputClass} name={name} type={type} required={required} value={value} onChange={onChange} min={min} step={step}/></Field>;}
function Table({headers,rows}:{headers:string[];rows:React.ReactNode[][]}){const list=useProgressiveRows(rows, JSON.stringify(headers)+rows.length);return <div className="overflow-auto rounded-xl border bg-white"><table className="w-full text-left text-sm"><thead className="bg-slate-100"><tr>{headers.map(h=><th className="p-3 whitespace-nowrap" key={h}>{h}</th>)}</tr></thead><tbody>{rows.length?list.visible.map((cells,i)=><tr className="border-t" key={i}>{cells.map((c,j)=><td className="p-3 align-top" key={j}>{c}</td>)}</tr>):<tr><td className="p-8 text-center text-slate-500" colSpan={headers.length}>Nenhum registro encontrado.</td></tr>}</tbody></table>{list.hasMore&&<button type="button" className="m-3 rounded-lg border px-4 py-2 text-sm" onClick={list.showMore}>Mostrar mais registros ({list.visible.length} de {rows.length})</button>}</div>;}

export function OperationsView({module,suppliers=false,byCustomer=false,costOnly=false}:{module:OperationModule;suppliers?:boolean;byCustomer?:boolean;costOnly?:boolean}){
 const [data,setData]=useState<DataRow|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [search,setSearch]=useState(''),[start,setStart]=useState(localDate().slice(0,7)+'-01'),[end,setEnd]=useState(localDate());
 const [stockKind,setStockKind]=useState('adjustment'),[target,setTarget]=useState<DataRow|null>(null);
 const [reviewSale,setReviewSale]=useState<string|null>(null),[historyCustomer,setHistoryCustomer]=useState<{id:string;name:string}|null>(null);
 const [settings,setSettings]=useState<DataRow>({});
 const [entryItems,setEntryItems]=useState<DataRow[]>([{product_id:'',quantity:1,unit_cost:''}]);
 const revision=useRef(0),request=useRef({signature:'',key:''});
 const filteredPeriod=['reports','profitability','expenses','audit'].includes(module);
 const allowed=(permission:string)=>authService.getCurrentUser()?.role==='admin_gerencial'||authService.getCurrentUser()?.permissions?.[permission]===true;
 const reload=useCallback(async()=>{
  const version=++revision.current;setLoading(true);setError('');
  try{const value=await operations.read(module,filteredPeriod?start:'',filteredPeriod?end:'');if(version===revision.current){setData(value);if(module==='settings')setSettings(value);}}
  catch(e){if(version===revision.current){setData(null);setError(e instanceof Error?e.message:'Falha ao consultar.');}}
  finally{if(version===revision.current)setLoading(false);}
 },[module,start,end,filteredPeriod]);
 useEffect(()=>{void reload();return()=>{revision.current++;};},[reload]);
 useEffect(()=>{setTarget(null);setNotice('');setSearch('');},[module,suppliers]);
 async function write(action:string,payload:DataRow){
  if(busy)return;setBusy(true);setError('');setNotice('');
  const signature=JSON.stringify([action,payload]);if(request.current.signature!==signature)request.current={signature,key:crypto.randomUUID()};
  try{await operations.write(action,payload,request.current.key);request.current={signature:'',key:''};setTarget(null);setNotice('Operação confirmada no Supabase.');if(action==='stock')productCatalog.invalidate();await reload();}
  catch(e){setError(e instanceof Error?e.message:'Não foi possível confirmar a operação.');}finally{setBusy(false);}
 }
 const rows:DataRow[]=data?.rows||[];
 const matches=(row:DataRow)=>JSON.stringify(row).toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'));
 const fields=(form:HTMLFormElement)=>Object.fromEntries(new FormData(form).entries()) as Record<string,string>;
 const cards=(values:[string,string][])=> <div className="grid gap-3 sm:grid-cols-3">{values.map(([label,value])=><div className="rounded-xl border bg-white p-4" key={label}><p className="text-xs text-slate-500">{label}</p><p className="text-xl font-black">{value}</p></div>)}</div>;
 const reportRows=useMemo(()=>{
  if(!byCustomer)return rows;
  const groups=new Map<string,DataRow>();for(const row of rows){const prev=groups.get(row.customer_id)||{customer_id:row.customer_id,customer_name:row.customer_name,total:0,count:0};prev.total+=Number(row.total);prev.count++;groups.set(row.customer_id,prev);}return [...groups.values()].sort((a,b)=>b.total-a.total);
 },[rows,byCustomer]);
 return <div className="space-y-5">{reviewSale&&<SaleMovementModal saleId={reviewSale} onClose={()=>setReviewSale(null)} onChanged={()=>void reload()}/>}{historyCustomer&&<CustomerSaleHistoryModal customerId={historyCustomer.id} name={historyCustomer.name} onClose={()=>setHistoryCustomer(null)} onChanged={()=>void reload()}/>}
  <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-black">{suppliers?'Fornecedores':byCustomer?'Vendas por cliente':costOnly?'Custo do estoque':names[module]}</h1><button className={buttonClass} disabled={busy||loading} onClick={()=>void reload()}>Atualizar</button></header>
  <div className="flex flex-wrap items-end gap-3"><Input label="Pesquisar" value={search} onChange={e=>setSearch(e.target.value)} required={false}/>{filteredPeriod&&<><Input label="De" type="date" value={start} onChange={e=>setStart(e.target.value)}/><Input label="Até" type="date" value={end} onChange={e=>setEnd(e.target.value)}/></>}</div>
  {error&&<p role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-800">{error}</p>}{notice&&<p role="status" className="text-emerald-800">{notice}</p>}
  {loading?<p role="status">Consultando Supabase…</p>:data&&<>
  {module==='stock'&&<>
   {costOnly&&cards([['Custo do estoque',data.products.some((p:DataRow)=>p.cost===null)?'Sem permissão':money(data.products.reduce((s:number,p:DataRow)=>s+Number(p.balance)*Number(p.cost),0))],['Produtos com saldo não conferido',String(data.products.filter((p:DataRow)=>!p.verified).length)]])}
   {!costOnly&&allowed('stock.manage')&&<form className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();const f=fields(e.currentTarget);void write('stock',{kind:'adjustment',reason:f.reason,items:[{product_id:f.product_id,counted:Number(f.counted)}]});}}>
    <h2 className="font-bold sm:col-span-2">Ajuste por contagem física</h2><Field label="Produto"><select className={inputClass} name="product_id" required><option value="">Selecione</option>{data.products.map((p:DataRow)=><option key={p.id} value={p.id}>{p.code} · {p.name} · saldo {p.balance}</option>)}</select></Field><Input label="Quantidade contada (novo saldo)" name="counted" type="number" min={0} step="0.001"/><Input label="Motivo do ajuste" name="reason"/><div className="self-end"><button className={buttonClass} disabled={busy}>Registrar ajuste</button></div>
   </form>}
   <Table headers={['Código','Produto','Saldo','Conferência',...(costOnly?['Custo unitário','Custo total']:['Mínimo'])]} rows={data.products.filter(matches).map((p:DataRow)=>[p.code,p.name,p.balance,p.verified?'Conferido':'Não conferido',...(costOnly?[p.cost===null?'—':money(p.cost),p.cost===null?'—':money(Number(p.balance)*Number(p.cost))]:[p.min])])}/>
   {!costOnly&&<><h2 className="font-bold">Últimos 500 movimentos</h2><Table headers={['Data','Produto','Tipo','Quantidade','Saldo após','Motivo']} rows={data.movements.filter(matches).map((m:DataRow)=>[displayDate(m.created_at),`${m.code} · ${m.name}`,({entry:'Entrada',adjustment:'Ajuste',sale:'Venda',reversal:'Estorno'} as DataRow)[m.kind],m.quantity,m.balance_after,m.reason])}/></>}
  </>}
  {module==='purchases'&&(suppliers?<>
   <form className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();void write('supplier',fields(e.currentTarget));}}><Input label="Nome do fornecedor" name="name"/><Input label="Contato" name="contact" required={false}/><Input label="Observações" name="notes" required={false}/><button className={buttonClass} disabled={busy}>Cadastrar fornecedor</button></form>
   <Table headers={['Nome','Contato','Observações','Situação']} rows={data.suppliers.filter(matches).map((s:DataRow)=>[s.name,s.contact,s.notes,s.active?'Ativo':'Inativo'])}/>
  </>:<>
   <form className="space-y-3 rounded-xl border bg-white p-4" onSubmit={e=>{e.preventDefault();const f=fields(e.currentTarget);void write('stock',{kind:'entry',date:f.date,supplier_id:f.supplier_id,reason:f.reason,items:entryItems.map(i=>({...i,quantity:Number(i.quantity),unit_cost:Number(i.unit_cost)}))});}}>
    <h2 className="font-bold">Entrada de estoque</h2><div className="grid sm:grid-cols-3 gap-3"><Input label="Data da entrada" name="date" type="date" value={undefined}/><Field label="Fornecedor (opcional)"><select className={inputClass} name="supplier_id"><option value="">Sem fornecedor</option>{data.suppliers.filter((s:DataRow)=>s.active).map((s:DataRow)=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field><Input label="Descrição / referência" name="reason"/></div>
    {entryItems.map((item,index)=><div className="grid sm:grid-cols-4 gap-3 items-end" key={index}><Field label="Produto"><select className={inputClass} value={item.product_id} required onChange={e=>setEntryItems(prev=>prev.map((r,i)=>i===index?{...r,product_id:e.target.value}:r))}><option value="">Selecione</option>{data.products.map((p:DataRow)=><option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</select></Field><Input label="Quantidade" type="number" min={0.001} step="0.001" value={item.quantity} onChange={e=>setEntryItems(prev=>prev.map((r,i)=>i===index?{...r,quantity:e.target.value}:r))}/><Input label="Custo unitário (R$)" type="number" min={0} step="0.0001" value={item.unit_cost} onChange={e=>setEntryItems(prev=>prev.map((r,i)=>i===index?{...r,unit_cost:e.target.value}:r))}/><button type="button" disabled={entryItems.length===1||busy} onClick={()=>setEntryItems(prev=>prev.filter((_,i)=>i!==index))}>Remover item</button></div>)}
    <div className="flex gap-3"><button type="button" className="underline" disabled={busy} onClick={()=>setEntryItems(p=>[...p,{product_id:'',quantity:1,unit_cost:''}])}>Adicionar produto</button><button className={buttonClass} disabled={busy}>Confirmar entrada</button></div>
   </form><p className="text-sm text-slate-600">A entrada soma o estoque e recalcula o custo médio. O fornecedor é opcional.</p>
   <Table headers={['Data','Fornecedor','Valor','Referência']} rows={data.entries.filter(matches).map((r:DataRow)=>[r.entry_date,r.supplier_name||'Sem fornecedor',money(r.total),r.reason])}/>
  </>)}
  {module==='expenses'&&<>
   <form className="grid sm:grid-cols-3 gap-3 rounded-xl border bg-white p-4" onSubmit={e=>{e.preventDefault();const f=fields(e.currentTarget);void write('expense',{...f,paid:f.paid==='on'});}}><Input label="Descrição" name="description"/><Input label="Categoria" name="category"/><Input label="Valor (R$)" name="amount" type="number" min={0.01} step="0.01"/><Input label="Data" name="date" type="date"/><label className="self-center"><input name="paid" type="checkbox"/> Já foi paga</label><button className={buttonClass} disabled={busy}>Lançar despesa</button></form>
   {cards([['Total no período',money(rows.reduce((s,r)=>s+Number(r.amount),0))],['Em aberto',money(rows.filter(r=>!r.paid).reduce((s,r)=>s+Number(r.amount),0))]])}
   <Table headers={['Data','Descrição','Categoria','Valor','Situação']} rows={rows.filter(matches).map(r=>[r.expense_date,r.description,r.category,money(r.amount),r.paid?'Paga':<button disabled={busy} className="underline" onClick={()=>void write('expense_paid',{id:r.id})}>Registrar pagamento</button>])}/>
  </>}
  {module==='receivables'&&<>
   {cards([['Total a receber',money(rows.reduce((s,r)=>s+Number(r.total)-Number(r.paid),0))],['Recebido',money(rows.reduce((s,r)=>s+Number(r.paid),0))],['Vencido',money(rows.filter(r=>r.due_date<localDate()).reduce((s,r)=>s+Number(r.total)-Number(r.paid),0))]])}
   <Table headers={['Pedido','Cliente','Vencimento','Total','Recebido','Saldo','Ações']} rows={rows.filter(matches).map(r=>[r.order_number,r.customer_name,r.due_date,money(r.total),money(r.paid),money(Number(r.total)-Number(r.paid)),Number(r.paid)<Number(r.total)&&allowed('finance.manage')?<button className="underline" onClick={()=>setTarget(r)}>Registrar recebimento</button>:'—'])}/>
   {target&&<form className="grid sm:grid-cols-2 gap-3 border bg-white rounded-xl p-4" onSubmit={e=>{e.preventDefault();void write('payment',{...fields(e.currentTarget),sale_id:target.sale_id});}}><h2 className="font-bold sm:col-span-2">Recebimento do pedido {target.order_number}</h2><Input label="Valor recebido (R$)" name="amount" type="number" min={0.01} step="0.01"/><Field label="Forma de pagamento"><select className={inputClass} name="method_code" required>{data.methods.map((m:DataRow)=><option key={m.code} value={m.code}>{m.name}</option>)}</select></Field><Input label="Comprovante / referência" name="reference"/><button className={buttonClass} disabled={busy}>Confirmar recebimento</button></form>}
  </>}
  {module==='closings'&&<>
   {allowed('finance.manage')&&<form className="grid sm:grid-cols-3 gap-3 border rounded-xl bg-white p-4" onSubmit={e=>{e.preventDefault();void write('closing',fields(e.currentTarget));}}><Field label="Cliente"><select name="customer_id" className={inputClass} required><option value="">Selecione</option>{data.customers.map((c:DataRow)=><option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select></Field><Input label="Início" name="start" type="date"/><Input label="Fim" name="end" type="date"/><button className={buttonClass} disabled={busy}>Gerar fechamento</button></form>}
   <Table headers={['Cliente','Período','Pedidos','Valor','Saldo atual']} rows={rows.filter(matches).map(r=>[r.customer_name,`${r.period_start} a ${r.period_end}`,(r.orders||[]).join(', '),money(r.total),money(r.balance)])}/>
  </>}
  {module==='production'&&<Table headers={['Pedido','Cliente','Itens e personalização','Situação','Ação']} rows={rows.filter(matches).map(r=>[r.order_number,r.customer_name,<div>{r.items?.map((i:DataRow,n:number)=><p key={n}>{i.quantity} × {i.name}{i.customization&&' · '+Object.values(i.customization).filter(Boolean).join(' / ')}</p>)}{r.notes&&<p className="font-bold">{r.notes}</p>}</div>,statusNames[r.status],allowed('production.manage')&&['queued','in_progress'].includes(r.status)?<button className={buttonClass} disabled={busy} onClick={()=>void write('production',{sale_id:r.sale_id,status:r.status==='queued'?'in_progress':'ready'})}>{r.status==='queued'?'Iniciar produção':'Marcar pronto'}</button>:'—'])}/>}
  {module==='deliveries'&&<>
   <Table headers={['Pedido','Cliente / endereço','Produção','Entrega','Frete cobrado','Custo real','Ação']} rows={rows.filter(matches).map(r=>[r.order_number,<div>{r.customer_name}<p className="text-xs">{[r.address?.address,r.address?.number,r.address?.neighborhood,r.address?.city].filter(Boolean).join(', ')}</p></div>,statusNames[r.production_status],statusNames[r.status],money(r.shipping_charged),r.actual_cost===null?'Não informado':money(r.actual_cost),<button className="underline" disabled={busy} onClick={()=>setTarget(r)}>Atualizar entrega</button>])}/>
   {target&&<form className="grid sm:grid-cols-3 gap-3 border rounded-xl bg-white p-4" onSubmit={e=>{e.preventDefault();void write('delivery',{...fields(e.currentTarget),sale_id:target.sale_id});}}><Field label={`Pedido ${target.order_number} · situação`}><select className={inputClass} name="status" defaultValue={target.status}>{['pending','dispatched','delivered'].map(s=><option key={s} value={s}>{statusNames[s]}</option>)}</select></Field><Input label="Entregador / transportadora" name="carrier" required={false}/><Input label="Custo real (R$)" name="actual_cost" type="number" min={0} step="0.01"/><button className={buttonClass} disabled={busy}>Salvar entrega</button></form>}
  </>}
  {module==='reports'&&<>
   {cards([['Vendas',String(rows.length)],['Receita',money(rows.reduce((s,r)=>s+Number(r.total),0))],['Ticket médio',money(rows.length?rows.reduce((s,r)=>s+Number(r.total),0)/rows.length:0)]])}
   <button className={buttonClass} onClick={()=>exportToCsv(byCustomer?'vendas-por-cliente':'vendas',['Pedido / Quantidade','Cliente','Valor'],reportRows.map(r=>[byCustomer?r.count:r.order_number,r.customer_name,Number(r.total)]))}>Exportar CSV</button>
   <Table headers={byCustomer?['Cliente','Vendas','Valor']:['Pedido','Data','Cliente','Valor']} rows={reportRows.filter(matches).map(r=>byCustomer?[<button type="button" className="text-emerald-800 underline font-semibold" onClick={()=>setHistoryCustomer({id:r.customer_id,name:r.customer_name})}>{r.customer_name}</button>,r.count,money(r.total)]:[<button type="button" className="text-emerald-800 underline font-semibold" onClick={()=>setReviewSale(r.id)}>Pedido {r.order_number}</button>,displayDate(r.confirmed_at),<button type="button" className="text-emerald-800 underline" onClick={()=>setHistoryCustomer({id:r.customer_id,name:r.customer_name})}>{r.customer_name}</button>,money(r.total)])}/>
  </>}
  {module==='profitability'&&<ProfitabilityReport rows={rows.filter(matches) as ProfitabilityInput[]} expenses={Number(data.expenses??0)} filtered={!!search.trim()}/>}
  {module==='audit'&&<Table headers={['Data','Ação','Responsável','Detalhes']} rows={rows.filter(matches).map(r=>[displayDate(r.happened_at),r.action,r.actor_user_id,<details><summary>Consultar</summary><pre className="max-w-lg whitespace-pre-wrap text-xs">{JSON.stringify(r.details,null,2)}</pre></details>])}/>}
  {module==='settings'&&<form className="grid sm:grid-cols-2 gap-3 border rounded-xl bg-white p-4" onSubmit={e=>{e.preventDefault();void write('settings',settings);}}>{[['company_name','Empresa'],['cnpj','CNPJ'],['phone','Telefone'],['pix_key','Chave Pix']].map(([key,label])=><Input key={key} label={label} value={settings[key]||''} required={key==='company_name'} onChange={e=>setSettings(s=>({...s,[key]:e.target.value}))}/>)}<label className="sm:col-span-2"><input type="checkbox" checked={settings.production_after_payment===true} onChange={e=>setSettings(s=>({...s,production_after_payment:e.target.checked}))}/> Liberar novas produções somente após pagamento integral</label><button className={buttonClass} disabled={busy}>Salvar configurações</button></form>}
  </>}
 </div>;
}
