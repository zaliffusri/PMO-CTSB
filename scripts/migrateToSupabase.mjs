import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(__dirname, '../db/data.json');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const raw = JSON.parse(readFileSync(dataPath, 'utf8'));

async function upsert(table, rows, on = 'id') {
  if (!rows?.length) return;
  const { error } = await supabase.from(table).upsert(rows, { onConflict: on });
  if (error) throw new Error(`${table}: ${error.message}`);
  console.log(`Migrated ${rows.length} row(s) to ${table}`);
}

async function main() {
  await upsert('clients', raw.clients || []);
  await upsert('people', raw.people || []);
  await upsert(
    'projects',
    (raw.projects || []).map((p) => ({ ...p, tags: Array.isArray(p.tags) ? p.tags : [] })),
  );
  await upsert('project_assignments', raw.project_assignments || []);
  await upsert('activities', raw.activities || []);
  const tasks = (raw.project_tasks || []).map((t, idx) => ({
    ...t,
    progress_percent: Number.isFinite(+t.progress_percent) ? +t.progress_percent : 0,
    sort_order: Number.isFinite(+t.sort_order) ? +t.sort_order : idx,
    status: t.status || 'new',
    task_kind: t.task_kind === 'group' ? 'group' : 'task',
  }));
  await upsert('project_tasks', tasks);
  await upsert('users_app', raw.users || []);
  await upsert('sessions_app', raw.sessions || []);
  await upsert(
    'settings_app',
    [
      {
        id: 1,
        ...(raw.settings || {}),
      },
    ],
    'id',
  );
  await upsert('audit_log', raw.audit_log || []);
}

main()
  .then(() => {
    console.log('Supabase migration complete.');
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
