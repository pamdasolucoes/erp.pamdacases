import { useCallback, useEffect, useState } from 'react';
import type { OfficialCustomer } from '../types/pamdaCore';
import { customerService } from '../services/customerService';

export function useCustomers() {
  const [customers, setCustomers] = useState<readonly OfficialCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    customerService.list(controller.signal).then(rows => {
      if (!controller.signal.aborted) setCustomers(rows);
    }).catch(error => {
      if (!controller.signal.aborted) { setCustomers([]); setError(error instanceof Error ? error.message : 'Não foi possível carregar os clientes.'); }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);
  const reload = useCallback(() => setRevision(value => value + 1), []);
  const acceptUpdated = useCallback((updated: OfficialCustomer) => {
    setCustomers(rows => rows.some(row => row.id === updated.id) ? rows.map(row => row.id === updated.id ? updated : row) : [...rows, updated]);
  }, []);
  return { customers, loading, error, reload, acceptUpdated };
}
