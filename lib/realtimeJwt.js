/**
 * Mint short-lived Supabase JWTs for browser Realtime (RLS-scoped).
 * Uses SUPABASE_JWT_SECRET (Project Settings → API → JWT Secret).
 * Never embeds session bearer tokens or service_role keys.
 */
import crypto from 'crypto';

function b64url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * @param {{ userId: number|string, ttlSeconds?: number }} opts
 * @returns {{ token: string, expiresAt: string, expiresIn: number } | null}
 */
export function mintSupabaseRealtimeJwt({ userId, ttlSeconds = 3600 } = {}) {
  const secret = String(process.env.SUPABASE_JWT_SECRET || '').trim();
  if (!secret || userId == null || userId === '') return null;

  const now = Math.floor(Date.now() / 1000);
  const exp = now + Math.max(60, Math.min(Number(ttlSeconds) || 3600, 3600 * 6));
  const uid = String(userId);

  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    aud: 'authenticated',
    role: 'authenticated',
    // Prefer app_user_id for RLS (see notifications_own_* policies).
    app_user_id: uid,
    sub: uid,
    iat: now,
    exp,
  };

  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = crypto.createHmac('sha256', secret).update(signingInput).digest();
  const token = `${signingInput}.${b64url(sig)}`;

  return {
    token,
    expiresAt: new Date(exp * 1000).toISOString(),
    expiresIn: exp - now,
  };
}

export function realtimeConfigAvailable() {
  return Boolean(
    String(process.env.SUPABASE_URL || '').trim()
    && String(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim()
    && String(process.env.SUPABASE_JWT_SECRET || '').trim(),
  );
}
