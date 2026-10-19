import { useCallback, useEffect, useState } from 'react';
import type { PaymentCatalog } from '../types/payments';
import { paymentsService } from '../services/paymentsService';

export function usePaymentCatalog(userId: string) {
  const [data, setData] = useState<PaymentCatalog | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true), [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setData(null); setError(''); setLoading(true);
    paymentsService.catalog(userId, controller.signal).then(value => { if (!controller.signal.aborted) setData(value); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Falha na consulta de pagamento.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [userId, revision]);
  return { data, error, loading, reload: useCallback(() => setRevision(value => value + 1), []) };
}
