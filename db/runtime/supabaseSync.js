import { supabase } from './config.js';
import {
  normalizeUserRow,
  companyRowForDb,
  projectRowForDb,
  normalizeBacklogRows,
} from './helpers.js';

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

async function upsertActivitiesApp(rows) {
  if (!rows || rows.length === 0) return;
  const prepared = rows.map((r) => ({ ...r }));
  const { error } = await supabase.from('activities').upsert(prepared, { onConflict: 'id' });
  if (!error) return;
  const msg = String(error.message || '');
  const missingExternal =
    /external_attendees/i.test(msg) &&
    /schema cache|column|Could not find|does not exist|PGRST204/i.test(msg);
  if (!missingExternal) throw error;

  const guestOnly = prepared.some((r) => r.person_id == null || r.person_id === '');
  if (guestOnly) {
    throw new Error(
      'Database needs migration for guest activities: in Supabase → SQL Editor, run `supabase/migrations/20260412120000_add_activities_external_attendees.sql`. Then Dashboard → Settings → API → reload schema (or wait ~1 min).',
    );
  }

  const stripped = prepared.map(({ external_attendees: _ext, ...rest }) => rest);
  const retry = await supabase.from('activities').upsert(stripped, { onConflict: 'id' });
  if (retry.error) throw retry.error;
  if (!warnedActivitiesExternalAttendees) {
    warnedActivitiesExternalAttendees = true;
    console.warn(
      'store: activities.external_attendees missing from DB — saved without guest text. Run supabase/migrations/20260412120000_add_activities_external_attendees.sql',
    );
  }
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

async function upsertProjects(rows) {
  if (!rows || rows.length === 0) return;
  const prepared = rows.map(projectRowForDb);
  const tryUpsert = async (payload) => supabase.from('projects').upsert(payload, { onConflict: 'id' });

  let { error } = await tryUpsert(prepared);
  if (!error) return;

  const isMissingColumn = (err, column) => {
    const msg = String(err?.message || '');
    return new RegExp(column, 'i').test(msg) &&
      /projects|schema cache|column|Could not find|does not exist|PGRST204/i.test(msg);
  };

  if (isMissingColumn(error, 'cover_image_url')) {
    const stripped = prepared.map(({ cover_image_url: _c, ...rest }) => rest);
    ({ error } = await tryUpsert(stripped));
    if (!error) return;
  }

  if (isMissingColumn(error, 'engagement_type')) {
    const stripped = prepared.map(({ engagement_type: _e, cover_image_url: _c, ...rest }) => rest);
    ({ error } = await tryUpsert(stripped));
    if (!error) return;
  }

  throw error;
}

export async function pushSnapshotToSupabase(snapshot) {
  await upsertAll('clients', (snapshot.clients || []).map(companyRowForDb));
  await upsertClientContacts(snapshot.client_contacts || []);
  await upsertAll('people', snapshot.people || []);
  await upsertProjects(snapshot.projects || []);
  await upsertProjectClients(snapshot.project_clients || []);
  await upsertAll('project_assignments', snapshot.project_assignments || []);
  await upsertActivitiesApp(snapshot.activities || []);
  await upsertAll('project_tasks', snapshot.project_tasks || []);
  await upsertUsersApp(snapshot.users || []);
  await upsertAll('sessions_app', snapshot.sessions || []);
  const settingsRow = { id: 1, ...(snapshot.settings || {}) };
  await upsertAll('settings_app', [settingsRow], 'id');
  await upsertAll('audit_log', snapshot.audit_log || []);
  await upsertOptionalTable('issues_app', snapshot.issues || [], 'id', 'issues');
  await upsertOptionalTable('notifications_app', snapshot.notifications || [], 'id', 'notifications');
  await upsertOptionalTable('backlogs_app', snapshot.backlogs || [], 'id', 'backlogs');
  await upsertOptionalTable('project_phases_app', snapshot.project_phases || [], 'id', 'phases');
  await upsertOptionalTable('project_work_packages_app', snapshot.work_packages || [], 'id', 'work_packages');
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
  const snap = JSON.parse(JSON.stringify(snapshot));
  (async () => {
    try {
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
    const { id: _id, updated_at: _updatedAt, ...settings } = settingsRow;
    const remote = {
      clients: clientsRes.data || [],
      client_contacts: clientContactsMissing ? [] : clientContactsRes.data || [],
      project_clients: projectClientsMissing ? [] : projectClientsRes.data || [],
      people: peopleRes.data || [],
      projects: projectsRes.data || [],
      project_assignments: assignRes.data || [],
      activities: activitiesRes.data || [],
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
  await upsertProjects(snap.projects || []);
  await upsertProjectClients(snap.project_clients || []);
}

export { supabase };
