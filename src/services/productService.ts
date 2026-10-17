import { supabase } from './supabase';
import { ProductsService } from './products';
export const productService = new ProductsService(supabase);
