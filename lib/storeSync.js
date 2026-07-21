import { store } from '../db/store.js';

/** Reload in-memory store from Supabase (warm serverless instances). */
export async function reloadStore() {
  try {
    await store.reloadFromSupabase();
  } catch (e) {
    console.warn('store reload:', e?.message || e);
  }
}

/**
 * Persist full snapshot. On failure, send 500 and return false.
 * @returns {Promise<boolean>}
 */
export async function persistStore(res, { soft = false } = {}) {
  try {
    await store.persistToSupabase();
    return true;
  } catch (e) {
    const detail = e?.message || String(e);
    console.warn('store persist:', detail);
    if (soft) return false;
    res.status(500).json({ error: `Failed to save: ${detail}` });
    return false;
  }
}
