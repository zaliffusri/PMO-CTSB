/**
 * One-off / re-runnable backfill: link people.user_id from users_app by email.
 * Prefer applying supabase/migrations/20260820170000_people_user_id_link.sql via npm run db:migrate.
 *
 * Usage:
 *   node scripts/linkPeopleUserIds.mjs
 *   node scripts/linkPeopleUserIds.mjs --dry-run
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';
import { getSupabaseDbUrl } from '../lib/dbConnection.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env') });

const dryRun = process.argv.includes('--dry-run');
const dbUrl = getSupabaseDbUrl();
if (!dbUrl) {
  console.error('Missing SUPABASE_DB_URL (or DATABASE_URL)');
  process.exit(1);
}

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: dbUrl.includes('localhost') ? false : { rejectUnauthorized: false },
});

const BACKFILL_SQL = `
with user_emails as (
  select u.id as user_id, lower(btrim(u.email)) as email_key
  from public.users_app u
  where u.email is not null and btrim(u.email) <> ''
),
person_emails as (
  select p.id as person_id, lower(btrim(p.email)) as email_key
  from public.people p
  where p.user_id is null and p.email is not null and btrim(p.email) <> ''
),
unique_user_emails as (
  select email_key from user_emails group by email_key having count(*) = 1
),
unique_person_emails as (
  select email_key from person_emails group by email_key having count(*) = 1
),
matches as (
  select pe.person_id, ue.user_id, pe.email_key
  from person_emails pe
  join unique_person_emails upe on upe.email_key = pe.email_key
  join unique_user_emails uue on uue.email_key = pe.email_key
  join user_emails ue on ue.email_key = pe.email_key
)
select * from matches
order by person_id;
`;

async function main() {
  await client.connect();

  const { rows: col } = await client.query(
    `select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'people' and column_name = 'user_id'`,
  );
  if (!col.length) {
    console.error('people.user_id missing — run npm run db:migrate first');
    process.exit(1);
  }

  const { rows: matches } = await client.query(BACKFILL_SQL);
  console.log(`Found ${matches.length} email match(es) to link.`);
  for (const m of matches.slice(0, 20)) {
    console.log(`  person ${m.person_id} ← user ${m.user_id} (${m.email_key})`);
  }
  if (matches.length > 20) console.log(`  … and ${matches.length - 20} more`);

  if (dryRun) {
    console.log('Dry run — no updates applied.');
    await client.end();
    return;
  }

  const { rowCount } = await client.query(`
    with user_emails as (
      select u.id as user_id, lower(btrim(u.email)) as email_key
      from public.users_app u
      where u.email is not null and btrim(u.email) <> ''
    ),
    person_emails as (
      select p.id as person_id, lower(btrim(p.email)) as email_key
      from public.people p
      where p.user_id is null and p.email is not null and btrim(p.email) <> ''
    ),
    unique_user_emails as (
      select email_key from user_emails group by email_key having count(*) = 1
    ),
    unique_person_emails as (
      select email_key from person_emails group by email_key having count(*) = 1
    ),
    matches as (
      select pe.person_id, ue.user_id
      from person_emails pe
      join unique_person_emails upe on upe.email_key = pe.email_key
      join unique_user_emails uue on uue.email_key = pe.email_key
      join user_emails ue on ue.email_key = pe.email_key
    )
    update public.people p
    set user_id = m.user_id
    from matches m
    where p.id = m.person_id and p.user_id is null
  `);

  console.log(`Linked ${rowCount ?? 0} people row(s).`);
  await client.end();
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
