import { store } from '../db/store.js';

/**
 * Legacy reload hook — no-op in stateless DB mode.
 * Kept so routes that call reloadStore() remain valid.
 */
export async function reloadStore() {
  try {
    await store.reloadFromSupabase();
  } catch (e) {
    console.warn('store reload:', e?.message || e);
  }
}

/**
 * Legacy persist hook — no-op success in DB mode (repos write directly).
 * On failure, send 500 and return false.
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
