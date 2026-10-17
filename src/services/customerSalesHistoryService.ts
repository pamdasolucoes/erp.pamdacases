import { supabase } from './supabase';
import { CustomerSalesHistoryService } from './customerSalesHistory';
export const customerSalesHistoryService = new CustomerSalesHistoryService(supabase);
