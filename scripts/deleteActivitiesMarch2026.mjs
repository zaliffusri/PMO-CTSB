/**
 * Deletes activities whose time range overlaps March 2026 (UTC).
 * Overlap: start_at < 2026-04-01 UTC AND end_at > 2026-03-01 UTC
 *
 * Run from repo root (requires .env with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY):
 *   node scripts/deleteActivitiesMarch2026.mjs
 *
 * Dry run (no delete):
 *   DRY_RUN=1 node scripts/deleteActivitiesMarch2026.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dryRun = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

const MONTH_START = '2026-03-01T00:00:00.000Z';
const MONTH_END_EXCLUSIVE = '2026-04-01T00:00:00.000Z';

if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (set in .env or environment).');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const { data: rows, error: selErr } = await supabase
    .from('activities')
    .select('id, title, start_at, end_at, person_id')
    .lt('start_at', MONTH_END_EXCLUSIVE)
    .gt('end_at', MONTH_START);

  if (selErr) {
    console.error('Select failed:', selErr.message);
    process.exit(1);
  }

  const list = rows || [];
  console.log(`Found ${list.length} activity row(s) overlapping March 2026 (UTC).`);
  if (list.length === 0) {
    process.exit(0);
  }

  if (dryRun) {
    console.log('DRY_RUN=1 — no rows deleted. First few:', list.slice(0, 5));
    process.exit(0);
  }

  const { error: delErr, count } = await supabase
    .from('activities')
    .delete({ count: 'exact' })
    .lt('start_at', MONTH_END_EXCLUSIVE)
    .gt('end_at', MONTH_START);

  if (delErr) {
    console.error('Delete failed:', delErr.message);
    process.exit(1);
  }

  console.log(`Deleted ${count ?? list.length} row(s) from activities.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
