/**
 * Browser Supabase client for Realtime only.
 * Uses Vite public env (anon key). Never the service role key.
 * WebSockets connect to Supabase directly — not through Vercel.
 */

export function getSupabaseBrowserConfig() {
  const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '').trim();
  const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (!supabaseUrl || !anonKey) return null;
  return { supabaseUrl, anonKey };
}

/**
 * @param {{ accessToken?: string|null }} [opts]
 * accessToken — short-lived JWT with app_user_id (from /api/auth/me) so RLS allows own rows.
 */
export async function createRealtimeClient({ accessToken } = {}) {
  const cfg = getSupabaseBrowserConfig();
  if (!cfg) {
    throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
  }
  const { createClient } = await import('@supabase/supabase-js');
  const options = {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  };
  if (accessToken) {
    options.global = {
      headers: { Authorization: `Bearer ${accessToken}` },
    };
  }
  const client = createClient(cfg.supabaseUrl, cfg.anonKey, options);
  if (accessToken && client.realtime?.setAuth) {
    await client.realtime.setAuth(accessToken);
  }
  return client;
}
