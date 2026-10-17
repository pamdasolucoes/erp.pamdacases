import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Search, RefreshCw, MapPin, AlertTriangle, Pencil, History, ShoppingCart } from 'lucide-react';
import type { OfficialCustomer, CustomerContext } from '../../types/pamdaCore';
import { searchCustomers } from '../../services/customerMapping';
import { useCustomers } from '../../hooks/useCustomers';
import { authService } from '../../services/auth';
import { canEditCustomers } from '../../services/customerEdits';
import { CustomerEditModal } from './CustomerEditModal';
import { customerFreightLabel } from '../../services/freight';

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
  const { customers, loading, error, reload, acceptUpdated } = useCustomers();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(initialCustomerId || '');
  const [editing, setEditing] = useState<OfficialCustomer | null>(null);
  const [notice, setNotice] = useState('');
  const canEdit = canEditCustomers(authService.getCurrentUser());

  const filtered = useMemo(() => searchCustomers(customers, query), [customers, query]);
  const selected = filtered.find(customer => customer.id === selectedId) || filtered[0];
  useEffect(() => {
    if (selected) onSelectCustomer?.({ id: selected.id, customerCode: selected.customerCode });
  }, [selected?.id, selected?.customerCode, onSelectCustomer]);
  const units = customers.flatMap(customer => [...customer.branches]);
  const reviews = units.filter(unit => unit.addressNeedsReview).length;
  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row justify-between gap-3 sm:items-center">
        <div><h1 className="text-2xl font-black text-slate-900">Clientes e Unidades</h1><p className="text-sm text-slate-500">Cadastro oficial PAMDA CORE · Consulta</p></div>
        <button disabled={loading} onClick={reload} className="inline-flex justify-center items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold bg-white disabled:opacity-50"><RefreshCw className="w-4 h-4" />Atualizar lista</button>
      </div>
      {loading ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-8 text-slate-600">Carregando clientes e unidades...</p> : error ? (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800"><p>{error}</p><button onClick={reload} className="mt-3 font-bold underline">Tentar novamente</button></div>
      ) : (
        <>
          {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
          <div className="flex flex-wrap gap-3 text-xs text-slate-600" aria-live="polite"><span>{customers.length} clientes acessíveis</span><span>{units.length} unidades</span><span className="text-amber-800">{reviews} endereços sinalizados para revisão</span></div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Condição de pagamento não configurada. As unidades iniciais ainda aguardam conferência para classificação de redes e filiais.</div>
          <label className="block text-sm font-bold text-slate-700">Pesquisar por código comercial, nome ou documento
            <div className="relative mt-2"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Código, nome, razão social ou CPF/CNPJ" className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm font-normal" /></div>
          </label>
          {!customers.length ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Nenhum cliente foi retornado. Se esta conta deveria ver os 384 clientes oficiais, confira o GRANT SELECT e as políticas RLS de customers e customer_branches.</p> : !filtered.length ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Nenhum cliente encontrado para esta pesquisa.</p> : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <section aria-label="Lista de clientes" className="lg:col-span-4 rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <p className="p-4 border-b border-slate-100 text-xs font-bold text-slate-500">{filtered.length} de {customers.length} clientes</p>
                <div className="max-h-[650px] overflow-y-auto divide-y divide-slate-100">{filtered.map(customer => (
                  <button key={customer.id} onClick={() => setSelectedId(customer.id)} aria-pressed={customer.id === selected?.id} className={`block w-full p-4 text-left border-l-4 ${customer.id === selected?.id ? 'border-blue-600 bg-blue-50' : 'border-transparent hover:bg-slate-50'}`}>
                    <span className="block font-mono text-xs font-bold text-blue-700 whitespace-pre-wrap">{customer.customerCode}</span>
                    <span className="block mt-1 text-sm font-bold text-slate-900">{customer.name}</span>
                    <span className="block mt-1 text-xs text-slate-500">{customer.branches.length} unidade(s) · {customer.active ? 'Ativo' : 'Inativo'}</span>
                  </button>
                ))}</div>
              </section>
              {selected && <article className="lg:col-span-8 space-y-5">
                <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
                  <div className="flex items-start gap-3"><Building2 className="w-7 h-7 text-blue-600 shrink-0" /><div><h2 className="text-xl font-bold text-slate-900">{selected.name}</h2><p className="text-xs text-slate-500 mt-1">{selected.active ? 'Cadastro ativo' : 'Cadastro inativo'}</p></div></div>
                  <div className="mt-5 flex flex-col sm:flex-row sm:flex-wrap gap-2">
                    <button disabled={!canEdit} title={canEdit ? 'Editar cadastro' : 'Seu perfil não tem permissão de edição'} onClick={() => { setNotice(''); setEditing(selected); }} className="inline-flex justify-center items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50"><Pencil className="h-4 w-4" />EDITAR</button>
                    <button onClick={() => onConsultSales({ id: selected.id, customerCode: selected.customerCode })} className="inline-flex justify-center items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700"><History className="h-4 w-4" />CONSULTAR VENDAS</button>
                    <button onClick={() => onNewSale({ id: selected.id, customerCode: selected.customerCode })} className="inline-flex justify-center items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"><ShoppingCart className="h-4 w-4" />+ NOVA VENDA</button>
                  </div>
                  <label className="block mt-5 text-xs font-bold uppercase text-slate-500">Código comercial<input readOnly value={selected.customerCode} className="block w-full mt-1 rounded-lg border border-slate-200 bg-slate-50 p-2.5 font-mono text-base text-slate-900" /></label>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
                    <Field label="Razão social" value={selected.companyName} /><Field label="CNPJ" value={selected.cnpj} /><Field label="CPF" value={selected.cpf} /><Field label="Documento original" value={selected.cpfCnpjOriginal} /><Field label="Inscrição estadual" value={selected.stateRegistration} /><Field label="Tipo de pessoa original" value={selected.legacyPersonType} />
                    <Field label="Contato" value={selected.contactName} /><Field label="Telefone" value={selected.phone} /><Field label="Celular" value={selected.mobilePhone} /><Field label="WhatsApp" value={selected.whatsappPhone} /><Field label="E-mail" value={selected.email} /><Field label="Referência" value={selected.referenceName} /><Field label="Telefone da referência" value={selected.referencePhone} />
                    <Field label="Cadastro no sistema anterior" value={dateLabel(selected.legacyRegisteredOn, selected.legacyRegisteredRaw)} /><Field label="Última compra no sistema anterior" value={dateLabel(selected.legacyLastPurchaseOn, selected.legacyLastPurchaseRaw)} />
                  </dl>
                  <div className="mt-5 border-t border-slate-100 pt-4"><h3 className="text-sm font-bold">Condição de pagamento não configurada</h3><p className="text-xs text-slate-500 mt-1">Prazo e limite de crédito ainda não definidos.</p></div>
                  <dl className="mt-4 space-y-4"><Field label="Frete padrão (R$)" value={customerFreightLabel(selected.defaultFreight)} /><Field label="Observações" value={selected.notes} /></dl>
                </section>
                <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 space-y-4">
                  <h3 className="font-bold text-slate-900">Unidades cadastradas ({selected.branches.length})</h3>
                  {!selected.branches.length && <p className="text-sm text-slate-500">Nenhuma unidade disponível para este cliente.</p>}
                  {selected.branches.map(branch => <div key={branch.id} className="rounded-xl border border-slate-200 p-4 space-y-4">
                    <div className="flex flex-wrap items-center gap-2"><MapPin className="w-4 h-4 text-slate-400" /><h4 className="text-sm font-bold">{branch.name}</h4><span className="text-xs text-slate-500">{branch.active ? 'Ativa' : 'Inativa'}</span></div>
                    {branch.addressNeedsReview && <p className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs font-semibold text-amber-900"><AlertTriangle className="w-4 h-4 shrink-0" />Endereço sinalizado para revisão. Confirme antes de entregar.</p>}
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4"><Field label="Nome fantasia" value={branch.tradeName} /><Field label="Endereço" value={branch.address} /><Field label="Número" value={branch.number} /><Field label="Complemento" value={branch.complement} /><Field label="Bairro" value={branch.neighborhood} /><Field label="Cidade" value={branch.city} /><Field label="Estado" value={branch.state} /><Field label="CEP" value={branch.zipCode} /><Field label="Telefone" value={branch.phone} /><Field label="Contato" value={branch.contactName} /><Field label="Código da importação" value={branch.importSourceCustomerCode} /><Field label="Observações da unidade" value={branch.notes} /></dl>
                  </div>)}
                </section>
              </article>}
            </div>
          )}
        </>
      )}
      {editing && <CustomerEditModal key={editing.id + editing.updatedAt} customer={editing} onClose={() => setEditing(null)} onSaved={updated => { acceptUpdated(updated); setSelectedId(updated.id); setEditing(null); setNotice('Cadastro atualizado e confirmado pelo PAMDA CORE.'); }} />}
    </div>
  );
};
