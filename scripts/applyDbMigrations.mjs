/**
 * Apply all Supabase schema scripts in order:
 * 1) push_schema_updates.sql (client/project legacy migration)
 * 2) supabase/migrations/*.sql (sorted by filename)
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
  const sorted = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  return [push, ...sorted.map((f) => path.join(dir, f))];
}

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: dbUrl.includes('localhost') ? false : { rejectUnauthorized: false },
});

async function main() {
  await client.connect();
  const files = migrationFiles();
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
