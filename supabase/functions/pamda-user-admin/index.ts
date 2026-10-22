import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.117.2';
import {createUserAdminHandler} from './handler.ts';
Deno.serve(createUserAdminHandler({url:Deno.env.get('SUPABASE_URL')!,key:Deno.env.get('SUPABASE_ANON_KEY')!,secret:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,createClient}));
