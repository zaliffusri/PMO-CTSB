/**
 * Ensure projects.cover_image_url (+ related optional columns) exist.
 * Usage: node scripts/ensureProjectsCoverColumn.mjs
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
    alter table public.projects add column if not exists cover_image_url text;
    alter table public.projects add column if not exists engagement_type text;
    alter table public.projects add column if not exists classification text;
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
      and table_name = 'projects'
      and column_name in ('cover_image_url', 'engagement_type', 'classification')
    order by column_name
  `);
  console.log('projects columns present:', cols.rows.map((r) => r.column_name).join(', ') || '(none)');
} finally {
  await pool.end();
}
