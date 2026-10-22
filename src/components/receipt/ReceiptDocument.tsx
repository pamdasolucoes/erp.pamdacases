import React from 'react';
import type { ReceiptDocumentData } from '../../types/receipt';
import { PamdaLogo } from '../common/PamdaLogo';
import { formatMoney } from '../../services/salePricing';

export const receiptStyles = `
.pamda-receipt-container{display:flex;justify-content:center;width:100%}
.pamda-receipt{box-sizing:border-box;flex:0 1 190mm;width:100%;max-width:190mm;margin:0;padding:8mm;background:#fff;color:#111;font-family:Arial,Roboto,sans-serif;font-size:13px;font-weight:500;line-height:1.45;overflow-wrap:anywhere;word-break:normal;hyphens:none}
.pamda-receipt *{box-sizing:border-box}
.pamda-receipt p{margin:2px 0}
.receipt-header{text-align:center;border-bottom:1px solid #777;padding-bottom:12px}
.receipt-logo{display:flex!important;width:auto!important;height:auto!important;justify-content:center;margin:0 auto 8px;overflow:visible}
.receipt-logo img{display:block;width:220px;max-width:72%;height:auto;object-fit:contain}
.receipt-company-details{margin-top:3px}
.receipt-heading{margin-top:8px}
.receipt-heading strong{display:block;font-size:22px;line-height:1.2;font-weight:800}
.receipt-test-notice{margin:4px 0!important;font-size:10px;font-weight:800;letter-spacing:.04em}
.receipt-date{margin-top:4px}
.receipt-section{padding:12px 0;border-bottom:1px solid #bbb}
.receipt-meta{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}
.receipt-meta-block{min-width:0}
.receipt-section-title{margin:0 0 6px!important;font-size:11px;font-weight:800;letter-spacing:.07em}
.receipt-field{margin:3px 0!important}
.receipt-muted{font-size:11px;color:#000}
.receipt-customer{text-align:center;font-size:15px;font-weight:700;line-height:1.5}
.receipt-customer .receipt-section-title{font-size:11px}
.receipt-customer .receipt-field{margin:4px 0!important}
.receipt-customer-contact,.receipt-address{white-space:pre-line}
.receipt-table{width:100%;border-collapse:collapse;table-layout:fixed}
.receipt-table th,.receipt-table td{padding:7px 5px;border-bottom:1px solid #ccc;vertical-align:top}
.receipt-table th{font-size:10px;font-weight:800;text-transform:uppercase;text-align:left;border-bottom:1.5px solid #333}
.receipt-table .receipt-number{text-align:right;font-variant-numeric:tabular-nums}
.receipt-product-code{margin-top:3px!important}
.receipt-product-customization{margin-top:3px!important}
.receipt-totals{width:100%;max-width:340px;margin:14px 0 0 auto}
.receipt-totals p{display:flex;justify-content:space-between;gap:14px;padding:3px 0}
.receipt-totals p>span:last-child,.receipt-totals p>strong:last-child{min-width:105px;text-align:right;font-variant-numeric:tabular-nums}
.receipt-total{margin-top:5px!important;padding-top:8px!important;border-top:2px solid #111;font-size:18px;font-weight:800}
.receipt-total span{font-weight:800}
.receipt-notes{white-space:pre-wrap}
.receipt-footer{text-align:center;font-size:11px;border-top:1px solid #999;margin-top:16px;padding-top:9px}
.receipt-thermal-item{padding:8px 0;border-bottom:1px dashed #666;break-inside:avoid}
.receipt-thermal-product{margin:0 0 4px!important}
.receipt-thermal-values{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-top:5px!important}
.receipt-thermal-values strong{text-align:right;font-weight:800}
.receipt-seller{margin:8px 0 12px!important;padding:8px 0;border-top:1px solid #999;text-align:center;font-size:14px;font-weight:800}
.receipt-narrow-items{display:none}
.receipt-wide-items{display:table}
@media screen and (max-width:600px), print and (max-width:100mm){
  .pamda-receipt{flex-basis:100%;max-width:none;padding:3mm;font-size:12px;line-height:1.42}
  .receipt-logo img{width:52mm;max-width:82%;height:auto}
  .receipt-company-details{font-size:11px}
  .receipt-heading strong{font-size:10px}
  .receipt-customer{font-size:13px}
  .receipt-customer .receipt-section-title{font-size:10px}
  .receipt-section{padding:9px 0;border-bottom-style:dashed}
  .receipt-meta{display:block;grid-template-columns:1fr}
  .receipt-meta-block+.receipt-meta-block{margin-top:8px}
  .receipt-narrow-items{display:block}
  .receipt-wide-items{display:none}
  .receipt-totals{max-width:none;margin-top:10px}
  .receipt-total{font-size:17px}
  .receipt-seller{font-size:13px}
  .receipt-footer{margin-top:12px}
  .receipt-table th,.receipt-table td{padding:5px 3px}
}
@media print{
  .pamda-receipt{max-width:190mm;padding:5mm;color:#000!important;background:#fff!important}
  .receipt-table thead{display:table-header-group}
  .receipt-table tr,.receipt-totals,.receipt-meta-block{break-inside:avoid}
  .receipt-section{break-inside:auto}
  .receipt-thermal-item{break-inside:avoid}
}
@media print and (max-width:100mm){.pamda-receipt{flex-basis:100%;max-width:none;padding:3mm}}
`;

export function ReceiptDocument({ data }: { data: ReceiptDocumentData }) {
  const preview = data.kind === 'preview';
  const title = preview
    ? 'RECIBO Nº TESTE'
    : data.kind === 'demo'
      ? 'DEMONSTRAÇÃO - RECIBO LOCAL'
      : `RECIBO Nº ${data.receiptNumber ?? ''}`;
  const dateParts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(data.generatedAt));
  const datePart = (type: Intl.DateTimeFormatPartTypes) =>
    dateParts.find(part => part.type === type)?.value || '';
  const date = `${datePart('day')}/${datePart('month')}/${datePart('year')} ${datePart('hour')}:${datePart('minute')}:${datePart('second')}`;
  const showPayment = (data.kind === 'confirmed' || data.kind === 'test_confirmed') && data.payment !== null;
  const customerContact = data.customerContact?.trim();
  const hasCompanyDetails = data.company.cnpj || data.company.phone;

  return (
    <div className="pamda-receipt-container">
    <article
      className="pamda-receipt"
      aria-label={preview ? 'Documento de prévia do recibo' : 'Documento do recibo'}
    >
      <style>{receiptStyles}</style>
      <header className="receipt-header">
        <PamdaLogo className="receipt-logo" size="xl" showSubtitle={false} />
        {data.kind === 'test_confirmed' && <p className="receipt-test-notice"><strong>DOCUMENTO DE TESTE - SEM VALOR FISCAL</strong></p>}
        {hasCompanyDetails && (
          <div className="receipt-company-details">
            {data.company.cnpj && <p>CNPJ: {data.company.cnpj}</p>}
            {data.company.phone && <p>Telefone / WhatsApp: {data.company.phone}</p>}
          </div>
        )}
        <div className="receipt-heading">
          <strong>{title}</strong>
          {data.kind === 'demo' && <p>Número local não oficial: {data.receiptNumber}</p>}
          <p className="receipt-date">{date}</p>
        </div>
      </header>

      <section className="receipt-section receipt-customer" aria-label="Dados do cliente">
        <p className="receipt-field"><strong>{data.customerCode !== null ? `${data.customerCode} - ${data.customerName}` : data.customerName}</strong></p>
        {data.address && <p className="receipt-field receipt-address"><strong>{data.address}</strong></p>}
        {customerContact && <p className="receipt-field receipt-customer-contact">{customerContact}</p>}
      </section>

      <section className="receipt-section" aria-label="Produtos">
        <>
          <table className="receipt-table receipt-wide-items">
            <colgroup>
              <col style={{ width: '15%' }} />
              <col style={{ width: '43%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '17%' }} />
              <col style={{ width: '17%' }} />
            </colgroup>
            <thead>
              <tr>
                <th>Código</th>
                <th>Produto</th>
                <th>Qtd.</th>
                <th className="receipt-number">Unitário</th>
                <th className="receipt-number">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map(item => (
                <tr key={item.id}>
                  <td>{item.code}</td>
                  <td>
                    <strong>{item.name}</strong>
                    {item.sku && <p className="receipt-muted receipt-product-code">SKU: {item.sku}</p>}
                    {item.customization?.model && <p className="receipt-muted receipt-product-customization">Modelo: {item.customization.model}</p>}
                    {item.customization?.color && <p className="receipt-muted">Cor: {item.customization.color}</p>}
                    {item.customization?.walletFaces && <p className="receipt-muted">Carteira: {item.customization.walletFaces === '1' ? 'uma face' : 'duas faces'}</p>}
                  </td>
                  <td>{item.quantity}</td>
                  <td className="receipt-number">{formatMoney(item.unitPriceCents)}</td>
                  <td className="receipt-number"><strong>{formatMoney(item.subtotalCents)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="receipt-narrow-items">
            {data.items.map(item => (
              <div key={item.id} className="receipt-thermal-item">
                <p className="receipt-thermal-product">{item.code} - <strong>{item.name}</strong></p>
                {item.customization?.model && <p className="receipt-muted">Modelo: {item.customization.model}</p>}
                {item.customization?.color && <p className="receipt-muted">Cor: {item.customization.color}</p>}
                {item.customization?.walletFaces && <p className="receipt-muted">Carteira: {item.customization.walletFaces === '1' ? 'uma face' : 'duas faces'}</p>}
                <p className="receipt-thermal-values"><span>Qtd: {item.quantity}</span><strong>Subtotal: {formatMoney(item.subtotalCents)}</strong></p>
              </div>
            ))}
          </div>
        </>
      </section>

      <section className="receipt-totals" aria-label="Totais">
        <p><span>Total de itens</span><strong>{data.items.reduce((sum, item) => sum + item.quantity, 0)}</strong></p>
        <p><span>Subtotal dos produtos</span><span>{formatMoney(data.subtotalCents)}</span></p>
        {data.discountCents > 0 && <p><span>Descontos</span><span>− {formatMoney(data.discountCents)}</span></p>}
        <p><span>Frete</span><span>{formatMoney(data.freightCents)}</span></p>
        <p className="receipt-total"><span>TOTAL</span><span>{formatMoney(data.totalCents)}</span></p>
      </section>

      <p className="receipt-seller">Vendedor: {data.salespersonName}</p>
      {data.freightCents > 0 && data.freightReason && <p className="receipt-field">Observação do frete: {data.freightReason}</p>}
      {data.notes && <section className="receipt-section receipt-notes"><strong>Observações:</strong><p>{data.notes}</p></section>}
      {showPayment && data.payment && (
        <section className="receipt-section">
          {data.payment.paid ? (
            <><strong>Pagamento confirmado</strong><p>Valor recebido: {formatMoney(data.payment.amountPaidCents)}</p></>
          ) : (
            <><strong>Saldo a receber</strong>{data.payment.qrCodeUrl && <img src={data.payment.qrCodeUrl} alt="QR Code Pix" style={{ width: 150, display: 'block', margin: '8px auto' }} />}{data.payment.pixKey&&<p>Chave Pix: {data.payment.pixKey}</p>}<p>Saldo: {formatMoney(data.payment.balanceCents)}</p></>
          )}
        </section>
      )}

      <footer className="receipt-footer">
        {!preview && (
          <><strong>OBRIGADO PELA PREFERÊNCIA!</strong><p>{data.company.name} · B2B &amp; Personalização</p></>
        )}
      </footer>
    </article>
    </div>
  );
}
