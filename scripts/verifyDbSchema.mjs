/**
 * Verify Supabase schema matches the current PMO CTSB app.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';
import { getSupabaseDbUrl } from '../lib/dbConnection.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env') });

const dbUrl = getSupabaseDbUrl();
if (!dbUrl) {
  console.error('Missing SUPABASE_DB_URL in .env');
  process.exit(1);
}

const REQUIRED_TABLES = [
  'clients',
  'client_contacts',
  'people',
  'projects',
  'project_clients',
  'project_assignments',
  'activities',
  'project_tasks',
  'users_app',
  'sessions_app',
  'issues_app',
  'notifications_app',
  'backlogs_app',
  'project_phases_app',
  'project_work_packages_app',
];

const REQUIRED_COLUMNS = [
  ['projects', 'classification'],
  ['projects', 'engagement_type'],
  ['people', 'user_id'],
  ['project_phases_app', 'work_package_id'],
  ['project_tasks', 'work_package_id'],
  ['project_tasks', 'backlog_id'],
];

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: dbUrl.includes('localhost') ? false : { rejectUnauthorized: false },
});

async function main() {
  await client.connect();
  let ok = true;

  const { rows: tables } = await client.query(
    `select table_name from information_schema.tables
     where table_schema = 'public' and table_name = any($1::text[])`,
    [REQUIRED_TABLES],
  );
  const found = new Set(tables.map((r) => r.table_name));
  const missingTables = REQUIRED_TABLES.filter((t) => !found.has(t));
  if (missingTables.length) {
    console.error('Missing tables:', missingTables.join(', '));
    ok = false;
  } else {
    console.log(`OK: ${REQUIRED_TABLES.length} required tables present`);
  }

  for (const [table, column] of REQUIRED_COLUMNS) {
    const { rows } = await client.query(
      `select 1 from information_schema.columns
       where table_schema = 'public' and table_name = $1 and column_name = $2`,
      [table, column],
    );
    if (!rows.length) {
      console.error(`Missing column: ${table}.${column}`);
      ok = false;
    }
  }
  if (ok) console.log('OK: required columns present');

  const { rows: legacy } = await client.query(`
    select table_name, column_name from information_schema.columns
    where table_schema = 'public'
      and (
        (table_name = 'clients' and column_name in ('contact_name', 'email', 'phone'))
        or (table_name = 'projects' and column_name = 'client_id')
      )
  `);
  if (legacy.length) {
    console.error('Legacy columns still present (run npm run db:migrate):', legacy);
    ok = false;
  } else {
    console.log('OK: legacy client_id / contact columns removed');
  }

  await client.end();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
