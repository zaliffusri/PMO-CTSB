/**
 * Verify Supabase schema matches the current app (client_contacts, project_clients).
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env') });

const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('Missing SUPABASE_DB_URL in .env');
  process.exit(1);
}

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: dbUrl.includes('localhost') ? false : { rejectUnauthorized: false },
});

async function main() {
  await client.connect();
  const required = ['client_contacts', 'project_clients'];
  const { rows: tables } = await client.query(
    `select table_name from information_schema.tables
     where table_schema = 'public' and table_name = any($1::text[])`,
    [required],
  );
  const found = new Set(tables.map((r) => r.table_name));
  const missing = required.filter((t) => !found.has(t));

  const { rows: legacy } = await client.query(`
    select table_name, column_name from information_schema.columns
    where table_schema = 'public'
      and (
        (table_name = 'clients' and column_name in ('contact_name', 'email', 'phone'))
        or (table_name = 'projects' and column_name = 'client_id')
      )
  `);

  let ok = true;
  if (missing.length) {
    console.error('Missing tables:', missing.join(', '));
    ok = false;
  } else {
    console.log('OK: client_contacts, project_clients exist');
  }
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
