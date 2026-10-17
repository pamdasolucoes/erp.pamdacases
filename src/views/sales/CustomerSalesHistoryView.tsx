import React, { useEffect, useState } from 'react';
import { ArrowLeft, History, ShoppingCart } from 'lucide-react';
import type { CustomerContext } from '../../types/pamdaCore';
import type { HistoryResult, OfficialSaleHistory } from '../../services/customerSalesHistory';
import { customerSalesHistoryService } from '../../services/customerSalesHistoryService';
import { Modal } from '../../components/common/Modal';

interface Props { customer: CustomerContext; onBack: () => void; onNewSale: () => void; }
const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export function CustomerSalesHistoryView({ customer, onBack, onNewSale }: Props) {
  const [result, setResult] = useState<HistoryResult | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [detail, setDetail] = useState<OfficialSaleHistory | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setResult(null); setError(''); setDetail(null);
    customerSalesHistoryService.list(customer.id, controller.signal).then(value => {
      if (!controller.signal.aborted) setResult(value);
    }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Falha na consulta do histórico.'); });
    return () => controller.abort();
  }, [customer.id, revision]);
  return <div className="space-y-5">
    <div className="flex flex-col sm:flex-row justify-between gap-3"><div><h1 className="text-2xl font-black flex gap-2 items-center"><History />Histórico comercial</h1><p className="text-sm mt-1">Código comercial: <span className="font-mono whitespace-pre-wrap">{customer.customerCode}</span></p><p className="text-xs text-slate-500 break-all">Cliente: {customer.id}</p></div>
      <div className="flex flex-col sm:flex-row gap-2"><button onClick={onBack} className="border rounded-xl p-3 text-sm font-bold flex gap-2 items-center"><ArrowLeft className="w-4 h-4" />Voltar ao cliente</button><button onClick={onNewSale} className="bg-blue-600 text-white rounded-xl p-3 text-sm font-bold flex gap-2 items-center"><ShoppingCart className="w-4 h-4" />+ NOVA VENDA</button></div></div>
    {error ? <div role="alert" className="p-5 rounded-xl bg-rose-50 text-rose-800"><p>{error}</p><button className="underline mt-3" onClick={() => setRevision(value => value + 1)}>Tentar novamente</button></div> : !result ? <p role="status">Consultando histórico oficial...</p> : !result.integrated ? <p role="status" className="bg-white border rounded-xl p-6">Histórico de vendas ainda não integrado ao PAMDA CORE.</p> : result.sales.length === 0 ? <p className="bg-white border rounded-xl p-6">Nenhuma venda oficial disponível para este cliente.</p> :
      <div className="overflow-x-auto bg-white border rounded-xl"><table className="w-full text-sm text-left"><thead className="bg-slate-50"><tr>{['Recibo', 'Data', 'Unidade', 'Produtos / quantidade', 'Total', 'Pagamento', 'Produção', 'Entrega', 'Detalhes'].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{result.sales.map(sale => <tr key={sale.id} className="border-t"><td className="p-3">{sale.receipt_number}</td><td className="p-3">{new Date(sale.sold_at).toLocaleString('pt-BR')}</td><td className="p-3">{sale.branch_name || 'Não informada'}</td><td className="p-3">{sale.items.map(item => `${item.product_name} (${item.quantity})`).join(', ') || 'Não informados'}</td><td className="p-3">{money(sale.total_amount)}</td><td className="p-3">{sale.payment_status}</td><td className="p-3">{sale.production_status}</td><td className="p-3">{sale.delivery_status}</td><td className="p-3"><button className="text-blue-700 underline" onClick={() => setDetail(sale)}>Ver detalhes</button></td></tr>)}</tbody></table></div>}
    {detail && <Modal isOpen onClose={() => setDetail(null)} title={`Venda — recibo ${detail.receipt_number}`}>
      <div className="space-y-3 text-sm"><p>{new Date(detail.sold_at).toLocaleString('pt-BR')} · {detail.branch_name || 'Unidade não informada'}</p><p>Pagamento: {detail.payment_status} · Produção: {detail.production_status} · Entrega: {detail.delivery_status}</p><ul className="divide-y">{detail.items.map((item, index) => <li key={index} className="py-2">{item.product_name} · {item.quantity} × {money(item.unit_price)}</li>)}</ul><p className="font-bold">Total: {money(detail.total_amount)}</p></div>
    </Modal>}
  </div>;
}
