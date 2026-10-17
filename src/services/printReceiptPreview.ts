export function receiptPrintHtml(element: HTMLElement, origin: string, title: string) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <base href="${new URL(origin).origin}/">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    @page { margin: 5mm; }
    html, body { margin: 0; padding: 0; background: #fff; color: #000; }
    body { font-family: Arial, Roboto, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { width: 100%; }
    img { max-width: 100%; }
  </style>
</head>
<body><div class="pamda-receipt-container">${element.outerHTML}</div></body>
</html>`;
}

export async function printReceiptDocument(
  element: HTMLElement,
  title = 'Recibo PAMDA Cases',
  frameId = 'pamda-receipt-print-frame',
) {
  document.getElementById(frameId)?.remove();
  await document.fonts.ready;
  await Promise.allSettled([...element.querySelectorAll('img')].map(image => image.decode()));
  const frame = document.createElement('iframe');
  frame.id = frameId;
  frame.name = frameId;
  frame.title = 'Impressão do recibo';
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden';

  const loaded = new Promise<void>((resolve, reject) => {
    frame.onload = () => resolve();
    frame.onerror = () => reject(new Error('Não foi possível preparar o documento para impressão.'));
  });
  frame.srcdoc = receiptPrintHtml(element, window.location.origin, title);
  document.body.appendChild(frame);
  await loaded;

  const target = frame.contentWindow;
  if (!target) throw new Error('Não foi possível abrir a impressão do recibo.');
  await target.document.fonts.ready;
  await Promise.allSettled([...target.document.images].map(image => image.decode()));
  if (!frame.isConnected) return;
  target.focus();
  target.print();
}

export function previewPrintHtml(element: HTMLElement, origin: string) {
  return receiptPrintHtml(element, origin, 'Recibo PAMDA');
}

export function printReceiptPreview(element: HTMLElement) {
  return printReceiptDocument(
    element,
    'Recibo PAMDA',
    'pamda-preview-print-frame',
  );
}
