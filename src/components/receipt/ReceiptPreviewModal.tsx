import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import type { ReceiptDocumentData } from '../../types/receipt';
import { ReceiptDocument } from './ReceiptDocument';
import { printReceiptPreview } from '../../services/printReceiptPreview';

export function ReceiptPreviewModal({data,onClose}:{data:ReceiptDocumentData;onClose():void}) {
  const [error,setError]=useState('');
  const paper=useRef<HTMLDivElement>(null); const closeButton=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    const focused=document.activeElement as HTMLElement|null; const overflow=document.body.style.overflow;
    document.body.style.overflow='hidden'; closeButton.current?.focus();
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();onClose();}
      if(event.key==='Tab'){
        const buttons=[...document.querySelectorAll<HTMLButtonElement>('#pamda-receipt-preview-overlay button:not(:disabled)')];
        const first=buttons[0],last=buttons[buttons.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    };
    window.addEventListener('keydown',onKey);
    return()=>{window.removeEventListener('keydown',onKey);document.body.style.overflow=overflow;document.getElementById('pamda-preview-print-frame')?.remove();focused?.focus();};
  },[onClose]);
  return createPortal(<div id="pamda-receipt-preview-overlay" className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
    <div role="dialog" aria-modal="true" aria-label="Prévia do recibo" className="receipt-preview-shell w-full max-w-4xl max-h-[94vh] bg-white rounded-2xl flex flex-col overflow-hidden shadow-2xl">
    <div className="receipt-preview-controls p-4 bg-slate-900 text-white"><div className="flex flex-wrap gap-2 items-center">
      <button type="button" onClick={()=>{if(paper.current) void printReceiptPreview(paper.current).catch(()=>setError('Não foi possível abrir a impressão. Confira as permissões do navegador.'));}} className="rounded-lg px-3 py-2 bg-emerald-600 text-xs font-bold flex items-center gap-2"><Printer className="w-4 h-4" />Imprimir Recibo</button>
      <button ref={closeButton} type="button" onClick={onClose} className="rounded-lg px-3 py-2 bg-slate-700 text-xs font-bold flex items-center gap-2"><X className="w-4 h-4" />Fechar e editar venda</button>
    </div>{error&&<p role="alert" className="text-sm">{error}</p>}</div>
    <div className="receipt-preview-scroll overflow-auto bg-slate-100 p-2 sm:p-6 flex-1"><div ref={paper} id="pamda-receipt-preview-paper" className="mx-auto bg-white w-full" style={{maxWidth:'190mm'}}><ReceiptDocument data={data} /></div></div>
    </div>
  </div>,document.body);
}
