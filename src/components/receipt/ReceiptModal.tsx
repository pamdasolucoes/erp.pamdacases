import React, { useState, useEffect } from 'react';
import { Sale, AppSettings } from '../../types/erp';
import { dbService } from '../../services/db';
import {
  Printer,
  X,
  AlertCircle,
} from 'lucide-react';
import { ReceiptDocument } from './ReceiptDocument';
import { legacyReceiptData } from '../../services/legacyReceipt';
import { printReceiptDocument } from '../../services/printReceiptPreview';

interface ReceiptModalProps {
  sale: Sale | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ sale, isOpen, onClose }) => {
  const [settings, setSettings] = useState<AppSettings>(dbService.getSettings());
  const [printError, setPrintError] = useState('');

  useEffect(() => {
    setSettings(dbService.getSettings());
    setPrintError('');
  }, [isOpen]);

  if (!isOpen || !sale) return null;

  const handlePrint = () => {
    setPrintError('');
    const receipt = document.querySelector<HTMLElement>('#printable-receipt .pamda-receipt');
    if (!receipt) {
      setPrintError('Não foi possível preparar o recibo para impressão.');
      return;
    }
    void printReceiptDocument(
      receipt,
      `Recibo ${sale.receiptNumber} - PAMDA CASES`,
      'pamda-legacy-print-frame',
    ).catch(() => {
      setPrintError('Não foi possível abrir a impressão. Confira as permissões do navegador.');
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto bg-slate-900/60 backdrop-blur-xs">
      <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-4 sm:my-8 flex flex-col max-h-[92vh]">
        {/* Action Header - Hidden during print */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between px-4 sm:px-6 py-3 bg-slate-900 text-white gap-3 shrink-0 no-print">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm">Recibo de demonstração</span>
            <span className="text-xs bg-slate-800 text-slate-300 font-mono px-2 py-0.5 rounded font-bold">
              Nº {sale.receiptNumber}
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer"
              onClick={handlePrint}
              title="Abrir as opções de impressão do navegador"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir Recibo</span>
            </button>

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

        {printError && (
          <div role="alert" className="bg-amber-50 border-b border-amber-200 p-3 px-4 sm:px-6 text-xs text-amber-900 flex items-center gap-2 no-print">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{printError}</span>
          </div>
        )}

        <div className="overflow-y-auto flex-1 p-4 sm:p-6 bg-slate-100 flex justify-center">
          <div id="printable-receipt" className="w-full"><ReceiptDocument data={legacyReceiptData(sale, settings)} /></div>
        </div>
      </div>
    </div>
  );
};