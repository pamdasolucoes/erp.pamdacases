import { CoreService } from './core';
import { supabase } from './supabase';
export const coreService = new CoreService(supabase);
