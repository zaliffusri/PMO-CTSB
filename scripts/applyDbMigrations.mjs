/**
 * Apply Supabase schema scripts in order — schema only.
 *
 * Strict mode (default): records each applied file in public.schema_migrations
 * and skips files already recorded. Safe for CI/CD.
 *
 * Options (CLI or env):
 *   --skip-push              Skip supabase/push_schema_updates.sql
 *   --from=20260627          Only consider migration files with prefix >= that string
 *   --dry-run                List pending files; do not execute
 *   --baseline               Mark ALL selected files applied without executing
 *   --force                  Re-run all selected files even if already recorded
 *   DB_MIGRATE_SKIP_PUSH=1
 *   DB_MIGRATE_FROM=
 *   DB_MIGRATE_BASELINE=1
 *   DB_MIGRATE_DRY_RUN=1
 *   DB_MIGRATE_BASELINE_BEFORE=20260820180000
 *     When auto-baselining an initialized DB, only mark files with basename < this
 *     timestamp; newer files still execute.
 *
 * Examples:
 *   npm run db:migrate
 *   npm run db:migrate -- --dry-run
 *   npm run db:migrate -- --baseline
 *   npm run db:migrate:features
 */
import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';
import { getSupabaseDbUrl } from '../lib/dbConnection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

dotenv.config({ path: path.join(root, '.env') });

const args = process.argv.slice(2);
const skipPush = args.includes('--skip-push') || process.env.DB_MIGRATE_SKIP_PUSH === '1';
const dryRun = args.includes('--dry-run') || process.env.DB_MIGRATE_DRY_RUN === '1';
const baselineAll = args.includes('--baseline') || process.env.DB_MIGRATE_BASELINE === '1';
const force = args.includes('--force') || process.env.DB_MIGRATE_FORCE === '1';
const fromArg = args.find((a) => a.startsWith('--from='));
const fromPrefix = fromArg ? fromArg.slice('--from='.length) : (process.env.DB_MIGRATE_FROM || '');
/** Files with basename timestamp >= this still run after auto-baseline. */
const baselineBefore = process.env.DB_MIGRATE_BASELINE_BEFORE || '20260820180000';

const dbUrl = getSupabaseDbUrl();

if (!dbUrl) {
  console.error(
    'Missing SUPABASE_DB_URL (or DATABASE_URL) in .env.\n' +
      'Supabase → Project Settings → Database → Connection string → URI (Session pooler).\n' +
      'Or run SQL files manually in the SQL Editor.',
  );
  process.exit(1);
}

function migrationId(absPath) {
  return path.relative(root, absPath).replace(/\\/g, '/');
}

function checksum(sql) {
  return createHash('sha256').update(sql).digest('hex').slice(0, 16);
}

function fileTimestamp(absPath) {
  const base = path.basename(absPath);
  const m = base.match(/^(\d{14})_/);
  return m ? m[1] : null;
}

function migrationFiles() {
  const push = path.join(root, 'supabase', 'push_schema_updates.sql');
  const dir = path.join(root, 'supabase', 'migrations');
  let sorted = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  if (fromPrefix) {
    sorted = sorted.filter((f) => f >= fromPrefix);
  }
  const files = skipPush ? sorted.map((f) => path.join(dir, f)) : [push, ...sorted.map((f) => path.join(dir, f))];
  return files;
}

const ENSURE_TRACKING = `
create table if not exists public.schema_migrations (
  id text primary key,
  applied_at timestamptz not null default now(),
  checksum text
);
`;

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: dbUrl.includes('localhost') ? false : { rejectUnauthorized: false },
});

async function loadApplied() {
  const { rows } = await client.query('select id from public.schema_migrations');
  return new Set(rows.map((r) => r.id));
}

async function recordApplied(id, sum) {
  await client.query(
    `insert into public.schema_migrations (id, checksum)
     values ($1, $2)
     on conflict (id) do update set checksum = excluded.checksum, applied_at = now()`,
    [id, sum],
  );
}

async function dbLooksInitialized() {
  const { rows } = await client.query(`select to_regclass('public.notifications_app') as t`);
  return Boolean(rows[0]?.t);
}

function shouldBaselineOnly(absPath, { autoPartial }) {
  if (baselineAll) return true;
  if (!autoPartial) return false;
  // push_schema_updates.sql has no timestamp — treat as historical
  const ts = fileTimestamp(absPath);
  if (!ts) return true;
  return ts < baselineBefore;
}

async function applyFile(file) {
  const id = migrationId(file);
  const sql = readFileSync(file, 'utf8');
  const sum = checksum(sql);
  console.log(`  → ${id}`);
  await client.query('begin');
  try {
    await client.query(sql);
    await recordApplied(id, sum);
    await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    throw err;
  }
}

async function main() {
  await client.connect();
  await client.query(ENSURE_TRACKING);

  const files = migrationFiles();
  let applied = force ? new Set() : await loadApplied();

  let autoPartial = false;
  if (!force && !baselineAll && applied.size === 0 && await dbLooksInitialized()) {
    console.log(
      `schema_migrations empty but core tables exist — baselining files before ${baselineBefore}, then applying newer.`,
    );
    autoPartial = true;
  }

  const pending = files.filter((f) => !applied.has(migrationId(f)));

  console.log('Schema-only migration (local db/data.json is NOT imported).');
  if (skipPush) console.log('Skipping push_schema_updates.sql.');
  if (fromPrefix) console.log(`Only migrations from: ${fromPrefix}`);
  if (force) console.log('Force mode: re-applying selected files.');
  if (baselineAll) console.log('Baseline mode: mark ALL selected files without executing.');
  console.log(`Selected ${files.length} script(s); ${pending.length} pending.`);

  if (dryRun) {
    for (const file of pending) {
      const mode = shouldBaselineOnly(file, { autoPartial }) ? 'baseline' : 'apply';
      console.log(`  (${mode}) ${migrationId(file)}`);
    }
    if (!pending.length) console.log('  (none)');
    await client.end();
    return;
  }

  for (const file of pending) {
    const id = migrationId(file);
    const sql = readFileSync(file, 'utf8');
    const sum = checksum(sql);
    if (shouldBaselineOnly(file, { autoPartial })) {
      console.log(`  ✓ baseline ${id}`);
      await recordApplied(id, sum);
      continue;
    }
    await applyFile(file);
  }

  console.log('Done. Run npm run db:verify to confirm.');
  await client.end();
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
