import { customerCatalog } from '../services/catalogResources';
import { useCatalog } from './useCatalog';

export function useCustomers() {
  const { data, loading, refreshing, error, reload } = useCatalog(customerCatalog);
  return { customers: data || [], loading, refreshing, error, reload };
}
