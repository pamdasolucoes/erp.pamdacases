import QRCode from 'qrcode';
import { PaymentMethod } from '../types/erp';

export interface PixPayloadData {
  pixKey: string;
  beneficiaryName: string;
  amount: number;
  city?: string;
  txId?: string;
}

export interface PaymentWebhookPayload {
  eventId: string;
  externalPaymentId: string;
  amount: number;
  paidAt: string;
  receiptNumber: number;
  paymentMethod: PaymentMethod;
  payerName?: string;
}

class PaymentService {
  private processedEvents = new Set<string>();

  // Gera a chave e código Pix formatado (Payload padrão BR Code simulado/formatado)
  public generatePixPayload(data: PixPayloadData): string {
    const cleanKey = data.pixKey.trim();
    const cleanName = data.beneficiaryName.toUpperCase().slice(0, 25);
    const cleanCity = (data.city || 'CURITIBA').toUpperCase().slice(0, 15);
    const formattedAmount = data.amount > 0 ? data.amount.toFixed(2) : '0.00';
    const txId = (data.txId || 'PAMDA' + Date.now().toString().slice(-6)).toUpperCase();

    // Payload Pix simplificado no formato estático EMV
    return `00020126580014BR.GOV.BCB.PIX0136${cleanKey}520400005303986540${formattedAmount.length}${formattedAmount}5802BR5913${cleanName}6008${cleanCity}62150511${txId}6304`;
  }

  // Gera a imagem do QR Code em Base64 Data URL
  public async generateQrCodeDataUrl(text: string): Promise<string> {
    try {
      const dataUrl = await QRCode.toDataURL(text, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 220,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      });
      return dataUrl;
    } catch (err) {
      console.error('Erro ao gerar QRCode:', err);
      return '';
    }
  }

  // Verificação de idempotência para webhooks (evita processamento duplicado)
  public isEventAlreadyProcessed(eventId: string): boolean {
    return this.processedEvents.has(eventId);
  }

  public markEventAsProcessed(eventId: string) {
    this.processedEvents.add(eventId);
  }
}

export const paymentService = new PaymentService();
