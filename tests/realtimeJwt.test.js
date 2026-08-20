import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mintSupabaseRealtimeJwt } from '../lib/realtimeJwt.js';

describe('realtimeJwt', () => {
  const prevSecret = process.env.SUPABASE_JWT_SECRET;

  beforeEach(() => {
    process.env.SUPABASE_JWT_SECRET = 'test-secret-for-jwt-hs256';
  });

  afterEach(() => {
    if (prevSecret === undefined) delete process.env.SUPABASE_JWT_SECRET;
    else process.env.SUPABASE_JWT_SECRET = prevSecret;
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
});
