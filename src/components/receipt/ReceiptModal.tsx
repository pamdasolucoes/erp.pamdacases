import React, { useState, useEffect } from 'react';
import { Sale, AppSettings } from '../../types/erp';
import { paymentService } from '../../services/payment';
import { dbService } from '../../services/db';
import {
  Printer,
  Download,
  CheckCircle2,
  QrCode,
  FileText,
  Receipt,
  X,
  Copy,
  Check,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { PamdaLogo } from '../common/PamdaLogo';

interface ReceiptModalProps {
  sale: Sale | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ sale, isOpen, onClose }) => {
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [settings, setSettings] = useState<AppSettings>(dbService.getSettings());
  const [activeFormat, setActiveFormat] = useState<'a4' | 'thermal'>('a4');
  const [notificationMsg, setNotificationMsg] = useState<string>('');
  const [showPrintBanner, setShowPrintBanner] = useState<boolean>(false);

  useEffect(() => {
    setSettings(dbService.getSettings());
    setShowPrintBanner(false);
  }, [isOpen]);

  useEffect(() => {
    if (sale && sale.pendingBalance > 0) {
      const payload = paymentService.generatePixPayload({
        pixKey: settings.pixKey || 'capaspix@gmail.com',
        beneficiaryName: settings.pixBeneficiaryName || 'PAMDA CASES',
        amount: sale.pendingBalance,
        txId: `REC${sale.receiptNumber}`,
      });
      paymentService.generateQrCodeDataUrl(payload).then((url) => {
        setQrCodeUrl(url);
      });
    }
  }, [sale, settings]);

  if (!isOpen || !sale) return null;

  const formatDate = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isPaid = sale.financialStatus === 'pago' || sale.pendingBalance <= 0;

  // Tentativa de impressão via iframe oculto dedicado
  const tryPrintViaIframe = (format: 'thermal' | 'a4') => {
    try {
      const isThermal = format === 'thermal';
      const elementId = isThermal ? 'printable-receipt-thermal' : 'printable-receipt-a4';
      const element = document.getElementById(elementId);
      if (!element) return;

      let iframe = document.getElementById('pamda-print-frame') as HTMLIFrameElement;
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'pamda-print-frame';
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        iframe.style.visibility = 'hidden';
        document.body.appendChild(iframe);
      }

      const doc = iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <title>Recibo ${sale.receiptNumber} - PAMDA CASES</title>
            <style>
              @page { size: ${isThermal ? '80mm auto' : 'A4'}; margin: ${isThermal ? '2mm 3mm' : '8mm'}; }
              body {
                font-family: ${isThermal ? "'Courier New', Courier, monospace" : "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"};
                padding: ${isThermal ? '2mm 3mm' : '10mm'};
                width: ${isThermal ? '76mm' : '100%'};
                max-width: ${isThermal ? '76mm' : '800px'};
                margin: 0 auto;
                color: #000;
                background: #fff;
              }
              table { width: 100%; border-collapse: collapse; }
              th, td { padding: 4px 6px; }
            </style>
          </head>
          <body>
            ${element.innerHTML}
          </body>
          </html>
        `);
        doc.close();

        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch (e) {
            console.warn('Iframe print prevented:', e);
          }
        }, 100);
      }
    } catch (e) {
      console.warn('Iframe print error:', e);
    }
  };

  // Imprimir em Impressora Térmica 80mm
  const handlePrintThermal = () => {
    setActiveFormat('thermal');
    document.body.classList.add('printing-thermal');
    setShowPrintBanner(true);

    // 1. Tentar window.print() direto síncrono
    try {
      window.print();
    } catch (err) {
      console.warn('Direct print failed:', err);
    }

    // 2. Tentar via iframe oculto
    tryPrintViaIframe('thermal');

    setTimeout(() => {
      document.body.classList.remove('printing-thermal');
    }, 1200);
  };

  // Imprimir em Impressora Padrão (A4 / Laser / PDF)
  const handlePrintStandard = () => {
    setActiveFormat('a4');
    document.body.classList.remove('printing-thermal');
    setShowPrintBanner(true);

    // 1. Tentar window.print() direto síncrono
    try {
      window.print();
    } catch (err) {
      console.warn('Direct print failed:', err);
    }

    // 2. Tentar via iframe oculto
    tryPrintViaIframe('a4');
  };

  // Gerar e baixar arquivo HTML com acionamento automático de impressão
  const handleDownloadPrintableFile = (format: 'thermal' | 'a4') => {
    const isThermal = format === 'thermal';
    const elementId = isThermal ? 'printable-receipt-thermal' : 'printable-receipt-a4';
    const element = document.getElementById(elementId);
    if (!element) return;

    const htmlBody = element.innerHTML;
    const fullDocument = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Recibo Nº ${sale.receiptNumber} - PAMDA CASES</title>
  <style>
    @page {
      size: ${isThermal ? '80mm auto' : 'A4'};
      margin: ${isThermal ? '2mm 3mm' : '8mm'};
    }
    body {
      margin: 0;
      padding: ${isThermal ? '2mm 3mm' : '10mm'};
      background: #ffffff;
      color: #000000;
      font-family: ${isThermal ? "'Courier New', Courier, monospace" : "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"};
      font-size: ${isThermal ? '11px' : '13px'};
      line-height: 1.3;
      width: ${isThermal ? '76mm' : '100%'};
      max-width: ${isThermal ? '76mm' : '800px'};
      margin-left: auto;
      margin-right: auto;
    }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 4px 6px; }
    img { max-width: 100%; }
    .no-print { display: none !important; }
  </style>
</head>
<body>
  ${htmlBody}
  <script>
    window.addEventListener('load', function() {
      setTimeout(function() {
        window.focus();
        window.print();
      }, 300);
    });
  <\/script>
</body>
</html>`;

    const blob = new Blob([fullDocument], { type: 'text/html;charset=utf-8' });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `Recibo_${sale.receiptNumber}_PAMDA_${isThermal ? 'Termica_80mm' : 'A4'}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(downloadUrl);

    setNotificationMsg('Arquivo de impressão baixado! Abra-o para imprimir imediatamente.');
    setTimeout(() => setNotificationMsg(''), 5000);
  };

  // Gerar texto puro para impressoras térmicas / Spooler / Bloco de Notas
  const generateThermalPlainText = () => {
    const lines = [
      '================================',
      '        PAMDA CASES B2B         ',
      `CNPJ: ${settings.cnpj}`,
      `Tel: ${settings.phone}`,
      'Curitiba - PR • B2B & DTF UV    ',
      '================================',
      '        CUPOM NÃO FISCAL        ',
      `RECIBO Nº: ${sale.receiptNumber}`,
      `Data: ${formatDate(sale.createdAt)}`,
      `Vendedor: ${sale.salespersonName}`,
      '--------------------------------',
      `CLIENTE: ${sale.customerName}`,
      sale.branchName ? `Filial: ${sale.branchName}` : '',
      `End: ${sale.branchAddressSnapshot || 'Retirada Balcão'}`,
      '--------------------------------',
      'QTD ITEM                TOTAL   ',
      ...sale.items.map((item) => {
        const nameTrunc = item.productName.substring(0, 16).padEnd(16);
        return `${item.quantity}x ${nameTrunc} R$ ${item.subtotal.toFixed(2)}`;
      }),
      '--------------------------------',
      `Total Itens: ${sale.itemsCount}`,
      `Subtotal: R$ ${sale.productsTotal.toFixed(2)}`,
      `Frete: R$ ${sale.shippingFeeCharged.toFixed(2)}`,
      sale.discount > 0 ? `Desconto: - R$ ${sale.discount.toFixed(2)}` : '',
      `TOTAL A PAGAR: R$ ${sale.totalAmount.toFixed(2)}`,
      '--------------------------------',
      isPaid
        ? '*** PAGAMENTO QUITADO ***\nForma: Pix / Liquidado'
        : `PAGAMENTO VIA PIX\nChave Pix: ${settings.pixKey}\nSaldo: R$ ${sale.pendingBalance.toFixed(2)}`,
      '================================',
      '   OBRIGADO PELA PREFERÊNCIA!   ',
      '   PAMDA CASES - B2B DTF UV     ',
      '================================',
    ].filter(Boolean);
    return lines.join('\n');
  };

  const handleCopyThermalText = () => {
    const text = generateThermalPlainText();
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setNotificationMsg('Texto do cupom copiado para a área de transferência!');
        setTimeout(() => setNotificationMsg(''), 4000);
      })
      .catch(() => {
        setNotificationMsg('Copie o texto exibido na visualização.');
      });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto bg-slate-900/60 backdrop-blur-xs">
      <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-4 sm:my-8 flex flex-col max-h-[92vh]">
        {/* Action Header - Hidden during print */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between px-4 sm:px-6 py-3 bg-slate-900 text-white gap-3 shrink-0 no-print">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm">Recibo Oficial B2B</span>
            <span className="text-xs bg-slate-800 text-slate-300 font-mono px-2 py-0.5 rounded font-bold">
              Nº {sale.receiptNumber}
            </span>
          </div>

          {/* Format Selector Toggle */}
          <div className="flex items-center bg-slate-800 p-1 rounded-xl gap-1 text-xs font-semibold self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setActiveFormat('a4')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                activeFormat === 'a4'
                  ? 'bg-blue-600 text-white font-bold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Padrão A4</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveFormat('thermal')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                activeFormat === 'thermal'
                  ? 'bg-emerald-600 text-white font-bold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>Térmica 80mm</span>
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handlePrintThermal}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer"
              title="Disparar caixa de impressão térmica 80mm"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir Térmica 80mm</span>
            </button>

            <button
              type="button"
              onClick={handlePrintStandard}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer"
              title="Disparar caixa de impressão padrão A4"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir Padrão A4</span>
            </button>

            <button
              type="button"
              onClick={() => handleDownloadPrintableFile(activeFormat)}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition-colors cursor-pointer border border-slate-700"
              title="Baixar arquivo HTML de impressão (abre direto a caixa de imprimir)"
            >
              <Download className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden sm:inline">Baixar Arquivo</span>
            </button>

            {activeFormat === 'thermal' && (
              <button
                type="button"
                onClick={handleCopyThermalText}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition-colors cursor-pointer border border-slate-700"
                title="Copiar texto do cupom térmico para colar em software de impressora POS"
              >
                <Copy className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">Copiar Texto</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors cursor-pointer ml-1"
              title="Fechar recibo"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Feedback de Notificação */}
        {notificationMsg && (
          <div className="bg-emerald-600 text-white text-xs font-semibold px-4 py-2 flex items-center justify-between no-print animate-fade-in">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4" />
              <span>{notificationMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setNotificationMsg('')}
              className="text-white/80 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Assistente de Impressão (exibido caso o navegador bloqueie janelas modais dentro do iframe) */}
        {showPrintBanner && (
          <div className="bg-amber-50 border-b border-amber-200 p-3 px-4 sm:px-6 text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2 no-print">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">A caixa de impressão não abriu automaticamente?</p>
                <p className="text-[11px] text-amber-800">
                  Navegadores podem restringir a janela de impressão dentro da pré-visualização. Clique em{' '}
                  <strong>"Baixar Arquivo p/ Impressão"</strong> para abrir a impressão em 1 clique ou copie o texto para seu software de bobina térmica.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleDownloadPrintableFile(activeFormat)}
                className="px-3 py-1 bg-amber-700 hover:bg-amber-800 text-white font-bold rounded-lg text-xs transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Baixar p/ Imprimir</span>
              </button>
              {activeFormat === 'thermal' && (
                <button
                  type="button"
                  onClick={handleCopyThermalText}
                  className="px-3 py-1 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold rounded-lg text-xs transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copiar Texto</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Scrollable Preview Area */}
        <div className="overflow-y-auto flex-1 p-4 sm:p-6 bg-slate-100 flex justify-center">
          {/* 1. VISUALIZAÇÃO PADRÃO A4 */}
          <div
            id="printable-receipt-a4"
            className={`${activeFormat === 'a4' ? 'block' : 'hidden'} w-full max-w-3xl bg-white p-6 sm:p-10 rounded-xl shadow-xs border border-slate-200 font-sans text-slate-800`}
          >
            {/* Header Row */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between pb-6 border-b border-slate-200 gap-4">
              <div>
                <div className="flex flex-col items-start gap-1">
                  <PamdaLogo size="md" variant="dark" />
                  <p className="text-xs text-slate-500 font-medium mt-1">
                    Soluções B2B em Capas & Personalização DTF UV
                  </p>
                </div>
                <div className="mt-3 text-xs text-slate-500 space-y-0.5">
                  <p>CNPJ: {settings.cnpj} • Telefone: {settings.phone}</p>
                  <p>Curitiba - Paraná • Atendimento B2B</p>
                </div>
              </div>

              <div className="text-left sm:text-right">
                <div className="inline-block bg-slate-100 border border-slate-300 rounded-lg px-4 py-2">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Recibo Oficial
                  </div>
                  <div className="text-2xl font-black text-slate-900 font-mono">
                    Nº {sale.receiptNumber}
                  </div>
                </div>
                <div className="mt-2 text-xs text-slate-600 font-medium">
                  Venda realizada em:{' '}
                  <span className="font-semibold text-slate-900">
                    {formatDate(sale.createdAt)}
                  </span>
                </div>
              </div>
            </div>

            {/* Customer & Branch Section */}
            <div className="py-5 grid grid-cols-1 md:grid-cols-2 gap-4 border-b border-slate-200 text-xs">
              <div className="space-y-1">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Dados do Cliente
                </span>
                <p className="font-bold text-slate-900 text-sm">{sale.customerName}</p>
                {sale.branchName && (
                  <p className="text-slate-700 font-medium">
                    Filial:{' '}
                    <span className="font-semibold text-blue-800">{sale.branchName}</span>
                  </p>
                )}
                <p className="text-slate-600">
                  Endereço de Entrega:{' '}
                  <span className="font-medium text-slate-900">
                    {sale.branchAddressSnapshot || 'Balcão / Retirada'}
                  </span>
                </p>
              </div>

              <div className="space-y-1 md:text-right">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Informações da Venda
                </span>
                <p className="text-slate-700">
                  Vendedor:{' '}
                  <span className="font-semibold text-slate-900">{sale.salespersonName}</span>
                </p>
                <p className="text-slate-700">
                  Origem:{' '}
                  <span className="font-medium capitalize text-slate-900">
                    {sale.origin.replace('_', ' ')}
                  </span>
                </p>
                <p className="text-slate-700">
                  Condição:{' '}
                  <span className="font-semibold text-slate-900 uppercase">
                    {sale.paymentPolicySnapshot.policyType.replace('_', ' ')}
                  </span>
                </p>
              </div>
            </div>

            {/* Items Table */}
            <div className="py-6 border-b border-slate-200">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-300 text-slate-500 uppercase font-semibold text-[11px]">
                    <th className="py-2 w-10">#</th>
                    <th className="py-2">Código</th>
                    <th className="py-2">Produto / Descrição</th>
                    <th className="py-2 text-center w-14">Qtd</th>
                    <th className="py-2 text-center w-12">Un</th>
                    <th className="py-2 text-right w-24">Vlr. Unit.</th>
                    <th className="py-2 text-right w-24">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sale.items.map((item, index) => (
                    <tr key={item.id} className="text-slate-800">
                      <td className="py-2.5 text-slate-400">{index + 1}</td>
                      <td className="py-2.5 font-mono text-slate-600 font-medium">
                        {item.productCode || item.sku}
                      </td>
                      <td className="py-2.5">
                        <div className="font-semibold text-slate-900">{item.productName}</div>
                        {item.productType === 'kit' && item.componentsSnapshot && (
                          <div className="text-[10px] text-slate-500 mt-0.5 space-x-1">
                            <span>Composição:</span>
                            {item.componentsSnapshot.map((c, i) => (
                              <span key={i} className="inline-block bg-slate-100 px-1 rounded">
                                {c.quantity}x {c.componentName}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 text-center font-bold">{item.quantity}</td>
                      <td className="py-2.5 text-center text-slate-500">{item.unit || 'UN'}</td>
                      <td className="py-2.5 text-right font-mono">
                        R$ {item.unitPrice.toFixed(2)}
                      </td>
                      <td className="py-2.5 text-right font-mono font-bold text-slate-900">
                        R$ {item.subtotal.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Summary and Pix Section */}
            <div className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              {/* Left Column: Totals */}
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-100 text-slate-600">
                  <span>Total de Itens:</span>
                  <span className="font-bold text-slate-900">{sale.itemsCount} itens</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 text-slate-600">
                  <span>Total dos Produtos:</span>
                  <span className="font-mono text-slate-900">
                    R$ {sale.productsTotal.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 text-slate-600">
                  <span>Frete Cobrado:</span>
                  <span className="font-mono text-slate-900">
                    R$ {sale.shippingFeeCharged.toFixed(2)}
                  </span>
                </div>
                {sale.discount > 0 && (
                  <div className="flex justify-between py-1 border-b border-slate-100 text-rose-600">
                    <span>Desconto Aplicado:</span>
                    <span className="font-mono">- R$ {sale.discount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between py-2 text-base font-black text-slate-950 border-t-2 border-slate-900">
                  <span>VALOR TOTAL:</span>
                  <span className="text-emerald-700 font-mono">
                    R$ {sale.totalAmount.toFixed(2)}
                  </span>
                </div>
                {sale.notes && (
                  <div className="mt-3 p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-slate-600 text-xs">
                    <span className="font-semibold text-slate-700">Obs: </span>
                    {sale.notes}
                  </div>
                )}
              </div>

              {/* Right Column: Pix or Paid Confirmation */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 flex flex-col items-center justify-center text-center">
                {isPaid ? (
                  <div className="space-y-2 py-4">
                    <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                      <CheckCircle2 className="w-7 h-7" />
                    </div>
                    <h3 className="text-sm font-extrabold text-emerald-800 uppercase tracking-wide">
                      Pagamento Confirmado
                    </h3>
                    <p className="text-xs text-slate-600">
                      Forma:{' '}
                      <span className="font-semibold text-slate-900">
                        {sale.amountPaid >= sale.totalAmount ? 'Pix / Quitado' : 'Pago'}
                      </span>
                    </p>
                    <p className="text-[11px] text-slate-500 font-mono">
                      Valor Recebido: R$ {sale.amountPaid.toFixed(2)}
                    </p>
                    <p className="text-[10px] text-emerald-700 font-medium">
                      Nenhum valor pendente neste recibo.
                    </p>
                  </div>
                ) : (
                  <div className="w-full space-y-3">
                    <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-slate-800 uppercase tracking-wide">
                      <QrCode className="w-4 h-4 text-blue-600" />
                      Pagamento via Pix
                    </div>

                    <div className="bg-white p-2.5 rounded-lg border border-slate-200 inline-block shadow-xs">
                      {qrCodeUrl ? (
                        <img
                          src={qrCodeUrl}
                          alt="QR Code Pix Pamda Cases"
                          className="w-36 h-36 mx-auto object-contain"
                        />
                      ) : (
                        <div className="w-36 h-36 flex items-center justify-center text-xs text-slate-400 bg-slate-100 rounded">
                          Gerando QR Code...
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="text-[11px] text-slate-500 font-medium">Chave Pix</div>
                      <div className="text-xs font-black text-slate-950 bg-slate-200/80 px-3 py-1 rounded-md inline-block select-all tracking-wide font-mono">
                        {settings.pixKey || 'capaspix@gmail.com'}
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-600">
                      Escaneie o QR Code ou use a chave Pix acima.
                    </p>
                    <div className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 py-1 px-2 rounded font-mono">
                      Saldo a Pagar: R$ {sale.pendingBalance.toFixed(2)}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer Receipt Note */}
            <div className="mt-8 pt-4 border-t border-slate-200 text-center text-[10px] text-slate-400">
              PAMDA CASES B2B • Documento Auxiliar de Venda / Ordem de Serviço • Gerado em tempo real
            </div>
          </div>

          {/* 2. VISUALIZAÇÃO TÉRMICA 80MM (Bobina Cupom) */}
          <div
            id="printable-receipt-thermal"
            className={`${activeFormat === 'thermal' ? 'block' : 'hidden'} w-[300px] max-w-[300px] bg-white p-4 rounded-xl shadow-md border border-slate-300 font-mono text-[11px] text-slate-900 leading-tight select-all`}
          >
            {/* Cabeçalho Térmico */}
            <div className="text-center pb-2 border-b border-dashed border-slate-400 space-y-0.5">
              <div className="flex justify-center pb-1">
                <PamdaLogo size="sm" variant="dark" showSubtitle={false} />
              </div>
              <p className="font-black text-xs uppercase tracking-wider">PAMDA CASES B2B</p>
              <p className="text-[10px] text-slate-600">CNPJ: {settings.cnpj}</p>
              <p className="text-[10px] text-slate-600">Tel: {settings.phone}</p>
              <p className="text-[10px] text-slate-500">Curitiba - PR • B2B & DTF UV</p>
            </div>

            {/* Identificação do Pedido */}
            <div className="py-2 border-b border-dashed border-slate-400 space-y-1">
              <div className="text-center font-bold text-xs uppercase bg-slate-100 py-0.5 rounded">
                CUPOM NÃO FISCAL
              </div>
              <div className="flex justify-between font-bold">
                <span>RECIBO Nº:</span>
                <span className="text-sm font-black">{sale.receiptNumber}</span>
              </div>
              <div className="flex justify-between text-[10px] text-slate-600">
                <span>Data/Hora:</span>
                <span>{formatDate(sale.createdAt)}</span>
              </div>
              <div className="text-[10px] text-slate-600">
                <span>Vendedor: </span>
                <span className="font-semibold text-slate-900">{sale.salespersonName}</span>
              </div>
            </div>

            {/* Cliente & Filial */}
            <div className="py-2 border-b border-dashed border-slate-400 space-y-0.5 text-[10px]">
              <p className="font-bold text-slate-900 uppercase">CLIENTE:</p>
              <p className="font-bold text-xs">{sale.customerName}</p>
              {sale.branchName && (
                <p className="text-slate-700">Filial: {sale.branchName}</p>
              )}
              <p className="text-slate-600 text-[9px] break-words">
                End: {sale.branchAddressSnapshot || 'Retirada Balcão'}
              </p>
            </div>

            {/* Itens do Pedido */}
            <div className="py-2 border-b border-dashed border-slate-400">
              <div className="flex justify-between font-bold text-[10px] pb-1 border-b border-slate-300">
                <span>QTD ITEM</span>
                <span>TOTAL</span>
              </div>
              <div className="divide-y divide-slate-200 divide-dotted py-1 space-y-1">
                {sale.items.map((item) => (
                  <div key={item.id} className="pt-1">
                    <div className="flex justify-between items-start">
                      <span className="font-bold">{item.quantity}x</span>
                      <span className="flex-1 px-1 break-words font-semibold">
                        {item.productName}
                      </span>
                      <span className="font-bold text-right">
                        R$ {item.subtotal.toFixed(2)}
                      </span>
                    </div>
                    <div className="text-[9px] text-slate-500 pl-4">
                      Unit: R$ {item.unitPrice.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Totais do Recibo */}
            <div className="py-2 border-b border-dashed border-slate-400 space-y-1 text-right text-xs">
              <div className="flex justify-between text-slate-600 text-[10px]">
                <span>Itens:</span>
                <span className="font-bold">{sale.itemsCount}</span>
              </div>
              <div className="flex justify-between text-slate-600 text-[10px]">
                <span>Subtotal Produtos:</span>
                <span>R$ {sale.productsTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-600 text-[10px]">
                <span>Frete / Entrega:</span>
                <span>R$ {sale.shippingFeeCharged.toFixed(2)}</span>
              </div>
              {sale.discount > 0 && (
                <div className="flex justify-between text-rose-600 text-[10px]">
                  <span>Desconto:</span>
                  <span>- R$ {sale.discount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-black pt-1 border-t border-slate-400 text-slate-950">
                <span>TOTAL A PAGAR:</span>
                <span>R$ {sale.totalAmount.toFixed(2)}</span>
              </div>
            </div>

            {/* Pagamento ou Pix Térmico */}
            <div className="py-3 text-center space-y-2">
              {isPaid ? (
                <div className="py-2 bg-slate-50 border border-slate-300 rounded text-center space-y-0.5">
                  <p className="font-black text-xs text-emerald-800">*** PAGAMENTO QUITADO ***</p>
                  <p className="text-[10px] text-slate-700">Valor Pago: R$ {sale.amountPaid.toFixed(2)}</p>
                  <p className="text-[9px] text-slate-500">Recibo liquidado com sucesso</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <p className="font-bold text-[10px] uppercase tracking-wider">
                    PAGAMENTO VIA PIX:
                  </p>
                  {qrCodeUrl && (
                    <div className="inline-block p-1 bg-white border border-slate-300 rounded mx-auto">
                      <img
                        src={qrCodeUrl}
                        alt="QR Code Pix"
                        className="w-28 h-28 mx-auto object-contain"
                      />
                    </div>
                  )}
                  <p className="text-[9px] text-slate-600">Chave Pix:</p>
                  <p className="text-[10px] font-black bg-slate-100 py-0.5 px-1 rounded select-all">
                    {settings.pixKey || 'capaspix@gmail.com'}
                  </p>
                  <p className="font-bold text-xs text-rose-800">
                    Saldo: R$ {sale.pendingBalance.toFixed(2)}
                  </p>
                </div>
              )}

              {sale.notes && (
                <div className="text-[9px] text-slate-600 text-left border-t border-slate-200 pt-1">
                  <strong>Obs:</strong> {sale.notes}
                </div>
              )}

              <div className="pt-2 border-t border-dashed border-slate-400 text-[9px] text-slate-500 space-y-0.5">
                <p className="font-bold">OBRIGADO PELA PREFERÊNCIA!</p>
                <p>PAMDA CASES - B2B & Personalização</p>
                <p>================================</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
