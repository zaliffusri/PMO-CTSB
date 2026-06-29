import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = process.env.SUPABASE_URL;
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const hasSupabase = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
export const allowLocalStore = process.env.ALLOW_LOCAL_STORE === '1';

if (!hasSupabase && !allowLocalStore) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (or set ALLOW_LOCAL_STORE=1)');
}

export const supabase = hasSupabase
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;
