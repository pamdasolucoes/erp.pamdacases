import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Search, RefreshCw, MapPin, AlertTriangle, Pencil, History, ShoppingCart } from 'lucide-react';
import type { OfficialCustomer, CustomerContext } from '../../types/pamdaCore';
import { searchCustomers } from '../../services/customerMapping';
import { useCustomers } from '../../hooks/useCustomers';
import { authService } from '../../services/auth';
import { useCorePermission } from '../../hooks/useCorePermission';
import { CustomerCommercialPanel } from './CustomerCommercialPanel';
import { CustomerEditModal } from './CustomerEditModal';
import { CustomerRegistrationModal } from './CustomerRegistrationModal';
import { customerAdminService } from '../../services/customerAdminService';
import type { OfficialCustomerBranch } from '../../types/pamdaCore';
import { useProgressiveRows } from '../../hooks/useProgressiveRows';
import { CustomerNetworksPanel } from './CustomerNetworksPanel';

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return <div><dt className="text-[11px] font-bold uppercase text-slate-400">{label}</dt><dd className="mt-1 text-sm text-slate-800 break-words whitespace-pre-wrap">{value || 'Não informado'}</dd></div>;
}
function dateLabel(value: string | null, original: string | null): string | null {
  if (!value) return original;
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

interface CustomersViewProps {
  initialCustomerId?: string;
  onSelectCustomer?: (customer: CustomerContext) => void;
  onNewSale: (customer: CustomerContext) => void;
  onConsultSales: (customer: CustomerContext) => void;
}
export const CustomersView: React.FC<CustomersViewProps> = ({ initialCustomerId, onSelectCustomer, onNewSale, onConsultSales }) => {
  const { customers, loading, refreshing, error, reload } = useCustomers();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(initialCustomerId || '');
  const [editing, setEditing] = useState<OfficialCustomer | null>(null);
  const [notice, setNotice] = useState('');
  const [registration, setRegistration] = useState<{ customer?: OfficialCustomer; branch?: OfficialCustomerBranch } | null>(null);
  const [primaryBusy, setPrimaryBusy] = useState(false);
  const manage = useCorePermission(authService.getCurrentUser()!.id, 'customers.manage');
  const canEdit = manage.allowed;
  const canAdmin = canEdit && authService.getCurrentUser()!.role === 'admin_gerencial';
  const saved = (updated: OfficialCustomer) => { setSelectedId(updated.id); setQuery(''); setRegistration(null); setNotice(registration?.customer && !registration.branch ? 'Filial cadastrada com sucesso' : 'Cadastro confirmado pelo PAMDA CORE.'); };

  const filtered = useMemo(() => searchCustomers(customers, query), [customers, query]);
  const list = useProgressiveRows(filtered, query);
  const selected = filtered.find(customer => customer.id === selectedId) || filtered[0];
  useEffect(() => {
    if (selected) onSelectCustomer?.({ id: selected.id, customerCode: selected.customerCode });
  }, [selected?.id, selected?.customerCode, onSelectCustomer]);
  const { units, reviews } = useMemo(() => ({ units: customers.reduce((count, customer) => count + customer.branches.length, 0), reviews: customers.reduce((count, customer) => count + customer.branches.filter(unit => unit.addressNeedsReview).length, 0) }), [customers]);
  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row justify-between gap-3 sm:items-center">
        <div><h1 className="text-2xl font-black text-slate-900">Clientes e Unidades</h1><p className="text-sm text-slate-500">Cadastro oficial PAMDA CORE · Consulta</p></div>
        <div className="flex gap-2">{canAdmin && <button onClick={() => setRegistration({})} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white">Novo cliente</button>}<button disabled={loading} onClick={reload} className="inline-flex justify-center items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold bg-white disabled:opacity-50"><RefreshCw className="w-4 h-4" />Atualizar lista</button></div>
      </div>
      {refreshing && <p role="status" className="text-xs text-slate-500">Atualizando clientes e unidades...</p>}
      {loading ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-8 text-slate-600">Carregando clientes e unidades...</p> : error ? (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800"><p>{error}</p><button onClick={reload} className="mt-3 font-bold underline">Tentar novamente</button></div>
      ) : (
        <>
          {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
          <CustomerNetworksPanel customers={customers} onOpen={customer => { setQuery(''); setSelectedId(customer.id); }} onEdit={customer => { setNotice(''); setEditing(customer); }} />
          <div className="flex flex-wrap gap-3 text-xs text-slate-600" aria-live="polite"><span>{customers.length} clientes acessíveis</span><span>{units} unidades</span><span className="text-amber-800">{reviews} endereços sinalizados para revisão</span></div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">As condições comerciais são consultadas no cadastro oficial de cada cliente e unidade. Não agrupe cadastros sem conferência.</div>
          {manage.error&&<p role="alert" className="text-sm text-amber-800">{manage.error} A edição permanece indisponível até validar a permissão.</p>}
          <label className="block text-sm font-bold text-slate-700">Pesquisar por código comercial, nome ou documento
            <div className="relative mt-2"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Código, nome, razão social ou CPF/CNPJ" className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm font-normal" /></div>
          </label>
          {!customers.length ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Nenhum cliente foi retornado. Se esta conta deveria ver os 384 clientes oficiais, confira o GRANT SELECT e as políticas RLS de customers e customer_branches.</p> : !filtered.length ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Nenhum cliente encontrado para esta pesquisa.</p> : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <section aria-label="Lista de clientes" className="lg:col-span-4 rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <p className="p-4 border-b border-slate-100 text-xs font-bold text-slate-500">{filtered.length} de {customers.length} clientes</p>
                <div className="max-h-[650px] overflow-y-auto divide-y divide-slate-100">{list.visible.map(customer => (
                  <button key={customer.id} data-testid={`customer-row-${customer.id}`} onClick={() => setSelectedId(customer.id)} aria-pressed={customer.id === selected?.id} className={`block w-full p-4 text-left border-l-4 ${customer.id === selected?.id ? 'border-blue-600 bg-blue-50' : 'border-transparent hover:bg-slate-50'}`}>
                    <span className="block font-mono text-xs font-bold text-blue-700 whitespace-pre-wrap">{customer.customerCode}</span>
                    <span className="block mt-1 text-sm font-bold text-slate-900">{customer.name}</span>
                    <span className="block mt-1 text-xs text-slate-500">{customer.branches.length} unidade(s) · {customer.active ? 'Ativo' : 'Inativo'}</span>
                  </button>
                ))}</div>
                {list.hasMore && <button type="button" onClick={list.showMore} className="w-full p-3 text-xs font-bold text-blue-700 border-t">Mostrar mais clientes ({list.visible.length} de {filtered.length})</button>}
              </section>
              {selected && <article className="lg:col-span-8 space-y-5">
                <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
                  <div className="flex items-start gap-3"><Building2 className="w-7 h-7 text-blue-600 shrink-0" /><div><h2 className="text-xl font-bold text-slate-900">{selected.name}</h2><p className="text-xs text-slate-500 mt-1">{selected.active ? 'Cadastro ativo' : 'Cadastro inativo'}</p></div></div>
                  <div role="group" aria-label="Ações do cliente" className="mt-5 flex flex-col sm:flex-row sm:flex-wrap gap-2">
                    <button disabled={!canEdit} title={canEdit ? 'Editar cadastro' : 'Seu perfil não tem permissão de edição'} onClick={() => { setNotice(''); setEditing(selected); }} className="inline-flex justify-center items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50"><Pencil className="h-4 w-4" />Editar cadastro</button>
                    {canAdmin && <button onClick={() => { setNotice(''); setRegistration({ customer: selected }); }} className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white">+ Adicionar filial</button>}
                    <button onClick={() => onConsultSales({ id: selected.id, customerCode: selected.customerCode })} className="inline-flex justify-center items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700"><History className="h-4 w-4" />CONSULTAR VENDAS</button>
                    <button onClick={() => onNewSale({ id: selected.id, customerCode: selected.customerCode })} className="inline-flex justify-center items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"><ShoppingCart className="h-4 w-4" />+ NOVA VENDA</button>
                  </div>
                  <label className="block mt-5 text-xs font-bold uppercase text-slate-500">Código comercial<input readOnly value={selected.customerCode} className="block w-full mt-1 rounded-lg border border-slate-200 bg-slate-50 p-2.5 font-mono text-base text-slate-900" /></label>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
                    <Field label="Razão social" value={selected.companyName} /><Field label="CNPJ" value={selected.cnpj} /><Field label="CPF" value={selected.cpf} /><Field label="Documento original" value={selected.cpfCnpjOriginal} /><Field label="Inscrição estadual" value={selected.stateRegistration} /><Field label="Tipo de pessoa original" value={selected.legacyPersonType} />
                    <Field label="Contato" value={selected.contactName} /><Field label="Telefone" value={selected.phone} /><Field label="Celular" value={selected.mobilePhone} /><Field label="WhatsApp" value={selected.whatsappPhone} /><Field label="E-mail" value={selected.email} /><Field label="Referência" value={selected.referenceName} /><Field label="Telefone da referência" value={selected.referencePhone} />
                    <Field label="Cadastro no sistema anterior" value={dateLabel(selected.legacyRegisteredOn, selected.legacyRegisteredRaw)} /><Field label="Última compra no sistema anterior" value={dateLabel(selected.legacyLastPurchaseOn, selected.legacyLastPurchaseRaw)} />
                  </dl>
                  <CustomerCommercialPanel key={selected.id} customer={selected}/>
                  <dl className="mt-4 space-y-4"><Field label="Observações" value={selected.notes} /></dl>
                </section>
                <section aria-label="Unidades cadastradas" className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 space-y-4">
                  <h3 className="font-bold text-slate-900">Unidades cadastradas ({selected.branches.length})</h3>
                  {canAdmin && <button onClick={() => { setNotice(''); setRegistration({ customer: selected }); }} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold">+ Adicionar filial</button>}
                  {!selected.branches.length && <p className="text-sm text-slate-500">Nenhuma unidade disponível para este cliente.</p>}
                  {selected.branches.map(branch => <div key={branch.id} className="rounded-xl border border-slate-200 p-4 space-y-4">
                    <div className="flex flex-wrap items-center gap-2"><MapPin className="w-4 h-4 text-slate-400" /><h4 className="text-sm font-bold">{branch.name}</h4>{branch.isPrimary&&<span className="text-xs font-bold text-blue-700">Matriz</span>}<span className="text-xs text-slate-500">{branch.active ? 'Ativa' : 'Inativa'}</span></div>
                    {canAdmin && <div className="flex gap-3 text-xs font-bold"><button disabled={primaryBusy} onClick={() => setRegistration({ customer: selected, branch })} className="underline">Editar unidade</button>{branch.active && !branch.isPrimary && <button disabled={primaryBusy} className="underline text-blue-700" onClick={async () => {
                      if (!window.confirm(`Definir ${branch.name} como matriz de ${selected.name}? A matriz atual será substituída.`)) return;
                      setPrimaryBusy(true);
                      try { saved(await customerAdminService.setPrimary(authService.getCurrentUser()!.id, selected, branch.id)); }
                      catch (error) { setNotice(error instanceof Error ? error.message : 'Não foi possível confirmar a matriz.'); }
                      finally { setPrimaryBusy(false); }
                    }}>Definir matriz</button>}</div>}
                    {branch.addressNeedsReview && <p className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs font-semibold text-amber-900"><AlertTriangle className="w-4 h-4 shrink-0" />Endereço sinalizado para revisão. Confirme antes de entregar.</p>}
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4"><Field label="Nome fantasia" value={branch.tradeName} /><Field label="Endereço" value={branch.address} /><Field label="Número" value={branch.number} /><Field label="Complemento" value={branch.complement} /><Field label="Bairro" value={branch.neighborhood} /><Field label="Cidade" value={branch.city} /><Field label="Estado" value={branch.state} /><Field label="CEP" value={branch.zipCode} /><Field label="Telefone" value={branch.phone} /><Field label="Contato" value={branch.contactName} /><Field label="Código da importação" value={branch.importSourceCustomerCode} /><Field label="Observações da unidade" value={branch.notes} /></dl>
                  </div>)}
                </section>
              </article>}
            </div>
          )}
        </>
      )}
      {editing && <CustomerEditModal key={editing.id + editing.updatedAt} customer={editing} onClose={() => setEditing(null)} onSaved={updated => { setSelectedId(updated.id); setEditing(null); setNotice('Cadastro atualizado e confirmado pelo PAMDA CORE.'); }} />}
      {registration && <CustomerRegistrationModal {...registration} onClose={review => { setRegistration(null); if (review) reload(); }} onSaved={saved} />}
    </div>
  );
};
