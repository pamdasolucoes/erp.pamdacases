import type { SupabaseClient } from '@supabase/supabase-js';
import type { OfficialCustomer } from '../types/pamdaCore';
type Change = { client: SupabaseClient | null; userId: string; customer?: OfficialCustomer };
const listeners = new Set<(change: Change) => void>();
export function customerCatalogChanged(change: Change) { for (const listener of listeners) listener(change); }
export function subscribeCustomerCatalog(listener: (change: Change) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
