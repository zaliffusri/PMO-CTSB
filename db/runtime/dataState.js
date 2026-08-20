/**
 * Data state for LOCAL DEV only (ALLOW_LOCAL_STORE=1).
 * Production / Supabase mode is stateless — repositories query Postgres directly.
 * No process-wide snapshot load on cold start.
 */
import { allowLocalStore, hasSupabase } from './config.js';
import { emptyData } from './helpers.js';

let data = emptyData();

export function getData() {
  return data;
}

/** Local-only: no-op for DB mode (writes go straight to Supabase). */
export function save() {
  // Intentionally empty — persistence is per-repository via Supabase / pg.
}

export async function reloadFromSupabase() {
  // Stateless mode: nothing to reload into memory.
  return false;
}

export async function initDataState() {
  data = emptyData();
  if (hasSupabase && !allowLocalStore) {
    // Production path: empty in-memory shell; repositories use Supabase.
    return { getData, save, reloadFromSupabase, mode: 'db' };
  }
  return { getData, save, reloadFromSupabase, mode: 'local' };
}

export function resetLocalDemoData() {
  if (!allowLocalStore) return false;
  data = emptyData();
  return true;
}

export function isLocalStoreMode() {
  return allowLocalStore && !hasSupabase;
}

export function isDbStoreMode() {
  return hasSupabase;
}
