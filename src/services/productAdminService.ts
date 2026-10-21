import { ProductAdminService } from './productAdmin';
import { supabase } from './supabase';
import { authService } from './auth';
import { productCatalog } from './catalogResources';
export const productAdminService = new ProductAdminService(supabase, () => authService.getError() ? null : authService.getCurrentUser(), () => productCatalog.invalidate());
