import { productCatalog } from '../services/catalogResources';
import { useCatalog } from './useCatalog';

export function useProducts() {
  const { data, loading, refreshing, error, reload } = useCatalog(productCatalog);
  return { products: data || [], loading, refreshing, error, reload };
}
