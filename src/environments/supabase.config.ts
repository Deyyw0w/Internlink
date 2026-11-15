import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from './environment';

const supabaseUrl = environment.supabaseUrl;
const supabaseAnonKey = environment.supabaseAnonKey;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[Supabase] Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment. ' +
      'Copy src/environments/environment.template.ts to environment.ts and fill in your Supabase credentials.',
  );
}

const browserStorage = typeof sessionStorage !== 'undefined' ? sessionStorage : undefined;

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: browserStorage as unknown as Storage,
  },
});
