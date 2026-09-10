/**
 * One-shot: ensure clients.short_code + clients.logo_url exist, then reload PostgREST cache.
 * Usage: node scripts/ensureClientsColumns.mjs
 */
import 'dotenv/config';
import pg from 'pg';

const url = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('Missing SUPABASE_DB_URL / DATABASE_URL');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  await pool.query(`
    alter table public.clients add column if not exists short_code text;
    alter table public.clients add column if not exists logo_url text;
    create index if not exists clients_short_code_idx on public.clients (short_code);
  `);
  try {
    await pool.query("NOTIFY pgrst, 'reload schema'");
  } catch (e) {
    console.warn('schema reload notify skipped:', e.message);
  }
  const cols = await pool.query(`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'clients'
      and column_name in ('short_code', 'logo_url')
    order by column_name
  `);
  console.log('clients columns present:', cols.rows.map((r) => r.column_name).join(', ') || '(none)');
} finally {
  await pool.end();
}
