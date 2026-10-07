import React, { useState } from 'react';
import {
  Users,
  Plus,
  Edit2,
  Building2,
  MapPin,
  Phone,
  Mail,
  CreditCard,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  ChevronRight,
  Save,
} from 'lucide-react';
import { Customer, CustomerBranch, CustomerPaymentPolicy, PaymentPolicyType } from '../../types/erp';
import { dbService } from '../../services/db';
import { Modal } from '../../components/common/Modal';
import { Badge } from '../../components/common/Badge';

export const CustomersView: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>(dbService.getCustomers());
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    customers[0]?.id || ''
  );
  const [activeTab, setActiveTab] = useState<'filiais' | 'politica' | 'observacoes'>('filiais');

  // Modais
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<CustomerBranch | null>(null);

  // Form states - Customer
  const [custForm, setCustForm] = useState({
    name: '',
    companyName: '',
    cnpj: '',
    phone: '',
    email: '',
    contactName: '',
    notes: '',
    isChain: true,
    billingMode: 'consolidado' as Customer['billingMode'],
    // Payment policy defaults
    policyType: 'pagamento_entrega' as PaymentPolicyType,
    produceOnlyAfterPayment: false,
    closingFrequency: 'none' as CustomerPaymentPolicy['closingFrequency'],
    closingDay: 5,
    paymentTermDays: 7,
    creditLimit: 5000,
    allowNewOrdersWithOverdue: true,
    autoBlockOnOverdue: false,
    showPixOnPendingReceipts: true,
  });

  // Form states - Branch
  const [branchForm, setBranchForm] = useState({
    name: '',
    tradeName: '',
    address: '',
    neighborhood: '',
    city: 'Curitiba',
    state: 'PR',
    zipCode: '',
    phone: '',
    contactName: '',
    notes: '',
    active: true,
  });

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId) || customers[0];

  const refreshCustomers = () => {
    setCustomers(dbService.getCustomers());
  };

  const handleOpenNewCustomer = () => {
    setEditingCustomer(null);
    setCustForm({
      name: '',
      companyName: '',
      cnpj: '',
      phone: '',
      email: '',
      contactName: '',
      notes: '',
      isChain: true,
      billingMode: 'consolidado',
      policyType: 'pagamento_entrega',
      produceOnlyAfterPayment: false,
      closingFrequency: 'weekly',
      closingDay: 5,
      paymentTermDays: 7,
      creditLimit: 10000,
      allowNewOrdersWithOverdue: true,
      autoBlockOnOverdue: false,
      showPixOnPendingReceipts: true,
    });
    setIsCustomerModalOpen(true);
  };

  const handleOpenEditCustomer = (cust: Customer) => {
    setEditingCustomer(cust);
    setCustForm({
      name: cust.name,
      companyName: cust.companyName || '',
      cnpj: cust.cnpj || '',
      phone: cust.phone,
      email: cust.email || '',
      contactName: cust.contactName,
      notes: cust.notes || '',
      isChain: cust.isChain,
      billingMode: cust.billingMode,
      policyType: cust.paymentPolicy.policyType,
      produceOnlyAfterPayment: cust.paymentPolicy.produceOnlyAfterPayment,
      closingFrequency: cust.paymentPolicy.closingFrequency,
      closingDay: cust.paymentPolicy.closingDay || 5,
      paymentTermDays: cust.paymentPolicy.paymentTermDays,
      creditLimit: cust.paymentPolicy.creditLimit,
      allowNewOrdersWithOverdue: cust.paymentPolicy.allowNewOrdersWithOverdue,
      autoBlockOnOverdue: cust.paymentPolicy.autoBlockOnOverdue,
      showPixOnPendingReceipts: cust.paymentPolicy.showPixOnPendingReceipts,
    });
    setIsCustomerModalOpen(true);
  };

  const handleSaveCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!custForm.name.trim() || !custForm.phone.trim()) {
      alert('Nome e Telefone são obrigatórios.');
      return;
    }

    const payload = {
      name: custForm.name.trim(),
      companyName: custForm.companyName.trim() || undefined,
      cnpj: custForm.cnpj.trim() || undefined,
      phone: custForm.phone.trim(),
      email: custForm.email.trim() || undefined,
      contactName: custForm.contactName.trim() || custForm.name.trim(),
      notes: custForm.notes.trim() || undefined,
      active: true,
      isChain: custForm.isChain,
      billingMode: custForm.billingMode,
      paymentPolicy: {
        policyType: custForm.policyType,
        produceOnlyAfterPayment: custForm.produceOnlyAfterPayment,
        closingFrequency: custForm.closingFrequency,
        closingDay: Number(custForm.closingDay),
        paymentTermDays: Number(custForm.paymentTermDays),
        creditLimit: Number(custForm.creditLimit),
        allowNewOrdersWithOverdue: custForm.allowNewOrdersWithOverdue,
        autoBlockOnOverdue: custForm.autoBlockOnOverdue,
        showPixOnPendingReceipts: custForm.showPixOnPendingReceipts,
      },
      branches: editingCustomer ? editingCustomer.branches : [],
    };

    if (editingCustomer) {
      dbService.saveCustomer({ ...payload, id: editingCustomer.id });
    } else {
      const created = dbService.saveCustomer(payload);
      setSelectedCustomerId(created.id);
    }

    refreshCustomers();
    setIsCustomerModalOpen(false);
  };

  const handleOpenNewBranch = () => {
    if (!selectedCustomer) return;
    setEditingBranch(null);
    setBranchForm({
      name: '',
      tradeName: '',
      address: '',
      neighborhood: '',
      city: 'Curitiba',
      state: 'PR',
      zipCode: '',
      phone: selectedCustomer.phone,
      contactName: selectedCustomer.contactName,
      notes: '',
      active: true,
    });
    setIsBranchModalOpen(true);
  };

  const handleSaveBranch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    if (!branchForm.name.trim() || !branchForm.address.trim()) {
      alert('Nome da filial e Endereço são obrigatórios.');
      return;
    }

    if (editingBranch) {
      dbService.updateBranch(selectedCustomer.id, editingBranch.id, branchForm);
    } else {
      dbService.addBranch(selectedCustomer.id, branchForm);
    }

    refreshCustomers();
    setIsBranchModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Clientes, Redes e Filiais
          </h1>
          <p className="text-xs text-slate-500">
            Cadastro mestre de redes B2B, matrizes e filiais com políticas comerciais
          </p>
        </div>
        <button
          onClick={handleOpenNewCustomer}
          className="flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Novo Cliente</span>
        </button>
      </div>

      {/* Main Grid: Left selector, Right details (Screens 3) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Customer List Selection */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 bg-slate-50/60">
            <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Clientes Cadastrados ({customers.length})
            </h2>
          </div>
          <div className="divide-y divide-slate-100 overflow-y-auto max-h-[600px]">
            {customers.map((c) => {
              const isSelected = c.id === selectedCustomerId;
              return (
                <div
                  key={c.id}
                  onClick={() => setSelectedCustomerId(c.id)}
                  className={`p-4 flex items-center justify-between cursor-pointer transition-colors ${
                    isSelected ? 'bg-blue-50/80 border-l-4 border-blue-600' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900 truncate">
                        {c.name}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          c.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {c.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                      {c.cnpj || c.companyName || 'Sem CNPJ informado'}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {c.branches.length > 0
                        ? `${c.branches.length} filial(is) cadastradas`
                        : 'Cliente avulso (sem filiais)'}
                    </p>
                  </div>
                  <ChevronRight
                    className={`w-4 h-4 transition-transform ${
                      isSelected ? 'text-blue-600 translate-x-1' : 'text-slate-300'
                    }`}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Selected Customer / Chain Details (Screen 3) */}
        {selectedCustomer ? (
          <div className="lg:col-span-8 space-y-5">
            {/* Customer Profile Card */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center font-black text-xl shadow-xs">
                    <Building2 className="w-7 h-7" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-black text-slate-900">
                        {selectedCustomer.name}
                      </h2>
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          selectedCustomer.active
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {selectedCustomer.active ? 'Ativo' : 'Inativo'}
                      </span>
                      {selectedCustomer.isChain && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                          Rede B2B
                        </span>
                      )}
                    </div>
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-slate-600">
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">CNPJ:</span>
                        <span className="font-mono">{selectedCustomer.cnpj || 'Não informado'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Telefone:</span>
                        <span>{selectedCustomer.phone}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Contato:</span>
                        <span className="font-semibold text-slate-900">{selectedCustomer.contactName}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleOpenEditCustomer(selectedCustomer)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer self-start"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Editar</span>
                </button>
              </div>

              {/* Tabs */}
              <div className="mt-6 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <button
                    onClick={() => setActiveTab('filiais')}
                    className={`pb-3 text-xs font-bold border-b-2 cursor-pointer transition-colors ${
                      activeTab === 'filiais'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Filiais ({selectedCustomer.branches.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('politica')}
                    className={`pb-3 text-xs font-bold border-b-2 cursor-pointer transition-colors ${
                      activeTab === 'politica'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Condição de Pagamento
                  </button>
                  <button
                    onClick={() => setActiveTab('observacoes')}
                    className={`pb-3 text-xs font-bold border-b-2 cursor-pointer transition-colors ${
                      activeTab === 'observacoes'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Observações
                  </button>
                </div>

                {activeTab === 'filiais' && (
                  <button
                    onClick={handleOpenNewBranch}
                    className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer mb-2"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Nova Filial</span>
                  </button>
                )}
              </div>

              {/* Tab Content: Filiais */}
              {activeTab === 'filiais' && (
                <div className="pt-4">
                  {selectedCustomer.branches.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-xs">
                      Este cliente não possui filiais cadastradas. As vendas usam o endereço principal da matriz.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 text-slate-400 uppercase text-[11px] font-bold">
                            <th className="py-2.5">Nome da Filial</th>
                            <th className="py-2.5">Endereço</th>
                            <th className="py-2.5">Telefone</th>
                            <th className="py-2.5 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          {selectedCustomer.branches.map((b) => (
                            <tr key={b.id} className="hover:bg-slate-50/80">
                              <td className="py-3 font-bold text-slate-900">
                                {b.name}
                                {b.tradeName && (
                                  <span className="block text-[11px] font-normal text-slate-400">
                                    {b.tradeName}
                                  </span>
                                )}
                              </td>
                              <td className="py-3 text-slate-600">
                                {b.address}, {b.neighborhood} - {b.city}/{b.state}
                                {b.zipCode && ` (CEP: ${b.zipCode})`}
                              </td>
                              <td className="py-3 font-mono">{b.phone}</td>
                              <td className="py-3 text-center">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                    b.active
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-slate-100 text-slate-600'
                                  }`}
                                >
                                  {b.active ? 'Ativa' : 'Inativa'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Tab Content: Condição de Pagamento */}
              {activeTab === 'politica' && (
                <div className="pt-4 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                      <p className="text-[11px] font-bold text-slate-400 uppercase">
                        Política Comercial Principal
                      </p>
                      <p className="text-base font-black text-blue-700 capitalize">
                        {selectedCustomer.paymentPolicy.policyType.replace('_', ' ')}
                      </p>
                      <div className="space-y-1 text-slate-600 pt-1">
                        <p>
                          Faturamento:{' '}
                          <strong className="text-slate-900 uppercase">
                            {selectedCustomer.billingMode}
                          </strong>
                        </p>
                        <p>
                          Prazo de Pagamento:{' '}
                          <strong className="text-slate-900">
                            {selectedCustomer.paymentPolicy.paymentTermDays} dias
                          </strong>
                        </p>
                        <p>
                          Limite de Crédito:{' '}
                          <strong className="text-slate-900 font-mono">
                            R$ {selectedCustomer.paymentPolicy.creditLimit.toFixed(2)}
                          </strong>
                        </p>
                      </div>
                    </div>

                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                      <p className="text-[11px] font-bold text-slate-400 uppercase">
                        Regras de Liberação & Bloqueio
                      </p>
                      <div className="space-y-2 pt-1 text-slate-700">
                        <div className="flex items-center gap-2">
                          {selectedCustomer.paymentPolicy.produceOnlyAfterPayment ? (
                            <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0" />
                          ) : (
                            <XCircle className="w-4 h-4 text-slate-400 shrink-0" />
                          )}
                          <span>
                            Produzir somente após pagamento:{' '}
                            <strong>
                              {selectedCustomer.paymentPolicy.produceOnlyAfterPayment ? 'SIM' : 'NÃO'}
                            </strong>
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {selectedCustomer.paymentPolicy.allowNewOrdersWithOverdue ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          ) : (
                            <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                          )}
                          <span>
                            Permitir novos pedidos com saldo vencido:{' '}
                            <strong>
                              {selectedCustomer.paymentPolicy.allowNewOrdersWithOverdue ? 'SIM' : 'NÃO'}
                            </strong>
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {selectedCustomer.paymentPolicy.showPixOnPendingReceipts ? (
                            <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                          ) : (
                            <XCircle className="w-4 h-4 text-slate-400 shrink-0" />
                          )}
                          <span>
                            Exibir Pix em recibos pendentes:{' '}
                            <strong>
                              {selectedCustomer.paymentPolicy.showPixOnPendingReceipts ? 'SIM' : 'NÃO'}
                            </strong>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {selectedCustomer.paymentPolicy.financialNotes && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs">
                      <strong>Observações Financeiras:</strong>{' '}
                      {selectedCustomer.paymentPolicy.financialNotes}
                    </div>
                  )}
                </div>
              )}

              {/* Tab Content: Observações */}
              {activeTab === 'observacoes' && (
                <div className="pt-4 text-xs text-slate-600 bg-slate-50 p-4 rounded-xl border border-slate-200">
                  {selectedCustomer.notes || 'Nenhuma observação interna registrada.'}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* Modal: Novo/Editar Cliente */}
      <Modal
        isOpen={isCustomerModalOpen}
        onClose={() => setIsCustomerModalOpen(false)}
        title={editingCustomer ? 'Editar Cliente / Rede' : 'Novo Cliente / Rede'}
        subtitle="Cadastre os dados principais e a política comercial padrão"
        maxWidth="3xl"
      >
        <form onSubmit={handleSaveCustomer} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Nome do Cliente / Rede *
              </label>
              <input
                type="text"
                required
                value={custForm.name}
                onChange={(e) => setCustForm({ ...custForm, name: e.target.value })}
                placeholder="Ex: Cristal Cel"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Razão Social
              </label>
              <input
                type="text"
                value={custForm.companyName}
                onChange={(e) => setCustForm({ ...custForm, companyName: e.target.value })}
                placeholder="Ex: Cristal Cel Acessórios LTDA"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                CNPJ / CPF
              </label>
              <input
                type="text"
                value={custForm.cnpj}
                onChange={(e) => setCustForm({ ...custForm, cnpj: e.target.value })}
                placeholder="12.345.678/0001-90"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-600 focus:outline-none font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Telefone Principal *
              </label>
              <input
                type="text"
                required
                value={custForm.phone}
                onChange={(e) => setCustForm({ ...custForm, phone: e.target.value })}
                placeholder="(41) 3333-4444"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Nome do Responsável / Contato *
              </label>
              <input
                type="text"
                required
                value={custForm.contactName}
                onChange={(e) => setCustForm({ ...custForm, contactName: e.target.value })}
                placeholder="Ex: João Silva"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Faturamento da Rede
              </label>
              <select
                value={custForm.billingMode}
                onChange={(e) => setCustForm({ ...custForm, billingMode: e.target.value as any })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-600 focus:outline-none bg-white"
              >
                <option value="consolidado">Consolidado (Única conta matriz)</option>
                <option value="separado">Por Filial (Cada filial paga o seu)</option>
              </select>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">
              Política Comercial & Pagamento
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Condição Padrão</label>
                <select
                  value={custForm.policyType}
                  onChange={(e) => setCustForm({ ...custForm, policyType: e.target.value as any })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium focus:ring-2 focus:ring-blue-600 focus:outline-none bg-white"
                >
                  <option value="pagamento_entrega">Pagamento na Entrega</option>
                  <option value="pre_pago">Pré-Pago / Antecipado</option>
                  <option value="pix_manual">Pix Manual</option>
                  <option value="fechamento_semanal">Fechamento Semanal</option>
                  <option value="fechamento_mensal">Fechamento Mensal</option>
                  <option value="condicao_especial">Condição Especial</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Prazo (Dias)</label>
                <input
                  type="number"
                  value={custForm.paymentTermDays}
                  onChange={(e) => setCustForm({ ...custForm, paymentTermDays: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Limite de Crédito (R$)</label>
                <input
                  type="number"
                  value={custForm.creditLimit}
                  onChange={(e) => setCustForm({ ...custForm, creditLimit: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium focus:ring-2 focus:ring-blue-600 focus:outline-none font-mono"
                />
              </div>
            </div>

            <div className="mt-4 space-y-2 text-xs">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={custForm.produceOnlyAfterPayment}
                  onChange={(e) => setCustForm({ ...custForm, produceOnlyAfterPayment: e.target.checked })}
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <span className="font-semibold text-slate-800">
                  Produzir somente após pagamento confirmado (bloqueia fila de produção)
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={custForm.allowNewOrdersWithOverdue}
                  onChange={(e) => setCustForm({ ...custForm, allowNewOrdersWithOverdue: e.target.checked })}
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <span className="font-semibold text-slate-800">
                  Permitir novos pedidos mesmo com saldo vencido
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={custForm.showPixOnPendingReceipts}
                  onChange={(e) => setCustForm({ ...custForm, showPixOnPendingReceipts: e.target.checked })}
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <span className="font-semibold text-slate-800">
                  Exibir Chave Pix e QR Code em recibos pendentes
                </span>
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIsCustomerModalOpen(false)}
              className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" />
              <span>Salvar Cliente</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Nova/Editar Filial */}
      <Modal
        isOpen={isBranchModalOpen}
        onClose={() => setIsBranchModalOpen(false)}
        title={editingBranch ? 'Editar Filial' : `Nova Filial - ${selectedCustomer?.name}`}
        subtitle="Informe o endereço que sairá registrado nos recibos e entregas"
        maxWidth="2xl"
      >
        <form onSubmit={handleSaveBranch} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Nome da Filial *
              </label>
              <input
                type="text"
                required
                value={branchForm.name}
                onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })}
                placeholder="Ex: Centro 1 ou Loja Estação"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Nome Fantasia
              </label>
              <input
                type="text"
                value={branchForm.tradeName}
                onChange={(e) => setBranchForm({ ...branchForm, tradeName: e.target.value })}
                placeholder="Ex: Cristal Cel XV"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-600 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Endereço Completo *
              </label>
              <input
                type="text"
                required
                value={branchForm.address}
                onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })}
                placeholder="Rua XV de Novembro, 123"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Bairro *
              </label>
              <input
                type="text"
                required
                value={branchForm.neighborhood}
                onChange={(e) => setBranchForm({ ...branchForm, neighborhood: e.target.value })}
                placeholder="Centro"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                CEP
              </label>
              <input
                type="text"
                value={branchForm.zipCode}
                onChange={(e) => setBranchForm({ ...branchForm, zipCode: e.target.value })}
                placeholder="80020-310"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-600 focus:outline-none font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Telefone da Filial
              </label>
              <input
                type="text"
                value={branchForm.phone}
                onChange={(e) => setBranchForm({ ...branchForm, phone: e.target.value })}
                placeholder="(41) 99901-0001"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Responsável na Filial
              </label>
              <input
                type="text"
                value={branchForm.contactName}
                onChange={(e) => setBranchForm({ ...branchForm, contactName: e.target.value })}
                placeholder="Ex: Marcos Gerente"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-600 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIsBranchModalOpen(false)}
              className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" />
              <span>Salvar Filial</span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
