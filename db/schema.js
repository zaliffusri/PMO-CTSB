import { store, resetLocalDemoData } from './store.js';
import { DEMO_SEED_VERSION, runRichDemoSeed } from './demoSeed.js';
import { hasSupabase } from './runtime/config.js';

export function initDb() {
  // No-op; store uses in-memory or Supabase
}

export async function seedDemo() {
  if (hasSupabase) return;
  if (process.env.ALLOW_LOCAL_STORE !== '1') return;

  const force = process.env.SEED_DEMO_FORCE === '1';
  const settings = await store.getSettings();
  const version = Number(settings.demo_seed_version || 0);

  if (!force && version >= DEMO_SEED_VERSION) return;

  if (force || version < DEMO_SEED_VERSION) {
    resetLocalDemoData();
    await runRichDemoSeed(store);
    await store.updateSettings({ demo_seed_version: DEMO_SEED_VERSION });
    console.log(
      `[demo] Loaded sample data (v${DEMO_SEED_VERSION}). ` +
      'Login: admin@pmo.local / admin123 | pmo@pmo.local / pmo123 | finance@pmo.local / finance123',
    );
  }
}
