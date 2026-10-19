import { supabase } from './supabase';
import { CustomerAdminService } from './customerAdmin';
export const customerAdminService = new CustomerAdminService(supabase);
