import { useCallback, useEffect, useState } from 'react';
import type { CustomerCommercialContext } from '../types/core';
import { coreService } from '../services/coreService';

export function useCommercialContext(userId: string, customerId: string, branchId: string) {
  const key = `${userId}:${customerId}:${branchId}`;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; data: CustomerCommercialContext | null; error: string; loading: boolean }>({ key: '', data: null, error: '', loading: false });
  const reload = useCallback(() => setAttempt(value => value + 1), []);
  useEffect(() => {
    let alive = true;
    setState({ key, data: null, error: '', loading: !!customerId && !!branchId });
    if (customerId && branchId) void coreService.context(userId, customerId, branchId).then(
      data => { if (alive) setState({ key, data, error: '', loading: false }); },
      error => { if (alive) setState({ key, data: null, error: error instanceof Error ? error.message : 'Não foi possível consultar as condições comerciais.', loading: false }); },
    );
    return () => { alive = false; };
  }, [key, attempt]);
  return { ...(state.key === key ? state : { data: null, error: '', loading: !!customerId && !!branchId }), reload };
}
