/**
 * Direct Postgres access for multi-statement transactions.
 * Uses SUPABASE_DB_URL / DATABASE_URL (same as migrations).
 * Falls back to null when unset — callers should use supabase-js for single-table ops.
 */
import pg from 'pg';
import { getSupabaseDbUrl } from '../../lib/dbConnection.js';

const { Pool } = pg;

let pool = null;
let poolInitFailed = false;

export function getPgPool() {
  if (pool) return pool;
  if (poolInitFailed) return null;
  const connectionString = getSupabaseDbUrl();
  if (!connectionString) return null;
  try {
    pool = new Pool({
      connectionString,
      ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
      max: 4,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 8_000,
    });
    pool.on('error', (err) => {
      console.warn('pg pool error:', err?.message || err);
    });
    return pool;
  } catch (e) {
    poolInitFailed = true;
    console.warn('pg pool init failed:', e?.message || e);
    return null;
  }
}

export function hasPgPool() {
  return Boolean(getPgPool());
}

/**
 * Run work inside BEGIN/COMMIT. Rolls back on throw.
 * @template T
 * @param {(client: import('pg').PoolClient) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withTransaction(fn) {
  const p = getPgPool();
  if (!p) {
    throw new Error(
      'Database transactions require SUPABASE_DB_URL (or DATABASE_URL). Set it for promote/purge flows.',
    );
  }
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}

/** Convenience: run a single parameterized query on the pool. */
export async function pgQuery(text, params = []) {
  const p = getPgPool();
  if (!p) throw new Error('Postgres pool unavailable (set SUPABASE_DB_URL)');
  return p.query(text, params);
}
