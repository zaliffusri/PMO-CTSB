import { supabase } from './config.js';
import {
  normalizeUserRow,
  companyRowForDb,
  projectRowForDb,
  normalizeBacklogRows,
} from './helpers.js';
import { embedSmtpIntoSettings, applySmtpEmbedToSettings, SMTP_EMBED_KEY } from '../../lib/smtpSettingsEmbed.js';
import { parseActorEmbedFromDescription } from '../../lib/activityActorEmbed.js';

let warnedSupabase = false;
let syncInFlight = false;
let syncQueued = false;
let warnedUsersAppActiveColumn = false;
let warnedUsersAppAvatarColumn = false;
let warnedActivitiesExternalAttendees = false;
let warnedClientContactsTable = false;
let warnedProjectClientsTable = false;
let warnedIssuesTable = false;
let warnedNotificationsTable = false;
let warnedBacklogsTable = false;
let warnedPhasesTable = false;
let warnedWorkPackagesTable = false;
let warnedBacklogCommentsTable = false;

let latestDataRef = null;

export function bindSyncDataRef(getData) {
  latestDataRef = getData;
}

async function upsertAll(table, rows, onConflict = 'id') {
  if (!rows || rows.length === 0) return;
  const { error } = await supabase.from(table).upsert(rows, { onConflict });
  if (error) throw error;
}

/** Upsert rows; if PostgREST reports missing columns, strip them and retry. */
async function upsertStrippingMissingColumns(table, rows, optionalColumns = [], onConflict = 'id') {
  if (!rows || rows.length === 0) return;
  let payload = rows.map((r) => ({ ...r }));
  let { error } = await supabase.from(table).upsert(payload, { onConflict });
  if (!error) return;

  const isSchemaError = (err) =>
    /schema cache|PGRST204|Could not find|does not exist|column/i.test(String(err?.message || ''));

  for (const column of optionalColumns) {
    if (!error || !isSchemaError(error)) break;
    const msg = String(error?.message || '');
    if (!new RegExp(column, 'i').test(msg) && !/schema cache|PGRST204/i.test(msg)) continue;
    payload = payload.map((row) => {
      const next = { ...row };
      delete next[column];
      return next;
    });
    ({ error } = await supabase.from(table).upsert(payload, { onConflict }));
    if (!error) return;
  }

  throw error;
}

async function upsertProjectTasks(rows) {
  await upsertStrippingMissingColumns(
    'project_tasks',
    rows || [],
    ['actual_hours', 'estimated_hours', 'work_package_id', 'backlog_id', 'task_kind', 'parent_id', 'assignee_id'],
  );
}

async function upsertBacklogs(rows) {
  await upsertStrippingMissingColumns(
    'backlogs_app',
    rows || [],
    ['actual_hours', 'estimated_hours', 'work_package_id', 'phase_id', 'effort_days'],
  );
}

async function upsertUsersApp(rows) {
  if (!rows || rows.length === 0) return;
  const prepared = rows.map((u) => normalizeUserRow(u));

  const tryUpsert = async (payload) => supabase.from('users_app').upsert(payload, { onConflict: 'id' });

  let { error } = await tryUpsert(prepared);
  if (!error) return;

  const isMissingColumn = (err, column) => {
    const msg = String(err?.message || '');
    return new RegExp(column, 'i').test(msg) &&
      /users_app|schema cache|column|Could not find|does not exist|PGRST204/i.test(msg);
  };

  if (isMissingColumn(error, 'avatar_url')) {
    const stripped = prepared.map(({ avatar_url: _a, ...rest }) => rest);
    ({ error } = await tryUpsert(stripped));
    if (!error) {
      if (!warnedUsersAppAvatarColumn) {
        warnedUsersAppAvatarColumn = true;
        console.warn(
          'store: users_app has no `avatar_url` column — saved without it. Run supabase/migrations/20260512170000_add_users_app_avatar_url.sql',
        );
      }
      return;
    }
  }

  if (isMissingColumn(error, 'active')) {
    const stripped = prepared.map(({ active: _a, avatar_url: _b, ...rest }) => rest);
    ({ error } = await tryUpsert(stripped));
    if (!error) {
      if (!warnedUsersAppActiveColumn) {
        warnedUsersAppActiveColumn = true;
        console.warn(
          'store: users_app has no `active` column — saved users without it. Run SQL: alter table public.users_app add column if not exists active boolean not null default true;',
        );
      }
      return;
    }
  }

  throw error;
}

async function upsertActivitiesAppRaw(rows) {
  if (!rows || rows.length === 0) return;
  await upsertStrippingMissingColumns(
    'activities',
    rows.map((r) => ({ ...r })),
    [
      'external_attendees',
      'activity_group_id',
      'created_by_user_id',
      'created_by_name',
      'updated_by_user_id',
      'updated_by_name',
      'updated_at',
    ],
  );
}

/**
 * Upsert activities while skipping tombstoned / already-deleted ids.
 * Prevents cancelled activities from being resurrected by a stale sync snapshot.
 */
async function upsertActivitiesApp(rows) {
  const list = (Array.isArray(rows) ? rows : []).filter((r) => !isDeletedActivityId(r?.id));
  if (!list.length) return;

  let remoteIds = null;
  try {
    const { data, error } = await supabase.from('activities').select('id');
    if (!error) remoteIds = new Set((data || []).map((r) => Number(r.id)).filter(Number.isFinite));
  } catch {
    remoteIds = null;
  }

  if (!remoteIds) {
    await upsertActivitiesAppRaw(list);
    return;
  }

  const now = Date.now();
  const toUpsert = list.filter((a) => {
    const id = Number(a.id);
    if (!Number.isFinite(id)) return false;
    if (remoteIds.has(id)) return true;
    // Brand-new local creates may not be remote yet.
    const created = new Date(a.created_at || 0).getTime();
    return Number.isFinite(created) && (now - created) < 5 * 60 * 1000;
  });
  if (toUpsert.length) await upsertActivitiesAppRaw(toUpsert);
}

async function upsertProjectClients(rows) {
  if (!rows?.length) return;
  const { error } = await supabase.from('project_clients').upsert(rows, { onConflict: 'id' });
  if (!error) return;
  const msg = String(error?.message || '');
  if (/project_clients|schema cache|column|Could not find|does not exist|PGRST204/i.test(msg)) {
    if (!warnedProjectClientsTable) {
      warnedProjectClientsTable = true;
      console.warn(
        'store: project_clients table missing — run supabase/migrations/20260518130000_project_clients.sql',
      );
    }
    return;
  }
  throw error;
}

async function upsertClientContacts(rows) {
  if (!rows?.length) return;
  const { error } = await supabase.from('client_contacts').upsert(rows, { onConflict: 'id' });
  if (!error) return;
  const msg = String(error?.message || '');
  if (/client_contacts|schema cache|column|Could not find|does not exist|PGRST204/i.test(msg)) {
    if (!warnedClientContactsTable) {
      warnedClientContactsTable = true;
      console.warn(
        'store: client_contacts table missing — run supabase/migrations/20260518120000_client_contacts.sql',
      );
    }
    return;
  }
  throw error;
}

async function upsertOptionalTable(table, rows, onConflict = 'id', warnKey) {
  if (!rows || rows.length === 0) return;
  const { error } = await supabase.from(table).upsert(rows, { onConflict });
  if (!error) return;
  const msg = String(error.message || '');
  if (/schema cache|Could not find|does not exist|PGRST204/i.test(msg)) {
    if (warnKey === 'issues' && !warnedIssuesTable) {
      warnedIssuesTable = true;
      console.warn(`store: ${table} not in DB — issues kept in memory. Run supabase migration for issues.`);
    }
    if (warnKey === 'notifications' && !warnedNotificationsTable) {
      warnedNotificationsTable = true;
      console.warn(`store: ${table} not in DB — notifications kept in memory. Run supabase migration.`);
    }
    if (warnKey === 'backlogs' && !warnedBacklogsTable) {
      warnedBacklogsTable = true;
      console.warn(`store: ${table} not in DB — backlogs kept in memory. Run supabase migration.`);
    }
    if (warnKey === 'phases' && !warnedPhasesTable) {
      warnedPhasesTable = true;
      console.warn(`store: ${table} not in DB — project phases kept in memory. Run supabase migration.`);
    }
    if (warnKey === 'work_packages' && !warnedWorkPackagesTable) {
      warnedWorkPackagesTable = true;
      console.warn(`store: ${table} not in DB — work packages kept in memory. Run supabase migration.`);
    }
    if (warnKey === 'backlog_comments' && !warnedBacklogCommentsTable) {
      warnedBacklogCommentsTable = true;
      console.warn(`store: ${table} not in DB — backlog comments kept in memory. Run supabase migration.`);
    }
    return;
  }
  throw error;
}

/** Like optional upsert, but missing tables fail hard (used for workspace writes). */
async function upsertRequiredTable(table, rows, onConflict = 'id', hint) {
  if (!rows || rows.length === 0) return;
  const { error } = await supabase.from(table).upsert(rows, { onConflict });
  if (!error) return;
  const msg = String(error.message || '');
  if (/schema cache|Could not find|does not exist|PGRST204/i.test(msg)) {
    throw new Error(
      `${table} is missing in Supabase${hint ? ` — ${hint}` : ''}. (${msg})`,
    );
  }
  throw error;
}

async function upsertProjects(rows) {
  if (!rows || rows.length === 0) return;
  const toDateOnly = (v) => {
    if (v == null || v === '') return null;
    const s = String(v).trim();
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
  };
  const prepared = rows.map((p) => {
    const row = projectRowForDb(p);
    row.start_date = toDateOnly(row.start_date);
    row.end_date = toDateOnly(row.end_date);
    return row;
  });
  const tryUpsert = async (payload) => supabase.from('projects').upsert(payload, { onConflict: 'id' });

  let { error } = await tryUpsert(prepared);
  if (!error) return;

  const isSchemaError = (err) =>
    /schema cache|PGRST204|Could not find|does not exist|column/i.test(String(err?.message || ''));
  const mentions = (err, column) => new RegExp(column, 'i').test(String(err?.message || ''));

  // Progressively strip optional columns when production schema lags migrations.
  let payload = prepared.map((row) => ({ ...row }));
  for (const column of ['cover_image_url', 'engagement_type', 'classification']) {
    if (!error || !isSchemaError(error)) break;
    if (!mentions(error, column) && column !== 'cover_image_url') {
      // Still strip known-optional cols on generic schema-cache errors.
      if (!/schema cache|PGRST204/i.test(String(error?.message || ''))) continue;
    }
    payload = payload.map((row) => {
      const next = { ...row };
      delete next[column];
      return next;
    });
    ({ error } = await tryUpsert(payload));
    if (!error) return;
  }

  // Last resort: core columns only.
  if (error) {
    const minimal = prepared.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description ?? null,
      status: p.status || 'active',
      start_date: toDateOnly(p.start_date),
      end_date: toDateOnly(p.end_date),
      tags: [],
      created_at: p.created_at || new Date().toISOString(),
    }));
    ({ error } = await tryUpsert(minimal));
    if (!error) return;
  }

  throw error;
}

async function upsertProjectClientLinks(rows) {
  if (!rows?.length) return;
  // Use natural key — surrogate ids drift across serverless instances and cause unique violations.
  const payload = rows.map((r) => ({
    project_id: Number(r.project_id),
    client_id: Number(r.client_id),
    created_at: r.created_at || new Date().toISOString(),
  })).filter((r) => Number.isFinite(r.project_id) && Number.isFinite(r.client_id));
  if (!payload.length) return;

  const { error } = await supabase
    .from('project_clients')
    .upsert(payload, { onConflict: 'project_id,client_id' });
  if (!error) return;

  const msg = String(error?.message || '');
  if (/project_clients|schema cache|column|Could not find|does not exist|PGRST204/i.test(msg)) {
    if (!warnedProjectClientsTable) {
      warnedProjectClientsTable = true;
      console.warn(
        'store: project_clients table missing — run supabase/migrations/20260518130000_project_clients.sql',
      );
    }
    return;
  }
  throw error;
}

async function upsertSessions(rows) {
  if (!rows?.length) return;
  const payload = rows.map(({ user_id, token, expires_at, created_at }) => ({
    user_id,
    token,
    expires_at,
    created_at: created_at || new Date().toISOString(),
  }));
  const { error } = await supabase.from('sessions_app').upsert(payload, { onConflict: 'token' });
  if (error) throw error;
}

/**
 * Persist settings without relying on smtp_* columns (often missing in prod).
 * Secrets are embedded in mileage_from_office_km under SMTP_EMBED_KEY.
 */
async function upsertSettingsApp(settings) {
  const s = embedSmtpIntoSettings({ ...(settings || {}) });
  const mileage = {
    ...(s.mileage_from_office_km && typeof s.mileage_from_office_km === 'object'
      ? s.mileage_from_office_km
      : {}),
  };
  if (!mileage[SMTP_EMBED_KEY]) {
    embedSmtpIntoSettings(s);
    Object.assign(mileage, s.mileage_from_office_km || {});
  }
  // Drop legacy Microsoft Graph embed if present.
  delete mileage.__pmo_ms_graph__;

  const row = {
    id: 1,
    activity_locations: s.activity_locations ?? [],
    reference_office_name: s.reference_office_name ?? 'Main Office',
    mileage_from_office_km: mileage,
    general_notes: s.general_notes ?? '',
    currency_code: s.currency_code ?? 'MYR',
    updated_at: new Date().toISOString(),
    org_display_name: s.org_display_name ?? null,
    org_tagline: s.org_tagline ?? null,
    org_logo_url: s.org_logo_url ?? null,
    org_banner_url: s.org_banner_url ?? null,
  };

  await upsertStrippingMissingColumns(
    'settings_app',
    [row],
    ['org_display_name', 'org_tagline', 'org_logo_url', 'org_banner_url'],
    'id',
  );
}

export async function pushSnapshotToSupabase(snapshot) {
  await upsertAll('clients', (snapshot.clients || []).map(companyRowForDb));
  await upsertClientContacts(snapshot.client_contacts || []);
  await upsertAll('people', snapshot.people || []);
  await upsertProjectsSafe(snapshot.projects || []);
  await upsertProjectClients(
    (snapshot.project_clients || []).filter((pc) => !isDeletedProjectId(pc.project_id)),
  );
  // Drop child rows that belong to tombstoned / missing projects (stale warm instances).
  await upsertAll(
    'project_assignments',
    filterProjectScoped(snapshot.project_assignments || []),
  );
  await upsertActivitiesApp(snapshot.activities || []);
  await upsertProjectTasks(filterProjectScoped(snapshot.project_tasks || []));
  await upsertUsersApp(snapshot.users || []);
  await upsertSessions(snapshot.sessions || []);
  await upsertSettingsApp(snapshot.settings || {});
  await upsertAll('audit_log', snapshot.audit_log || []);
  await upsertOptionalTable('issues_app', snapshot.issues || [], 'id', 'issues');
  await upsertOptionalTable('notifications_app', snapshot.notifications || [], 'id', 'notifications');
  try {
    await upsertBacklogs(filterProjectScoped(snapshot.backlogs || []));
  } catch (e) {
    const msg = String(e?.message || '');
    const tableMissing = /backlogs_app/i.test(msg) && /schema cache|Could not find|does not exist|PGRST204/i.test(msg);
    if (tableMissing) {
      throw new Error(
        'backlogs_app table missing in Supabase. Run backlog migrations (e.g. supabase/migrations/20260627140000_backlog_phases.sql).',
      );
    }
    throw e;
  }
  await upsertRequiredTable(
    'project_phases_app',
    filterProjectScoped(snapshot.project_phases || []),
    'id',
    'project_phases_app (run supabase/migrations/20260627160000_work_packages.sql and backlog_phases)',
  );
  await upsertRequiredTable(
    'project_work_packages_app',
    filterProjectScoped(snapshot.work_packages || []),
    'id',
    'project_work_packages_app (run supabase/migrations/20260627160000_work_packages.sql)',
  );
  await upsertOptionalTable('attachments_app', snapshot.attachments || [], 'id', 'attachments');
  await upsertOptionalTable('backlog_comments_app', snapshot.backlog_comments || [], 'id', 'backlog_comments');
}

export function queueSupabaseSync(snapshot) {
  if (!supabase) return;
  if (syncInFlight) {
    syncQueued = true;
    return;
  }
  syncInFlight = true;
  (async () => {
    try {
      // Always push the latest in-memory snapshot at execution time.
      // Freezing the queue-time snapshot can re-upsert rows that were deleted while a sync was in flight.
      const fresh = latestDataRef ? latestDataRef() : snapshot;
      const snap = JSON.parse(JSON.stringify(fresh));
      await pushSnapshotToSupabase(snap);
    } catch (e) {
      if (!warnedSupabase) {
        warnedSupabase = true;
        console.warn(`store.save: supabase sync failed (${e.message})`);
      }
    } finally {
      syncInFlight = false;
      if (syncQueued && latestDataRef) {
        syncQueued = false;
        queueSupabaseSync(latestDataRef());
      }
    }
  })();
}

export async function loadFromSupabase() {
  if (!supabase) return null;
  try {
    const [
      clientsRes,
      clientContactsRes,
      projectClientsRes,
      peopleRes,
      projectsRes,
      assignRes,
      activitiesRes,
      tasksRes,
      usersRes,
      sessionsRes,
      settingsRes,
      auditRes,
      issuesRes,
      notificationsRes,
      backlogsRes,
      phasesRes,
      workPackagesRes,
      attachmentsRes,
      backlogCommentsRes,
    ] = await Promise.all([
      supabase.from('clients').select('*').order('id', { ascending: true }),
      supabase.from('client_contacts').select('*').order('id', { ascending: true }),
      supabase.from('project_clients').select('*').order('id', { ascending: true }),
      supabase.from('people').select('*').order('id', { ascending: true }),
      supabase.from('projects').select('*').order('id', { ascending: true }),
      supabase.from('project_assignments').select('*').order('id', { ascending: true }),
      supabase.from('activities').select('*').order('id', { ascending: true }),
      supabase.from('project_tasks').select('*').order('id', { ascending: true }),
      supabase.from('users_app').select('*').order('id', { ascending: true }),
      supabase.from('sessions_app').select('*').order('id', { ascending: true }),
      supabase.from('settings_app').select('*').eq('id', 1).maybeSingle(),
      supabase.from('audit_log').select('*').order('id', { ascending: true }),
      supabase.from('issues_app').select('*').order('id', { ascending: true }),
      supabase.from('notifications_app').select('*').order('id', { ascending: true }),
      supabase.from('backlogs_app').select('*').order('id', { ascending: true }),
      supabase.from('project_phases_app').select('*').order('id', { ascending: true }),
      supabase.from('project_work_packages_app').select('*').order('id', { ascending: true }),
      supabase.from('attachments_app').select('*').order('id', { ascending: true }),
      supabase.from('backlog_comments_app').select('*').order('id', { ascending: true }),
    ]);
    const clientContactsMissing =
      clientContactsRes.error &&
      /client_contacts|schema cache|Could not find|does not exist|PGRST204/i.test(String(clientContactsRes.error.message || ''));
    const projectClientsMissing =
      projectClientsRes.error &&
      /project_clients|schema cache|Could not find|does not exist|PGRST204/i.test(String(projectClientsRes.error.message || ''));
    const issuesMissing =
      issuesRes.error &&
      /issues_app|schema cache|Could not find|does not exist|PGRST204/i.test(String(issuesRes.error.message || ''));
    const notificationsMissing =
      notificationsRes.error &&
      /notifications_app|schema cache|Could not find|does not exist|PGRST204/i.test(String(notificationsRes.error.message || ''));
    const backlogsMissing =
      backlogsRes.error &&
      /backlogs_app|schema cache|Could not find|does not exist|PGRST204/i.test(String(backlogsRes.error.message || ''));
    const phasesMissing =
      phasesRes.error &&
      /project_phases_app|schema cache|Could not find|does not exist|PGRST204/i.test(String(phasesRes.error.message || ''));
    const workPackagesMissing =
      workPackagesRes.error &&
      /project_work_packages_app|schema cache|Could not find|does not exist|PGRST204/i.test(String(workPackagesRes.error.message || ''));
    const attachmentsMissing =
      attachmentsRes.error &&
      /attachments_app|schema cache|Could not find|does not exist|PGRST204/i.test(String(attachmentsRes.error.message || ''));
    const backlogCommentsMissing =
      backlogCommentsRes.error &&
      /backlog_comments_app|schema cache|Could not find|does not exist|PGRST204/i.test(String(backlogCommentsRes.error.message || ''));

    const errs = [
      clientsRes.error,
      clientContactsMissing ? null : clientContactsRes.error,
      projectClientsMissing ? null : projectClientsRes.error,
      peopleRes.error,
      projectsRes.error,
      assignRes.error,
      activitiesRes.error,
      tasksRes.error,
      usersRes.error,
      sessionsRes.error,
      settingsRes.error,
      auditRes.error,
      issuesMissing ? null : issuesRes.error,
      notificationsMissing ? null : notificationsRes.error,
      backlogsMissing ? null : backlogsRes.error,
      phasesMissing ? null : phasesRes.error,
      workPackagesMissing ? null : workPackagesRes.error,
      attachmentsMissing ? null : attachmentsRes.error,
      backlogCommentsMissing ? null : backlogCommentsRes.error,
    ].filter(Boolean);
    if (errs.length > 0) throw errs[0];

    const settingsRow = settingsRes.data || {};
    const { id: _id, updated_at: _updatedAt, ...settingsRaw } = settingsRow;
    const settings = applySmtpEmbedToSettings(
      { ...settingsRaw },
      settingsRaw.mileage_from_office_km,
    );
    embedSmtpIntoSettings(settings);
    const remote = {
      clients: clientsRes.data || [],
      client_contacts: clientContactsMissing ? [] : clientContactsRes.data || [],
      project_clients: projectClientsMissing ? [] : projectClientsRes.data || [],
      people: peopleRes.data || [],
      projects: projectsRes.data || [],
      project_assignments: assignRes.data || [],
      activities: (activitiesRes.data || [])
        .filter((row) => !isDeletedActivityId(row?.id))
        .map((row) => {
        const embedded = parseActorEmbedFromDescription(row.description);
        if (!embedded) return row;
        return {
          ...row,
          created_by_user_id: row.created_by_user_id ?? embedded.created_by_user_id,
          created_by_name: row.created_by_name || embedded.created_by_name,
          updated_by_user_id: row.updated_by_user_id ?? embedded.updated_by_user_id,
          updated_by_name: row.updated_by_name || embedded.updated_by_name,
          updated_at: row.updated_at || embedded.updated_at,
          created_at: row.created_at || embedded.created_at || row.created_at,
        };
      }),
      project_tasks: tasksRes.data || [],
      users: (usersRes.data || []).map(normalizeUserRow),
      sessions: sessionsRes.data || [],
      settings,
      audit_log: auditRes.data || [],
      issues: issuesMissing ? [] : issuesRes.data || [],
      notifications: notificationsMissing ? [] : notificationsRes.data || [],
      backlogs: backlogsMissing ? [] : normalizeBacklogRows(backlogsRes.data),
      project_phases: phasesMissing ? [] : phasesRes.data || [],
      work_packages: workPackagesMissing ? [] : workPackagesRes.data || [],
      attachments: attachmentsMissing ? [] : attachmentsRes.data || [],
      backlog_comments: backlogCommentsMissing ? [] : backlogCommentsRes.data || [],
    };
    const hasAnyRows =
      remote.clients.length +
        remote.people.length +
        remote.projects.length +
        remote.project_assignments.length +
        remote.activities.length +
        remote.project_tasks.length +
        remote.users.length +
        remote.sessions.length +
        remote.audit_log.length >
      0;
    return hasAnyRows ? remote : null;
  } catch (e) {
    if (!warnedSupabase) {
      warnedSupabase = true;
      console.warn(`store.load: supabase unavailable (${e.message})`);
    }
    return null;
  }
}

export async function persistDataToSupabase(data) {
  if (!supabase) return;
  const snap = JSON.parse(JSON.stringify(data));
  await pushSnapshotToSupabase(snap);
}

/** Persist projects (+ links) only — used on create so unrelated table errors don't block. */
export async function persistProjectsToSupabase(data) {
  if (!supabase) return;
  const snap = JSON.parse(JSON.stringify(data));
  await upsertProjectsSafe(snap.projects || []);
  await upsertProjectClientLinks(
    (snap.project_clients || []).filter((pc) => !isDeletedProjectId(pc.project_id)),
  );
}

/** Persist a single project (and its client links) — safest path for serverless create. */
export async function persistProjectById(data, projectId) {
  if (!supabase) return;
  const pid = Number(projectId);
  if (isDeletedProjectId(pid)) return;
  const project = (data.projects || []).find((p) => Number(p.id) === pid);
  if (!project) throw new Error(`Project ${pid} not found in memory`);
  await upsertProjects([project]);
  const links = (data.project_clients || []).filter((pc) => Number(pc.project_id) === pid);
  await upsertProjectClientLinks(links);
}

/** Persist assignment rows only — avoids unrelated schema gaps blocking assign. */
export async function persistAssignmentsToSupabase(data) {
  if (!supabase) return;
  const snap = JSON.parse(JSON.stringify(data));
  await upsertAll('project_assignments', snap.project_assignments || []);
  await upsertAll('audit_log', snap.audit_log || []);
}

/** Persist in-app notifications quickly (used after calendar/task assign). */
export async function persistNotificationsToSupabase(data, onlyIds = null) {
  if (!supabase) return;
  let rows = (Array.isArray(data?.notifications) ? data.notifications : [])
    .filter((n) => n && Number(n.user_id) > 0 && n.type !== '_id_floor');
  if (onlyIds != null) {
    const allow = new Set([...onlyIds].map(Number));
    rows = rows.filter((n) => allow.has(Number(n.id)));
  }
  if (!rows.length) return;
  const { error } = await supabase.from('notifications_app').upsert(rows, { onConflict: 'id' });
  if (!error) return;
  const msg = String(error.message || '');
  if (/schema cache|Could not find|does not exist|PGRST204/i.test(msg)) {
    throw new Error(
      'notifications_app table missing in Supabase. Run supabase/migrations/20260627120000_issues_notifications.sql',
    );
  }
  throw error;
}

function notificationsTableMissing(error) {
  const msg = String(error?.message || '');
  return /schema cache|Could not find|does not exist|PGRST204/i.test(msg);
}

function normalizeNotificationRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    user_id: Number(row.user_id),
    type: row.type || 'info',
    title: String(row.title || ''),
    body: row.body != null ? String(row.body) : null,
    link: row.link || null,
    entity_type: row.entity_type || null,
    entity_id: row.entity_id != null ? Number(row.entity_id) : null,
    read_at: row.read_at || null,
    created_at: row.created_at || new Date().toISOString(),
  };
}

/**
 * Insert one notification with DB-generated id (no serverless id collisions).
 * Returns the normalized row or throws.
 */
export async function insertNotificationRemote(row) {
  if (!supabase) return null;
  const payload = {
    user_id: Number(row.user_id),
    type: row.type || 'info',
    title: String(row.title || ''),
    body: row.body != null ? String(row.body) : null,
    link: row.link || null,
    entity_type: row.entity_type || null,
    entity_id: row.entity_id != null && row.entity_id !== '' ? Number(row.entity_id) : null,
    read_at: null,
    created_at: row.created_at || new Date().toISOString(),
  };
  if (!Number.isFinite(payload.user_id) || payload.user_id <= 0) {
    throw new Error('Invalid notification user_id');
  }
  const { data, error } = await supabase
    .from('notifications_app')
    .insert(payload)
    .select('*')
    .single();
  if (error) {
    if (notificationsTableMissing(error)) {
      if (!warnedNotificationsTable) {
        warnedNotificationsTable = true;
        console.warn(
          'store: notifications_app not in DB — in-app notify skipped. Run supabase/migrations/20260627120000_issues_notifications.sql',
        );
      }
      return null;
    }
    throw error;
  }
  return normalizeNotificationRow(data);
}

/** Load notifications for one user directly (serverless-safe). */
export async function fetchNotificationsForUser(userId, { unreadOnly = false, limit = 50 } = {}) {
  if (!supabase) return null;
  const uid = Number(userId);
  if (!Number.isFinite(uid)) return [];

  let q = supabase
    .from('notifications_app')
    .select('*')
    .eq('user_id', uid)
    .order('id', { ascending: false })
    .limit(limit);
  if (unreadOnly) q = q.is('read_at', null);
  const { data, error } = await q;
  if (error) {
    if (notificationsTableMissing(error)) {
      if (!warnedNotificationsTable) {
        warnedNotificationsTable = true;
        console.warn(
          'store: notifications_app not in DB — returning empty list. Run supabase/migrations/20260627120000_issues_notifications.sql',
        );
      }
      return [];
    }
    throw error;
  }
  return (data || []).map(normalizeNotificationRow).filter(Boolean);
}

export async function countUnreadNotificationsForUser(userId) {
  if (!supabase) return null;
  const uid = Number(userId);
  if (!Number.isFinite(uid)) return 0;

  // Avoid head+count edge cases: fetch unread ids (small list) and count locally.
  const { data, error } = await supabase
    .from('notifications_app')
    .select('id')
    .eq('user_id', uid)
    .is('read_at', null)
    .limit(500);
  if (error) {
    if (notificationsTableMissing(error)) {
      if (!warnedNotificationsTable) {
        warnedNotificationsTable = true;
        console.warn(
          'store: notifications_app not in DB — unread count 0. Run supabase/migrations/20260627120000_issues_notifications.sql',
        );
      }
      return 0;
    }
    throw error;
  }
  return Array.isArray(data) ? data.length : 0;
}

export async function markNotificationReadRemote(id, userId) {
  if (!supabase) return false;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('notifications_app')
    .update({ read_at: now })
    .eq('id', Number(id))
    .eq('user_id', Number(userId))
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

export async function markAllNotificationsReadRemote(userId) {
  if (!supabase) return 0;
  const now = new Date().toISOString();
  const uid = Number(userId);
  const { data, error } = await supabase
    .from('notifications_app')
    .update({ read_at: now })
    .eq('user_id', uid)
    .is('read_at', null)
    .select('id');
  if (error) throw error;
  return Array.isArray(data) ? data.length : 0;
}

/** Persist user (+ linked team person) updates without touching sessions. */
export async function persistUsersToSupabase(data) {
  if (!supabase) return;
  const snap = JSON.parse(JSON.stringify(data));
  await upsertUsersApp(snap.users || []);
  await upsertAll('people', snap.people || []);
  await upsertAll('audit_log', snap.audit_log || []);
}

async function deleteByProjectId(table, projectId, { optional = false } = {}) {
  const { error } = await supabase.from(table).delete().eq('project_id', projectId);
  if (!error) return;
  const msg = String(error.message || '');
  if (optional && /schema cache|Could not find|does not exist|PGRST204/i.test(msg)) return;
  throw error;
}

async function deleteOptional(build) {
  try {
    const { error } = await build();
    if (!error) return;
    const msg = String(error.message || '');
    if (/schema cache|Could not find|does not exist|PGRST204/i.test(msg)) return;
    throw error;
  } catch (e) {
    const msg = String(e?.message || e || '');
    if (/schema cache|Could not find|does not exist|PGRST204/i.test(msg)) return;
    throw e;
  }
}

/** In-process tombstones so a stale warm instance cannot re-upsert a just-deleted project. */
const deletedProjectTombstones = new Map(); // id -> expiresAt ms
const deletedActivityTombstones = new Map(); // id -> expiresAt ms
const TOMBSTONE_TTL_MS = 30 * 60 * 1000;

export function rememberDeletedProjectId(projectId) {
  const pid = Number(projectId);
  if (!Number.isFinite(pid)) return;
  deletedProjectTombstones.set(pid, Date.now() + TOMBSTONE_TTL_MS);
}

export function rememberDeletedActivityId(activityId) {
  const aid = Number(activityId);
  if (!Number.isFinite(aid)) return;
  deletedActivityTombstones.set(aid, Date.now() + TOMBSTONE_TTL_MS);
}

export function rememberDeletedActivityIds(ids) {
  for (const id of ids || []) rememberDeletedActivityId(id);
}

function pruneTombstones() {
  const now = Date.now();
  for (const [id, exp] of deletedProjectTombstones) {
    if (exp <= now) deletedProjectTombstones.delete(id);
  }
  for (const [id, exp] of deletedActivityTombstones) {
    if (exp <= now) deletedActivityTombstones.delete(id);
  }
}

export function isDeletedProjectId(projectId) {
  pruneTombstones();
  const pid = Number(projectId);
  if (!Number.isFinite(pid)) return false;
  const exp = deletedProjectTombstones.get(pid);
  if (exp == null) return false;
  if (exp <= Date.now()) {
    deletedProjectTombstones.delete(pid);
    return false;
  }
  return true;
}

export function isDeletedActivityId(activityId) {
  pruneTombstones();
  const aid = Number(activityId);
  if (!Number.isFinite(aid)) return false;
  const exp = deletedActivityTombstones.get(aid);
  if (exp == null) return false;
  if (exp <= Date.now()) {
    deletedActivityTombstones.delete(aid);
    return false;
  }
  return true;
}

/**
 * Only upsert projects that still exist remotely, or brand-new local creates.
 * Prevents warm serverless instances from resurrecting a project deleted on another instance.
 */
async function upsertProjectsSafe(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const filteredLocal = list.filter((p) => !isDeletedProjectId(p?.id));
  if (!filteredLocal.length) return;

  let remoteIds = null;
  try {
    const { data, error } = await supabase.from('projects').select('id');
    if (!error) remoteIds = new Set((data || []).map((r) => Number(r.id)).filter(Number.isFinite));
  } catch {
    remoteIds = null;
  }

  if (!remoteIds) {
    await upsertProjects(filteredLocal);
    return;
  }

  const now = Date.now();
  const toUpsert = filteredLocal.filter((p) => {
    const id = Number(p.id);
    if (!Number.isFinite(id)) return false;
    if (remoteIds.has(id)) return true;
    const created = new Date(p.created_at || 0).getTime();
    return Number.isFinite(created) && (now - created) < 5 * 60 * 1000;
  });
  if (toUpsert.length) await upsertProjects(toUpsert);
}

function filterProjectScoped(rows) {
  return (rows || []).filter((r) => !isDeletedProjectId(r?.project_id));
}

/**
 * Hard-delete a project and related rows in Supabase (parallel cleanup).
 */
export async function purgeProjectFromSupabase(projectId) {
  if (!supabase) return;
  const pid = Number(projectId);
  if (!Number.isFinite(pid)) throw new Error('Invalid project id');

  rememberDeletedProjectId(pid);

  const safeSelect = async (promise) => {
    try {
      const res = await promise;
      if (res?.error) {
        const msg = String(res.error.message || '');
        if (/schema cache|Could not find|does not exist|PGRST204/i.test(msg)) return [];
        throw res.error;
      }
      return res?.data || [];
    } catch (e) {
      const msg = String(e?.message || e || '');
      if (/schema cache|Could not find|does not exist|PGRST204/i.test(msg)) return [];
      throw e;
    }
  };

  const [taskRows, backlogRows, phaseRows, wpRows] = await Promise.all([
    safeSelect(supabase.from('project_tasks').select('id').eq('project_id', pid)),
    safeSelect(supabase.from('backlogs_app').select('id').eq('project_id', pid)),
    safeSelect(supabase.from('project_phases_app').select('id').eq('project_id', pid)),
    safeSelect(supabase.from('project_work_packages_app').select('id').eq('project_id', pid)),
  ]);

  const taskIds = taskRows.map((r) => Number(r.id)).filter(Number.isFinite);
  const backlogIds = backlogRows.map((r) => Number(r.id)).filter(Number.isFinite);
  const phaseIds = phaseRows.map((r) => Number(r.id)).filter(Number.isFinite);
  const wpIds = wpRows.map((r) => Number(r.id)).filter(Number.isFinite);

  const jobs = [];
  if (taskIds.length) {
    jobs.push(
      deleteOptional(() => supabase.from('attachments_app').delete().eq('entity_type', 'task').in('entity_id', taskIds)),
      deleteOptional(() => supabase.from('attachments_app').delete().eq('entity_type', 'project_task').in('entity_id', taskIds)),
      deleteOptional(() => supabase.from('notifications_app').delete().eq('entity_type', 'project_task').in('entity_id', taskIds)),
    );
  }
  if (backlogIds.length) {
    jobs.push(
      deleteOptional(() => supabase.from('attachments_app').delete().eq('entity_type', 'backlog').in('entity_id', backlogIds)),
      deleteOptional(() => supabase.from('backlog_comments_app').delete().in('backlog_id', backlogIds)),
      deleteOptional(() => supabase.from('notifications_app').delete().eq('entity_type', 'backlog').in('entity_id', backlogIds)),
    );
  }
  if (phaseIds.length) {
    jobs.push(
      deleteOptional(() => supabase.from('attachments_app').delete().eq('entity_type', 'phase').in('entity_id', phaseIds)),
      deleteOptional(() => supabase.from('attachments_app').delete().eq('entity_type', 'project_phase').in('entity_id', phaseIds)),
    );
  }
  if (wpIds.length) {
    jobs.push(
      deleteOptional(() => supabase.from('attachments_app').delete().eq('entity_type', 'work_package').in('entity_id', wpIds)),
    );
  }
  jobs.push(
    deleteOptional(() => supabase.from('attachments_app').delete().eq('entity_type', 'project').eq('entity_id', pid)),
    deleteOptional(() => supabase.from('notifications_app').delete().eq('entity_type', 'project').eq('entity_id', pid)),
    deleteOptional(() => supabase.from('notifications_app').delete().like('link', `/projects/${pid}%`)),
  );
  await Promise.all(jobs);

  await Promise.all([
    deleteByProjectId('project_clients', pid, { optional: true }),
    deleteByProjectId('project_assignments', pid, { optional: true }),
    deleteByProjectId('project_tasks', pid, { optional: true }),
    deleteByProjectId('backlogs_app', pid, { optional: true }),
    deleteByProjectId('project_phases_app', pid, { optional: true }),
    deleteByProjectId('project_work_packages_app', pid, { optional: true }),
  ]);

  {
    const { error: issuesErr } = await supabase
      .from('issues_app')
      .update({ project_id: null })
      .eq('project_id', pid);
    if (issuesErr) {
      const msg = String(issuesErr.message || '');
      if (!/schema cache|Could not find|does not exist|PGRST204/i.test(msg)) throw issuesErr;
    }
  }
  {
    const { error: actErr } = await supabase
      .from('activities')
      .update({ project_id: null })
      .eq('project_id', pid);
    if (actErr) {
      const msg = String(actErr.message || '');
      if (!/schema cache|Could not find|does not exist|PGRST204/i.test(msg)) throw actErr;
    }
  }

  const { error: projectErr } = await supabase.from('projects').delete().eq('id', pid);
  if (projectErr) throw projectErr;
}

export function hasSupabaseClient() {
  return Boolean(supabase);
}

export { supabase };
