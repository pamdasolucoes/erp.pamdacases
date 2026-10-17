import { CustomersService } from './customers';
import { supabase } from './supabase';

export const customerService = new CustomersService(supabase,{branchPrimaryEnabled:import.meta.env.VITE_CUSTOMER_BRANCHES_PRIMARY_ENABLED==='true'});
