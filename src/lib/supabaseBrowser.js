/**
 * Browser Supabase client for Realtime only (anon key + short-lived user JWT).
 * Never uses the service role key.
 * Dynamic-import keeps the main bundle lighter until the bell connects.
 */

/**
 * @param {{ supabaseUrl: string, anonKey: string, accessToken: string }} cfg
 */
export async function createRealtimeClient({ supabaseUrl, anonKey, accessToken }) {
  if (!supabaseUrl || !anonKey || !accessToken) {
    throw new Error('Missing Realtime client config');
  }
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(supabaseUrl, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}
