import { supabase } from './supabase';
import { PaymentsService } from './payments';
export const paymentsService = new PaymentsService(supabase);
