/**
 * Apply supabase/push_schema_updates.sql to the linked Postgres database.
 *
 * Requires in .env:
 *   SUPABASE_DB_URL=postgresql://postgres.[ref]:[PASSWORD]@...pooler.supabase.com:6543/postgres
 *
 * Find it in Supabase: Project Settings → Database → Connection string → URI (use pooler).
 */
import { readFileSync } from 'fs';
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
      'Or run supabase/push_schema_updates.sql manually in the SQL Editor.',
  );
  process.exit(1);
}

const sqlPath = path.join(root, 'supabase', 'push_schema_updates.sql');
const sql = readFileSync(sqlPath, 'utf8');

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: dbUrl.includes('localhost') ? false : { rejectUnauthorized: false },
});

async function verify(client) {
  const tables = await client.query(`
    select table_name from information_schema.tables
    where table_schema = 'public'
      and table_name in ('client_contacts', 'project_clients')
    order by 1
  `);
  const legacy = await client.query(`
    select table_name, column_name from information_schema.columns
    where table_schema = 'public'
      and (
        (table_name = 'clients' and column_name in ('contact_name', 'email', 'phone'))
        or (table_name = 'projects' and column_name = 'client_id')
      )
  `);
  console.log('Tables present:', tables.rows.map((r) => r.table_name).join(', ') || '(none)');
  if (legacy.rows.length) {
    console.warn('Legacy columns still present:', legacy.rows);
  } else {
    console.log('Legacy columns removed: clients.contact_* and projects.client_id');
  }
}

async function main() {
  await client.connect();
  console.log('Applying schema updates from push_schema_updates.sql…');
  await client.query(sql);
  console.log('Done.');
  await verify(client);
  await client.end();
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
