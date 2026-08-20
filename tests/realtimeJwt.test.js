import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mintSupabaseRealtimeJwt, realtimeConfigAvailable } from '../lib/realtimeJwt.js';

describe('realtimeJwt', () => {
  const prev = { ...process.env };

  beforeEach(() => {
    process.env.SUPABASE_JWT_SECRET = 'test-secret-for-jwt-hs256';
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-public-key';
  });

  afterEach(() => {
    process.env = { ...prev };
  });

  it('mints a three-part JWT with app_user_id claim', () => {
    const minted = mintSupabaseRealtimeJwt({ userId: 7, ttlSeconds: 120 });
    expect(minted).toBeTruthy();
    expect(minted.token.split('.')).toHaveLength(3);
    const payload = JSON.parse(Buffer.from(minted.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    expect(payload.app_user_id).toBe('7');
    expect(payload.role).toBe('authenticated');
    expect(payload.sub).toBe('7');
  });

  it('returns null without secret', () => {
    delete process.env.SUPABASE_JWT_SECRET;
    expect(mintSupabaseRealtimeJwt({ userId: 1 })).toBeNull();
  });

  it('reports config availability', () => {
    expect(realtimeConfigAvailable()).toBe(true);
    delete process.env.SUPABASE_ANON_KEY;
    expect(realtimeConfigAvailable()).toBe(false);
  });
});
