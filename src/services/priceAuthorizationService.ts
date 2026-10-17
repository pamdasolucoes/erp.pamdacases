import { supabase } from './supabase';
import { PriceAuthorizationService } from './priceAuthorization';
export const priceAuthorizationService = new PriceAuthorizationService(supabase);
