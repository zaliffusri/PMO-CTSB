/**
 * Apply Supabase schema scripts in order.
 *
 * Schema only — never reads db/data.json or imports local demo data.
 *
 * Options (env or CLI):
 *   --skip-push     Skip supabase/push_schema_updates.sql (legacy client/project reshape)
 *   --from=20260627 Only run migration files with prefix >= that date string
 *
 * Examples:
 *   npm run db:migrate              Full idempotent schema (all SQL files)
 *   npm run db:migrate:features     New app tables only (helpdesk, backlog, …)
 */
import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';
import { getSupabaseDbUrl } from '../lib/dbConnection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

dotenv.config({ path: path.join(root, '.env') });

const args = process.argv.slice(2);
const skipPush = args.includes('--skip-push') || process.env.DB_MIGRATE_SKIP_PUSH === '1';
const fromArg = args.find((a) => a.startsWith('--from='));
const fromPrefix = fromArg ? fromArg.slice('--from='.length) : (process.env.DB_MIGRATE_FROM || '');

const dbUrl = getSupabaseDbUrl();

if (!dbUrl) {
  console.error(
    'Missing SUPABASE_DB_URL (or DATABASE_URL) in .env.\n' +
      'Supabase → Project Settings → Database → Connection string → URI (Session pooler).\n' +
      'Or run SQL files manually in the SQL Editor.',
  );
  process.exit(1);
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

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: dbUrl.includes('localhost') ? false : { rejectUnauthorized: false },
});

async function main() {
  await client.connect();
  const files = migrationFiles();
  console.log('Schema-only migration (local db/data.json is NOT imported).');
  if (skipPush) console.log('Skipping push_schema_updates.sql (existing Supabase rows unchanged except new DDL).');
  if (fromPrefix) console.log(`Only migrations from: ${fromPrefix}`);
  console.log(`Applying ${files.length} schema script(s)…`);
  for (const file of files) {
    const rel = path.relative(root, file);
    console.log(`  → ${rel}`);
    const sql = readFileSync(file, 'utf8');
    await client.query(sql);
  }
  console.log('Done. Run npm run db:verify to confirm.');
  await client.end();
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
