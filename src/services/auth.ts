import { AuthService } from './authService';
import { supabase, supabaseConfigurationError } from './supabase';

export const authService = new AuthService(supabase, supabaseConfigurationError, import.meta.hot?.data.pamdaValidatedUser || null);
if (import.meta.hot) import.meta.hot.dispose(data => {
  data.pamdaValidatedUser=authService.getError()?null:authService.getCurrentUser();
  authService.dispose();
});
