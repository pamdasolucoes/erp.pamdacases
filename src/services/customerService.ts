import { CustomersService } from './customers';
import { supabase } from './supabase';

export const customerService = new CustomersService(supabase);
