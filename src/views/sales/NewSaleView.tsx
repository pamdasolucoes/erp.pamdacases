import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ShoppingCart,
  Plus,
  Trash2,
  CheckCircle2,
  Building2,
  DollarSign,
  User as UserIcon,
  Calendar,
  AlertCircle,
  Search,
  X,
  ChevronDown,
  Check,
} from 'lucide-react';
import { Customer, Product, Sale, SaleOrigin, PaymentPolicyType } from '../../types/erp';
import { dbService } from '../../services/db';
import { authService } from '../../services/auth';

interface NewSaleViewProps {
  onSaleCreated: (sale: Sale) => void;
}

export const NewSaleView: React.FC<NewSaleViewProps> = ({ onSaleCreated }) => {
  const [customers, setCustomers] = useState<Customer[]>(dbService.getCustomers());
  const [products, setProducts] = useState<Product[]>(dbService.getProducts());
  const currentUser = authService.getCurrentUser();

  const [customerId, setCustomerId] = useState<string>(customers[0]?.id || '');
  const [customerSearchQuery, setCustomerSearchQuery] = useState<string>('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState<boolean>(false);
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = dbService.subscribe(() => {
      setCustomers([...dbService.getCustomers()]);
      setProducts([...dbService.getProducts()]);
    });
    return unsub;
  }, []);

  const [branchId, setBranchId] = useState<string>('');
  const [salespersonName, setSalespersonName] = useState<string>(
    currentUser?.name || 'Nilu Juca'
  );
  const [origin, setOrigin] = useState<SaleOrigin>('whatsapp');
  const [paymentPolicyType, setPaymentPolicyType] = useState<PaymentPolicyType>('pagamento_entrega');
  const [shippingFeeCharged, setShippingFeeCharged] = useState<number>(5.0);
  const [discount, setDiscount] = useState<number>(0.0);
  const [notes, setNotes] = useState<string>('');
  const [isPaidImmediately, setIsPaidImmediately] = useState<boolean>(false);

  // Selected items list
  const [items, setItems] = useState<
    Array<{
      productId: string;
      quantity: number;
      unitPrice: number;
    }>
  >([]);

  // Selected customer object
  const selectedCustomer = customers.find((c) => c.id === customerId);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        customerDropdownRef.current &&
        !customerDropdownRef.current.contains(event.target as Node)
      ) {
        setIsCustomerDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Filtered customers based on search
  const filteredCustomers = useMemo(() => {
    const q = customerSearchQuery.toLowerCase().trim();
    if (!q) return customers;
    return customers.filter((c) => {
      const matchName = c.name.toLowerCase().includes(q);
      const matchCnpj = c.cnpj ? c.cnpj.toLowerCase().includes(q) : false;
      const matchCompany = c.companyName ? c.companyName.toLowerCase().includes(q) : false;
      const matchContact = c.contactName ? c.contactName.toLowerCase().includes(q) : false;
      const matchPhone = c.phone ? c.phone.toLowerCase().includes(q) : false;
      const matchBranches = c.branches ? c.branches.some(
        (b) => b.name.toLowerCase().includes(q) || b.address.toLowerCase().includes(q)
      ) : false;
      return matchName || matchCnpj || matchCompany || matchContact || matchPhone || matchBranches;
    });
  }, [customers, customerSearchQuery]);

  // Update branch and payment condition default when customer changes
  useEffect(() => {
    if (selectedCustomer) {
      if (selectedCustomer.branches && selectedCustomer.branches.length > 0) {
        setBranchId(selectedCustomer.branches[0].id);
      } else {
        setBranchId('');
      }
      setPaymentPolicyType(selectedCustomer.paymentPolicy.policyType);
    }
  }, [customerId]);

  // Initial items matching Screen 6 if empty
  useEffect(() => {
    if (items.length === 0 && products.length >= 3) {
      // Pré-selecionar os 3 kits do mockup da tela 6 para teste rápido
      const kit1 = products.find((p) => p.code === '11143') || products[0];
      const kit2 = products.find((p) => p.code === '21152') || products[1];
      const kit3 = products.find((p) => p.code === '33554') || products[2];

      const initial = [
        { productId: kit1.id, quantity: 1, unitPrice: kit1.salePrice },
        { productId: kit2.id, quantity: 1, unitPrice: kit2.salePrice },
        { productId: kit3.id, quantity: 1, unitPrice: kit3.salePrice },
      ];
      setItems(initial);
    }
  }, [products]);

  const handleAddItem = (productId: string) => {
    const prod = products.find((p) => p.id === productId);
    if (!prod) return;

    setItems([
      ...items,
      {
        productId: prod.id,
        quantity: 1,
        unitPrice: prod.salePrice,
      },
    ]);
  };

  const handleUpdateItemQty = (index: number, quantity: number) => {
    const updated = [...items];
    updated[index].quantity = Math.max(1, quantity);
    setItems(updated);
  };

  const handleUpdateItemPrice = (index: number, price: number) => {
    const updated = [...items];
    updated[index].unitPrice = Math.max(0, price);
    setItems(updated);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleQuickCreateCustomer = () => {
    if (!customerSearchQuery.trim()) return;
    const newCust = dbService.saveCustomer({
      name: customerSearchQuery.trim(),
      contactName: 'Contato Comercial',
      phone: '',
      notes: 'Cadastrado rapidamente na tela de Nova Venda',
      active: true,
      isChain: false,
      billingMode: 'separado',
      paymentPolicy: {
        policyType: 'pagamento_entrega',
        produceOnlyAfterPayment: false,
        closingFrequency: 'none',
        paymentTermDays: 0,
        creditLimit: 5000,
        allowNewOrdersWithOverdue: true,
        autoBlockOnOverdue: false,
        showPixOnPendingReceipts: true,
      },
      branches: [],
    });
    setCustomerId(newCust.id);
    setCustomerSearchQuery('');
    setIsCustomerDropdownOpen(false);
  };

  // Calculations
  const productsTotal = items.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);
  const totalItemsCount = items.reduce((acc, item) => acc + item.quantity, 0);
  const totalAmount = Math.max(0, productsTotal + Number(shippingFeeCharged) - Number(discount));

  const handleConfirmSale = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId) {
      alert('Selecione um cliente.');
      return;
    }
    if (items.length === 0) {
      alert('Adicione pelo menos um item à venda.');
      return;
    }

    try {
      const createdSale = dbService.createSale({
        customerId,
        branchId: branchId || undefined,
        salespersonName: salespersonName.trim() || 'Nilu Juca',
        origin,
        items,
        shippingFeeCharged: Number(shippingFeeCharged),
        discount: Number(discount),
        notes: notes.trim() || undefined,
        financialStatus: isPaidImmediately ? 'pago' : 'aguardando_pagamento',
      });

      alert(`Venda confirmada com sucesso! Recibo Oficial Nº ${createdSale.receiptNumber}`);
      onSaleCreated(createdSale);
    } catch (err: any) {
      alert('Erro ao criar venda: ' + err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Confirm button matching Screen 6 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Nova Venda B2B
          </h1>
          <p className="text-xs text-slate-500">
            Geração de pedido, baixa de estoque, congelamento de custos históricos e emissão de recibo
          </p>
        </div>

        <button
          onClick={handleConfirmSale}
          className="flex items-center justify-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm rounded-xl shadow-md transition-all cursor-pointer"
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>Confirmar Venda</span>
        </button>
      </div>

      <form onSubmit={handleConfirmSale} className="space-y-6">
        {/* Top Info Panel matching Screen 6 */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Cliente / Rede com Pesquisa Interativa */}
          <div className="relative" ref={customerDropdownRef}>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-slate-700 uppercase">
                Cliente / Rede *
              </label>
              {selectedCustomer && (
                <span className="text-[10px] text-blue-600 font-bold bg-blue-50 px-1.5 py-0.5 rounded">
                  {selectedCustomer.isChain ? 'Rede B2B' : 'Cliente Avulso'}
                </span>
              )}
            </div>

            {/* Search Input Box */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Search className="w-3.5 h-3.5" />
              </div>
              <input
                type="text"
                value={customerSearchQuery}
                onFocus={() => setIsCustomerDropdownOpen(true)}
                onChange={(e) => {
                  setCustomerSearchQuery(e.target.value);
                  setIsCustomerDropdownOpen(true);
                }}
                placeholder={
                  selectedCustomer
                    ? `${selectedCustomer.name} (digite para buscar outro...)`
                    : 'Pesquisar por nome, CNPJ, contato...'
                }
                className="w-full pl-9 pr-8 py-2 border border-slate-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-600 focus:bg-white focus:outline-none bg-white placeholder:text-slate-400 transition-all"
              />
              {customerSearchQuery ? (
                <button
                  type="button"
                  onClick={() => {
                    setCustomerSearchQuery('');
                  }}
                  className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsCustomerDropdownOpen(!isCustomerDropdownOpen)}
                  className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isCustomerDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
              )}
            </div>

            {/* Dropdown de Resultados da Pesquisa */}
            {isCustomerDropdownOpen && (
              <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white rounded-xl border border-slate-200 shadow-xl max-h-72 overflow-y-auto divide-y divide-slate-100">
                <div className="p-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-medium">
                  <span>Clientes encontrados: {filteredCustomers.length}</span>
                  {customerSearchQuery && (
                    <span className="text-blue-600 font-semibold truncate max-w-[150px]">
                      "{customerSearchQuery}"
                    </span>
                  )}
                </div>

                {filteredCustomers.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-400 space-y-2">
                    <p className="font-semibold text-slate-600">Nenhum cliente localizado</p>
                    <p className="text-[11px]">Tente pesquisar por outro nome, CNPJ ou contato.</p>
                    {customerSearchQuery.trim() && (
                      <button
                        type="button"
                        onClick={handleQuickCreateCustomer}
                        className="mt-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs transition-colors cursor-pointer inline-flex items-center gap-1 shadow-xs"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Cadastrar "{customerSearchQuery.trim()}" Agora</span>
                      </button>
                    )}
                  </div>
                ) : (
                  filteredCustomers.map((c) => {
                    const isSelected = c.id === customerId;
                    return (
                      <div
                        key={c.id}
                        onClick={() => {
                          setCustomerId(c.id);
                          setCustomerSearchQuery('');
                          setIsCustomerDropdownOpen(false);
                        }}
                        className={`p-3 text-xs cursor-pointer transition-colors flex items-center justify-between ${
                          isSelected ? 'bg-blue-50/90 text-blue-900 font-bold' : 'hover:bg-slate-50 text-slate-800'
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-900 text-xs truncate">
                              {c.name}
                            </span>
                            {c.isChain && (
                              <span className="text-[10px] bg-blue-100 text-blue-700 font-bold px-1 rounded">
                                Rede
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap gap-x-2">
                            {c.cnpj && <span className="font-mono">CNPJ: {c.cnpj}</span>}
                            <span>Contato: {c.contactName}</span>
                          </div>
                          {c.branches && c.branches.length > 0 && (
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {c.branches.length} filial(is): {c.branches.map((b) => b.name).join(', ')}
                            </div>
                          )}
                        </div>

                        {isSelected && (
                          <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
                            <Check className="w-3 h-3" />
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Quick Selected Customer Chip */}
            {selectedCustomer && (
              <div className="mt-1.5 text-[11px] text-slate-500 flex items-center gap-1.5 truncate">
                <span className="font-semibold text-slate-700">Selecionado:</span>
                <span className="font-bold text-blue-700 truncate">{selectedCustomer.name}</span>
                {selectedCustomer.cnpj && (
                  <span className="font-mono text-slate-400 hidden sm:inline">({selectedCustomer.cnpj})</span>
                )}
              </div>
            )}
          </div>

          {/* Filial */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Filial *
            </label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              disabled={!selectedCustomer?.branches || selectedCustomer.branches.length === 0}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-600 focus:outline-none bg-white disabled:bg-slate-100"
            >
              {selectedCustomer?.branches && selectedCustomer.branches.length > 0 ? (
                selectedCustomer.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} - {b.neighborhood}
                  </option>
                ))
              ) : (
                <option value="">Matriz / Balcão</option>
              )}
            </select>
          </div>

          {/* Vendedor */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Vendedor *
            </label>
            <input
              type="text"
              required
              value={salespersonName}
              onChange={(e) => setSalespersonName(e.target.value)}
              placeholder="Nome do vendedor"
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-600 focus:outline-none"
            />
          </div>

          {/* Condição de Pagamento */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Condição de Pagamento
            </label>
            <select
              value={paymentPolicyType}
              onChange={(e) => setPaymentPolicyType(e.target.value as any)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-600 focus:outline-none bg-white"
            >
              <option value="pagamento_entrega">Pagamento na entrega</option>
              <option value="pre_pago">Pré-pago / Antecipado</option>
              <option value="pix_manual">Pix manual</option>
              <option value="fechamento_semanal">Fechamento semanal</option>
              <option value="fechamento_mensal">Fechamento mensal</option>
              <option value="condicao_especial">Condição especial</option>
            </select>
          </div>

          {/* Origem da Venda */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Origem da Venda
            </label>
            <select
              value={origin}
              onChange={(e) => setOrigin(e.target.value as any)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-600 focus:outline-none bg-white"
            >
              <option value="whatsapp">WhatsApp</option>
              <option value="site_b2b">Site B2B</option>
              <option value="vendedor">Vendedor Externo</option>
              <option value="balcao">Balcão</option>
              <option value="erp_manual">ERP / Manual</option>
              <option value="outro">Outro Canal</option>
            </select>
          </div>

          {/* Data da Venda */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Data e Hora da Venda
            </label>
            <div className="px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-700">
              {new Date().toLocaleString('pt-BR')} (Imutável no Recibo)
            </div>
          </div>
        </div>

        {/* Items Section matching Screen 6 */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Itens da Venda ({totalItemsCount} unidades)
              </h2>
              <p className="text-[11px] text-slate-500">
                Selecione kits personalizados, capas avulsas ou serviços de DTF UV
              </p>
            </div>

            <div className="flex items-center gap-2">
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    handleAddItem(e.target.value);
                    e.target.value = '';
                  }
                }}
                className="px-3 py-1.5 border border-slate-300 rounded-xl text-xs font-semibold bg-blue-50 text-blue-700 focus:ring-2 focus:ring-blue-600 focus:outline-none cursor-pointer"
              >
                <option value="">+ Adicionar item ao pedido...</option>
                {products
                  .filter((p) => p.active)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      [{p.code}] {p.name} - R$ {p.salePrice.toFixed(2)}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[11px]">
                <tr>
                  <th className="py-2.5 px-4 w-20">Cód.</th>
                  <th className="py-2.5 px-4">Produto</th>
                  <th className="py-2.5 px-4 w-20 text-center">Qtd</th>
                  <th className="py-2.5 px-4 w-14 text-center">Un</th>
                  <th className="py-2.5 px-4 text-right w-28">Vlr. Unit. (R$)</th>
                  <th className="py-2.5 px-4 text-right w-28">Subtotal (R$)</th>
                  <th className="py-2.5 px-4 w-12 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-400">
                      Nenhum item adicionado à venda. Selecione um item acima.
                    </td>
                  </tr>
                ) : (
                  items.map((item, idx) => {
                    const prod = products.find((p) => p.id === item.productId);
                    const subtotal = item.unitPrice * item.quantity;
                    return (
                      <tr key={idx} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 font-mono font-semibold text-slate-600">
                          {prod?.code || '---'}
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-bold text-slate-900 block">
                            {prod?.name || 'Item selecionado'}
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium">
                            {prod?.type === 'kit'
                              ? 'Kit composto (baixa componentes físicos)'
                              : prod?.type === 'fisico'
                              ? 'Produto físico com estoque'
                              : 'Serviço DTF UV'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => handleUpdateItemQty(idx, Number(e.target.value))}
                            className="w-16 px-2 py-1 border border-slate-300 rounded text-center font-bold focus:ring-1 focus:ring-blue-600 focus:outline-none"
                          />
                        </td>
                        <td className="py-3 px-4 text-center text-slate-500 font-medium">
                          UN
                        </td>
                        <td className="py-3 px-4 text-right">
                          <input
                            type="number"
                            step="0.01"
                            value={item.unitPrice}
                            onChange={(e) => handleUpdateItemPrice(idx, Number(e.target.value))}
                            className="w-24 px-2 py-1 border border-slate-300 rounded font-mono font-bold text-right focus:ring-1 focus:ring-blue-600 focus:outline-none"
                          />
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-black text-slate-900 text-sm">
                          R$ {subtotal.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Bottom Totals and Observations matching Screen 6 */}
          <div className="p-6 bg-slate-50/70 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-12 gap-6">
            <div className="sm:col-span-7 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Observações da Venda
                </label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Observações da venda, artes aprovadas, detalhes de entrega..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-600 focus:outline-none bg-white"
                />
              </div>

              <div className="flex items-center gap-2 pt-1 text-xs">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800">
                  <input
                    type="checkbox"
                    checked={isPaidImmediately}
                    onChange={(e) => setIsPaidImmediately(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Venda já paga antecipadamente via Pix / Dinheiro</span>
                </label>
              </div>
            </div>

            <div className="sm:col-span-5 space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-200 text-slate-600">
                <span>Total dos produtos ({totalItemsCount} un):</span>
                <span className="font-mono font-bold text-slate-900">
                  R$ {productsTotal.toFixed(2)}
                </span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-slate-200 text-slate-600">
                <span>Frete cobrado (R$):</span>
                <input
                  type="number"
                  step="0.01"
                  value={shippingFeeCharged}
                  onChange={(e) => setShippingFeeCharged(Number(e.target.value))}
                  className="w-24 px-2 py-0.5 bg-white border border-slate-300 rounded font-mono font-bold text-right"
                />
              </div>

              <div className="flex items-center justify-between py-1 border-b border-slate-200 text-slate-600">
                <span>Desconto (R$):</span>
                <input
                  type="number"
                  step="0.01"
                  value={discount}
                  onChange={(e) => setDiscount(Number(e.target.value))}
                  className="w-24 px-2 py-0.5 bg-white border border-slate-300 rounded font-mono font-bold text-right text-rose-600"
                />
              </div>

              <div className="flex justify-between py-2 text-lg font-black text-slate-900 border-t-2 border-slate-900">
                <span>TOTAL:</span>
                <span className="font-mono text-emerald-700">
                  R$ {totalAmount.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};
