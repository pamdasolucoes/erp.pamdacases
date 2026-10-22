import React, { useEffect, useRef, useState } from 'react';
import type { OfficialCustomer } from '../../types/pamdaCore';
import { supabase } from '../../services/supabase';
import { authService } from '../../services/auth';
import { useCorePermission } from '../../hooks/useCorePermission';
import { billingCycles, collectionModes, CustomerNetworksService, filterNetworkUnits, type BillingPolicy, type NetworkCatalog, type NetworkReport } from '../../services/customerNetworks';
import { searchCustomers } from '../../services/customerMapping';

const service = new CustomerNetworksService(supabase);
const input = 'rounded-lg border border-slate-300 p-2 text-sm bg-white disabled:opacity-50';
const button = 'rounded-lg border border-blue-300 px-3 py-2 text-sm font-bold text-blue-800 disabled:opacity-50';
const emptyPolicy: BillingPolicy = { billing_cycle: null, default_collection_mode: null, due_days: null, notes: null };
const proposals = [
  { name: 'Cristal Cell', cycle: 'mensal', mode: 'centralizado', notes: 'Preferência mensal e centralizada.' },
  { name: 'Up Like', cycle: 'diario', mode: 'flexivel', notes: 'Pagador flexível, confirmar em cada ocasião.' },
  { name: 'MIXX Acessórios', cycle: 'diario', mode: 'flexivel', notes: 'Pagador a confirmar em cada ocasião.' },
  { name: 'PC Cel', cycle: 'semanal', mode: 'flexivel', notes: 'Admite variações no prazo; confirmar pagador e prazo em cada ocasião.' },
];
export function CustomerNetworksPanel({ customers, onOpen, onEdit }: { customers: readonly OfficialCustomer[]; onOpen: (c: OfficialCustomer) => void; onEdit: (c: OfficialCustomer) => void }) {
  const userId = authService.getCurrentUser()!.id;
  const manage = useCorePermission(userId, 'customers.manage');
  const finance = useCorePermission(userId, 'finance.read');
  const receive = useCorePermission(userId, 'finance.manage');
  const closingRequest=useRef({signature:'',key:''});
  const admin = manage.allowed && authService.getCurrentUser()?.role === 'admin_gerencial';
  const [catalog, setCatalog] = useState<NetworkCatalog>({ networks: [], members: [] });
  const [networkId, setNetworkId] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [message, setMessage] = useState('');
  const [name, setName] = useState(''), [code, setCode] = useState(''), [head, setHead] = useState(''), [kind, setKind] = useState('rede');
  const [search, setSearch] = useState(''), [checked, setChecked] = useState<string[]>([]);
  const [target, setTarget] = useState(''), [policy, setPolicy] = useState<BillingPolicy>(emptyPolicy), [policyReady, setPolicyReady] = useState(false), [confirmed, setConfirmed] = useState(false);
  const [start, setStart] = useState(''), [end, setEnd] = useState(''), [store, setStore] = useState(''), [branch, setBranch] = useState('');
  const [report, setReport] = useState<NetworkReport | null>(null);
  const [closing, setClosing] = useState('individual');
  const [creating, setCreating] = useState(false);
  const generation = useRef(0);
  const reload = async () => { setReady(false); const c = await service.catalog(userId); setCatalog(c); setReady(true); };
  useEffect(() => { let alive = true; void service.catalog(userId).then(c => { if (alive) { setCatalog(c); setReady(true); } }, e => { if (alive) setMessage(e.message); }); return () => { alive = false; generation.current++; }; }, [userId]);
  useEffect(() => { setChecked([]); setStore(''); setBranch(''); setReport(null); setTarget(''); generation.current++; }, [networkId]);
  useEffect(() => {
    let alive = true; setPolicyReady(false); setConfirmed(false); setPolicy(emptyPolicy);
    if (target) {
      const [scope, id] = target.split(':');
      void service.policy(userId, scope as 'rede' | 'cliente' | 'filial', id).then(p => { if (alive) { setPolicy(p ?? emptyPolicy); setPolicyReady(true); } }, e => { if (alive) setMessage(e.message); });
    }
    return () => { alive = false; };
  }, [target, userId, catalog]);
  const run = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage('');
    try { await action(); } catch (e) { setMessage(e instanceof Error ? e.message : 'Não foi possível concluir.'); }
    finally { lock.current = false; setBusy(false); }
  };
  const network = catalog.networks.find(n => n.id === networkId);
  const members = catalog.members.filter(m => m.network_id === networkId).sort((a,b) => a.unit_sequence - b.unit_sequence);
  const available = customers.filter(c => c.active && !catalog.members.some(m => m.customer_id === c.id));
  const candidates = searchCustomers(available, search);
  const changePolicy = (patch: Partial<BillingPolicy>) => { setPolicy(p => ({ ...p, ...patch })); setConfirmed(false); };
  const units = report ? filterNetworkUnits(report, store, branch) : [];
  const money = (v: number | null) => v === null ? 'Não disponível' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  return <section aria-label="Rede de lojas" className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
    <h2 className="text-lg font-bold">Rede de lojas</h2>
    <p className="text-sm text-slate-600">Agrupamento visual com cadastros e históricos preservados. Preferências de cobrança não bloqueiam vendas nem identificam automaticamente o pagador.</p>
    {message && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{message}</p>}
    {manage.error && <p role="alert">{manage.error}</p>}
    <div className="flex flex-wrap gap-3">
      <label>Rede <select aria-label="Selecionar rede" className={input} disabled={busy || !ready} value={networkId} onChange={e => setNetworkId(e.target.value)}><option value="">Selecione uma rede</option>{catalog.networks.map(n => <option key={n.id} value={n.id}>{n.network_code} · {n.network_name}</option>)}</select></label>
      <button className={button} disabled={busy} onClick={() => void run(reload)}>Atualizar redes</button>
    </div>
    {admin && <details onToggle={e => setCreating(e.currentTarget.open)}><summary className="cursor-pointer font-bold">Criar rede com cadastro principal</summary>
      {creating && <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); void run(async () => { const created = await service.create(userId, name, code, head, kind); await reload(); setNetworkId(created); setName(''); setCode(''); setHead(''); setMessage('Rede criada e cadastro principal confirmado.'); }); }}>
        <label>Nome <input required className={input} value={name} disabled={busy} onChange={e => setName(e.target.value)} /></label>
        <label>Código da rede <input required className={input} value={code} disabled={busy} onChange={e => setCode(e.target.value)} /></label>
        <label>Tipo <select className={input} value={kind} disabled={busy} onChange={e => setKind(e.target.value)}>{['rede','franquia','grupo_comercial'].map(v => <option key={v}>{v}</option>)}</select></label>
        <label>Cadastro principal <select required className={input} value={head} disabled={busy || !ready} onChange={e => setHead(e.target.value)}><option value="">Selecione explicitamente</option>{available.map(c => <option key={c.id} value={c.id}>{c.customerCode} · {c.name}</option>)}</select></label>
        <button disabled={busy || !ready} className={button}>Criar rede</button>
      </form>}
    </details>}
    {network && <>
      <p className="text-sm">Matriz da rede: {customers.find(c => c.id === network.headquarters_customer_id)?.name ?? network.headquarters_customer_id}</p>
      <ul className="divide-y">{members.map(m => { const c = customers.find(c => c.id === m.customer_id); return <li key={m.id} className="py-3 flex flex-wrap items-center gap-3">
        <span><strong>{c?.name ?? 'Cadastro indisponível'}</strong>{m.customer_id === network.headquarters_customer_id && ' · Matriz'}<br/><span className="text-sm">Código da rede: {m.display_code} · Histórico original: <span className="whitespace-pre-wrap font-mono">{m.legacy_customer_code}</span></span></span>
        {c && <><button className={button} onClick={() => onOpen(c)}>Consultar loja</button>{manage.allowed && <button className={button} onClick={() => onEdit(c)}>Editar loja</button>}</>}
      </li>; })}</ul>
      {admin && <details><summary className="cursor-pointer font-bold">Vincular clientes existentes</summary>
        <label className="block mt-3">Pesquisar clientes <input type="search" className={input} value={search} onChange={e => setSearch(e.target.value)} /></label>
        <div className="max-h-56 overflow-y-auto my-3">{candidates.map(c => <label key={c.id} className="block p-2"><input type="checkbox" disabled={busy || !ready} checked={checked.includes(c.id)} onChange={e => setChecked(ids => e.target.checked ? [...ids,c.id] : ids.filter(id => id !== c.id))} /> {c.customerCode} · {c.name}</label>)}</div>
        <p className="text-xs text-slate-500">Seleção manual. Cada vínculo é independente; em falha, confira os vínculos já confirmados.</p>
        <button className={button} disabled={busy || !ready || !checked.length} onClick={() => void run(async () => { try { await service.link(userId, networkId, checked); setMessage('Vínculos confirmados.'); } finally { setChecked([]); await reload(); } })}>Vincular {checked.length} cliente(s) à rede {network.network_name}</button>
      </details>}
      {manage.allowed && <fieldset disabled={busy} className="border rounded-xl p-3 space-y-3">
        <legend className="font-bold">Preferências de cobrança</legend>
        <label>Configurar <select className={input} value={target} onChange={e => setTarget(e.target.value)}><option value="">Selecione o destino</option>{admin && <option value={'rede:' + networkId}>Rede: {network.network_name}</option>}{members.flatMap(m => { const c = customers.find(c => c.id === m.customer_id); return c ? [<option key={c.id} value={'cliente:' + c.id}>Loja: {c.name}</option>, ...c.branches.map(b => <option key={b.id} value={'filial:' + b.id}>Unidade: {c.name} / {b.name}</option>)] : []; })}</select></label>
        {target && policyReady && <>
          <p className="text-xs">Prioridade por campo: unidade → cliente → rede. Prazo vazio herda o padrão. Nenhuma preferência define um pagamento.</p>
          <div className="flex flex-wrap gap-3">
            <label>Frequência <select className={input} value={policy.billing_cycle ?? ''} onChange={e => changePolicy({ billing_cycle: e.target.value || null })}><option value="">{target.startsWith('filial:') ? 'Herdar' : 'Selecione'}</option>{billingCycles.map(v => <option key={v}>{v}</option>)}</select></label>
            <label>Preferência de pagador <select className={input} value={policy.default_collection_mode ?? ''} onChange={e => changePolicy({ default_collection_mode: e.target.value || null })}><option value="">{target.startsWith('filial:') ? 'Herdar' : 'Selecione'}</option>{collectionModes.map(v => <option key={v}>{v}</option>)}</select></label>
            <label>Prazo em dias <input type="number" min="0" max="365" step="1" className={input} value={policy.due_days ?? ''} onChange={e => changePolicy({ due_days: e.target.value === '' ? null : Number(e.target.value) })}/></label>
          </div>
          <label className="block">Observações <textarea className={input + ' w-full'} value={policy.notes ?? ''} onChange={e => changePolicy({ notes: e.target.value || null })}/></label>
          {target.startsWith('rede:') && <label className="block">Proposta comercial (apenas preenche o formulário) <select className={input} value="" onChange={e => { const p = proposals.find(p => p.name === e.target.value); if (p) changePolicy({ billing_cycle: p.cycle, default_collection_mode: p.mode, notes: p.notes, due_days: null }); }}><option value="">Selecionar proposta para revisão</option>{proposals.map(p => <option key={p.name}>{p.name}</option>)}</select></label>}
          <label className="block text-sm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/> Revisei o destino e confirmo estas preferências para {target.startsWith('rede:') ? network.network_name : 'o cadastro selecionado'}.</label>
          <button className={button} disabled={!confirmed || target.startsWith('rede:') && !admin} onClick={() => void run(async () => { const [scope, targetId] = target.split(':'); await service.savePolicy(userId, scope as 'rede' | 'cliente' | 'filial', targetId, policy); setReport(null); await reload(); setMessage('Preferências confirmadas pelo servidor.'); })}>Salvar preferências</button>
        </>}
      </fieldset>}
      <form className="space-y-3" onSubmit={e => { e.preventDefault(); const g = ++generation.current; setReport(null); void run(async () => { const r = await service.report(userId, networkId, start, end); if (g === generation.current) setReport(r); }); }}>
        <h3 className="font-bold">Relatório por rede, loja e período</h3>
        <div className="flex flex-wrap gap-3">
          <label>Início <input required type="date" className={input} value={start} disabled={busy} onChange={e => { setStart(e.target.value); setReport(null); }}/></label>
          <label>Fim <input required type="date" className={input} value={end} disabled={busy} onChange={e => { setEnd(e.target.value); setReport(null); }}/></label>
          <label>Loja <select className={input} value={store} onChange={e => { setStore(e.target.value); setBranch(''); }}><option value="">Todas</option>{members.map(m => <option key={m.id} value={m.customer_id}>{m.display_code} · {customers.find(c => c.id === m.customer_id)?.name}</option>)}</select></label>
          <label>Unidade <select className={input} value={branch} onChange={e => setBranch(e.target.value)}><option value="">Todas</option>{customers.filter(c => members.some(m => m.customer_id === c.id) && (!store || c.id === store)).flatMap(c => c.branches.map(b => <option key={b.id} value={b.id}>{c.name} / {b.name}</option>))}</select></label>
          <button disabled={busy} className={button}>Consultar relatório</button>
        </div>
      </form>
      {report && <div className="overflow-x-auto"><table className="w-full text-sm mt-3"><thead><tr>{['Loja / unidade','Códigos rede / histórico','Preferências','Pedidos iniciados','Confirmados','Cancelados','Compras','Recebido / saldo'].map(s => <th className="text-left p-2" key={s}>{s}</th>)}</tr></thead><tbody>{units.map(u => <tr key={u.branch_id} className="border-t"><td className="p-2">{u.customer_name} / {u.branch_name}</td><td className="p-2 whitespace-pre-wrap">{u.group_display_code} / {u.legacy_customer_code}</td><td className="p-2">{u.billing_cycle} · {u.collection_mode} · {u.due_days === null ? 'Prazo não definido' : u.due_days + ' dias'}</td><td>{u.orders_started}</td><td>{u.orders_confirmed_real}</td><td>{u.orders_cancelled}</td><td>{finance.allowed && report.financial_authorized ? money(u.purchases_real) : 'Acesso financeiro restrito'}</td><td>{finance.allowed && report.financial_authorized && u.payments_integrated ? <>{money(u.paid_real)} / {money(u.purchases_real===null||u.paid_real===null?null:u.purchases_real-u.paid_real)}</> : 'Acesso financeiro restrito'}</td></tr>)}</tbody></table>{!units.length && <p>Nenhuma unidade encontrada para os filtros.</p>}</div>}
      <fieldset className="border rounded-xl p-3 space-y-2"><legend className="font-bold">Fechamentos e pagamentos</legend>
        <label>Modo de fechamento <select className={input} value={closing} onChange={e => setClosing(e.target.value)}><option value="individual">Individual por loja</option><option value="consolidado">Consolidado de vários pedidos</option></select></label>
        <p className="text-sm">{closing === 'individual' ? 'Cada compra mantém sua loja e documento original.' : 'O fechamento consolidado preserva pedidos e recibos originais.'} Os recebimentos são registrados em Contas a Receber e atualizam os saldos do fechamento.</p>
        <button className={button} disabled={busy||!receive.allowed||!report||!report.financial_authorized} onClick={()=>void run(async()=>{const signature=JSON.stringify([networkId,start,end,closing,store,branch]);if(closingRequest.current.signature!==signature)closingRequest.current={signature,key:crypto.randomUUID()};await service.close(userId,networkId,start,end,closing,store,branch,closingRequest.current.key);closingRequest.current={signature:'',key:''};setReport(await service.report(userId,networkId,start,end));setMessage('Fechamento gerado. Consulte os documentos em Fechamentos e registre recebimentos em Contas a Receber.');})}>{closing === 'individual' ? 'Fechar por loja' : 'Gerar documento consolidado'}</button>
      </fieldset>
    </>}
  </section>;
}
