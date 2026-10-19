import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { SessionCatalog } from '../services/sessionCatalog';

export function useCatalog<T>(resource: SessionCatalog<T>) {
  const state = useSyncExternalStore(resource.subscribe, resource.getSnapshot, resource.getSnapshot);
  useEffect(() => { void resource.load().catch(() => {}); }, [resource]);
  return { ...state, loading: state.data === null && !state.error, refreshing: state.loading && state.data !== null,
    reload: useCallback(() => { void resource.load(true).catch(() => {}); }, [resource]) };
}
