import { useCallback, useEffect, useState } from 'react';
import type { OfficialProduct } from '../types/productCatalog';
import { productService } from '../services/productService';

export function useProducts() {
  const [products, setProducts] = useState<readonly OfficialProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setProducts([]);
    productService.list(controller.signal).then(rows => { if (!controller.signal.aborted) setProducts(rows); })
      .catch(reason => { if (!controller.signal.aborted) { setProducts([]); setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o catálogo.'); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);
  const reload = useCallback(() => setRevision(value => value + 1), []);
  return { products, loading, error, reload };
}
