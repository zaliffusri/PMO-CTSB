import { createClient } from '@supabase/supabase-js';
import { normalizeTaskStatus } from '../lib/taskStatus.js';
import { idsInSameLogicalGroup } from '../lib/activityLogicalGroup.js';
import { defaultSettings } from '../lib/defaultSettings.js';
import { formatClientNames } from '../lib/projectClients.js';
import { nextEticketNo } from '../lib/issueTicketNo.js';
import { normalizeModuleCode, moduleLabelForCode } from '../lib/epbtModules.js';
import {
  parseIncidentType,
  categoryForIncidentType,
  parseIntakeChannel,
  ISSUE_INCIDENT_TYPE_SET,
  ISSUE_INTAKE_CHANNEL_SET,
} from '../lib/issueConstants.js';
import { cleanExternalTicketRef, normalizeBacklogRef } from '../lib/issueBacklogLink.js';
import { normalizeBacklogStatus } from '../lib/backlogConstants.js';
let warnedSupabase = false;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasSupabase = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
const allowLocalStore = process.env.ALLOW_LOCAL_STORE === '1';
if (!hasSupabase && !allowLocalStore) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (or set ALLOW_LOCAL_STORE=1)');
}
const supabase = hasSupabase
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

const AUDIT_LOG_MAX = 5000;

function emptyData() {
  return {
    people: [],
    projects: [],
    project_assignments: [],
    activities: [],
    project_tasks: [],
    clients: [],
    client_contacts: [],
    project_clients: [],
    users: [],
    sessions: [],
    settings: defaultSettings(),
    audit_log: [],
    issues: [],
    notifications: [],
    backlogs: [],
    project_phases: [],
    work_packages: [],
    attachments: [],
    backlog_comments: [],
  };
}

function save(data) {
  // Runtime persistence is Supabase-only (no local file writes).
  queueSupabaseSync(data);
}

let syncInFlight = false;
let syncQueued = false;
let warnedUsersAppActiveColumn = false;
let warnedUsersAppAvatarColumn = false;
let warnedActivitiesExternalAttendees = false;
let warnedClientContactsTable = false;
let warnedProjectClientsTable = false;

/** Values some deployments use for `users_app.status` (NOT NULL in DB). */
const USER_ROW_STATUSES = new Set(['active', 'inactive', 'pending', 'suspended']);

/** DB: `active` boolean; some DBs also have `status` text NOT NULL — always set a valid default. */
function normalizeUserRow(u) {
  if (!u || typeof u !== 'object') return u;
  const raw = u.status != null ? String(u.status).trim().toLowerCase() : '';
  const status = USER_ROW_STATUSES.has(raw) ? raw : 'active';
  return { ...u, active: u.active === false ? false : true, status };
}

async function upsertAll(table, rows, onConflict = 'id') {
  if (!rows || rows.length === 0) {
    return;
  }
  const { error } = await supabase.from(table).upsert(rows, { onConflict });
  if (error) throw error;
}

/**
 * Upsert users with graceful fallbacks for missing optional columns.
 *  - `active`  → migration: supabase/migrations/*_add_users_app_active.sql
 *  - `avatar_url` → migration: supabase/migrations/*_add_users_app_avatar_url.sql
 */
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

/**
 * Upsert activities; if `external_attendees` is missing in DB / PostgREST schema cache, retry without it.
 * Guest-only rows (no person_id) cannot be saved until migration is applied — see error message.
 * Migration: supabase/migrations/20260412120000_add_activities_external_attendees.sql
 */
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

function companyRowForDb(c) {
  return {
    id: c.id,
    name: c.name,
    created_at: c.created_at,
  };
}

function projectRowForDb(p) {
  const { client_id: _c, tags: _t, ...rest } = p;
  return { ...rest, tags: [] };
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

let warnedIssuesTable = false;
let warnedNotificationsTable = false;
let warnedBacklogsTable = false;
let warnedPhasesTable = false;
let warnedWorkPackagesTable = false;
let warnedBacklogCommentsTable = false;

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

async function pushSnapshotToSupabase(snapshot) {
  await upsertAll('clients', (snapshot.clients || []).map(companyRowForDb));
  await upsertClientContacts(snapshot.client_contacts || []);
  await upsertAll('people', snapshot.people || []);
  await upsertAll('projects', (snapshot.projects || []).map(projectRowForDb));
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

function queueSupabaseSync(snapshot) {
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
      if (syncQueued) {
        syncQueued = false;
        queueSupabaseSync(data);
      }
    }
  })();
}

async function loadFromSupabase() {
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
      backlogs: backlogsMissing ? [] : (backlogsRes.data || []).map((b) => ({
        ...b,
        status: normalizeBacklogStatus(b.status),
      })),
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

function nextId(arr) {
  const ids = arr.map(x => x.id).filter(Boolean);
  return ids.length ? Math.max(...ids) + 1 : 1;
}

function migrateLegacyClientContacts(snapshot) {
  if (!snapshot.client_contacts) snapshot.client_contacts = [];
  for (const c of snapshot.clients || []) {
    if (!c.contact_name && !c.email && !c.phone) continue;
    const hasContact = snapshot.client_contacts.some((cc) => cc.client_id === c.id);
    if (!hasContact) {
      snapshot.client_contacts.push({
        id: nextId(snapshot.client_contacts),
        client_id: c.id,
        contact_name: c.contact_name || null,
        email: c.email || null,
        phone: c.phone || null,
        created_at: c.created_at || new Date().toISOString(),
      });
    }
    delete c.contact_name;
    delete c.email;
    delete c.phone;
  }
  return snapshot;
}

function migrateLegacyProjectClients(snapshot) {
  if (!snapshot.project_clients) snapshot.project_clients = [];
  for (const p of snapshot.projects || []) {
    if (p.client_id == null || p.client_id === '') continue;
    const clientId = +p.client_id;
    if (!Number.isFinite(clientId)) continue;
    const exists = snapshot.project_clients.some(
      (pc) => pc.project_id === p.id && pc.client_id === clientId,
    );
    if (!exists) {
      snapshot.project_clients.push({
        id: nextId(snapshot.project_clients),
        project_id: p.id,
        client_id: clientId,
        created_at: p.created_at || new Date().toISOString(),
      });
    }
    delete p.client_id;
  }
  return snapshot;
}

async function loadInitialData() {
  const remote = await loadFromSupabase();
  const base = remote || emptyData();
  return migrateLegacyProjectClients(migrateLegacyClientContacts(base));
}

let data = await loadInitialData();

export function resetLocalDemoData() {
  if (!allowLocalStore) return false;
  data = emptyData();
  return true;
}

export const store = {
  get people() { return [...data.people]; },
  get projects() { return [...data.projects]; },
  get project_assignments() { return [...data.project_assignments]; },
  get activities() { return [...data.activities]; },
  get project_tasks() { return [...data.project_tasks]; },
  get clients() { return [...data.clients]; },
  get client_contacts() { return [...(data.client_contacts || [])]; },
  get project_clients() { return [...(data.project_clients || [])]; },
  get users() { return [...data.users]; },
  get issues() { return [...(data.issues || [])]; },
  get notifications() { return [...(data.notifications || [])]; },
  get backlogs() { return [...(data.backlogs || [])]; },
  get project_phases() { return [...(data.project_phases || [])]; },
  get work_packages() { return [...(data.work_packages || [])]; },
  get attachments() { return [...(data.attachments || [])]; },
  get backlog_comments() { return [...(data.backlog_comments || [])]; },

  getClientsForProject(projectId) {
    const links = (data.project_clients || []).filter((pc) => pc.project_id === projectId);
    return links
      .map((pc) => data.clients.find((c) => c.id === pc.client_id))
      .filter(Boolean)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  },

  getClientIdsForProject(projectId) {
    return this.getClientsForProject(projectId).map((c) => c.id);
  },

  linkProjectClient(projectId, clientId) {
    if (!data.project_clients) data.project_clients = [];
    const pid = +projectId;
    const cid = +clientId;
    if (!Number.isFinite(pid) || !Number.isFinite(cid)) return false;
    if (data.project_clients.some((pc) => pc.project_id === pid && pc.client_id === cid)) return true;
    data.project_clients.push({
      id: nextId(data.project_clients),
      project_id: pid,
      client_id: cid,
      created_at: new Date().toISOString(),
    });
    save(data);
    return true;
  },

  setProjectClients(projectId, clientIds) {
    if (!data.project_clients) data.project_clients = [];
    const pid = +projectId;
    const ids = [...new Set((clientIds || []).map((id) => +id).filter((id) => Number.isFinite(id) && id > 0))];
    data.project_clients = data.project_clients.filter((pc) => pc.project_id !== pid);
    ids.forEach((cid) => {
      if (data.clients.some((c) => c.id === cid)) {
        data.project_clients.push({
          id: nextId(data.project_clients),
          project_id: pid,
          client_id: cid,
          created_at: new Date().toISOString(),
        });
      }
    });
    save(data);
  },

  projectWithClients(project) {
    if (!project) return project;
    const clients = this.getClientsForProject(project.id);
    const client_ids = clients.map((c) => c.id);
    const client_name = formatClientNames(clients);
    const { client_id: _legacy, ...rest } = project;
    return {
      ...rest,
      clients,
      client_ids,
      client_name,
      client_id: client_ids[0] ?? null,
    };
  },
  get sessions() { return [...data.sessions]; },
  get audit_log() { return [...(data.audit_log || [])]; },

  appendAuditLog(actor, entry) {
    if (!data.audit_log) data.audit_log = [];
    const row = {
      id: nextId(data.audit_log),
      at: new Date().toISOString(),
      user_id: actor?.id ?? null,
      user_email: actor?.email ?? null,
      user_name: actor?.name ?? null,
      action: entry.action,
      target_type: entry.target_type,
      target_id: entry.target_id ?? null,
      summary: String(entry.summary || ''),
      detail: entry.detail !== undefined ? entry.detail : null,
    };
    data.audit_log.push(row);
    if (data.audit_log.length > AUDIT_LOG_MAX) {
      data.audit_log = data.audit_log.slice(-AUDIT_LOG_MAX);
    }
    save(data);
  },

  listAuditLog({ limit = 100, offset = 0, user_id: filterUserId } = {}) {
    let rows = [...(data.audit_log || [])].sort((a, b) => new Date(b.at) - new Date(a.at));
    if (filterUserId != null && filterUserId !== '') {
      const uid = +filterUserId;
      if (!Number.isNaN(uid)) {
        rows = rows.filter((r) => r.user_id === uid);
      }
    }
    const total = rows.length;
    const lim = Math.min(500, Math.max(1, +limit || 100));
    const off = Math.max(0, +offset || 0);
    return { entries: rows.slice(off, off + lim), total, limit: lim, offset: off };
  },

  getSettings() {
    const d = defaultSettings();
    const s = data.settings || {};
    const activity_locations =
      Array.isArray(s.activity_locations) && s.activity_locations.length > 0
        ? s.activity_locations.map((x) => String(x).trim()).filter(Boolean)
        : d.activity_locations;
    const mileage = { ...(s.mileage_from_office_km && typeof s.mileage_from_office_km === 'object' ? s.mileage_from_office_km : {}) };
    for (const k of Object.keys(mileage)) {
      if (!activity_locations.includes(k)) delete mileage[k];
    }
    return {
      ...d,
      ...s,
      activity_locations,
      mileage_from_office_km: mileage,
      reference_office_name: s.reference_office_name != null && String(s.reference_office_name).trim()
        ? String(s.reference_office_name).trim()
        : d.reference_office_name,
      general_notes: s.general_notes != null ? String(s.general_notes) : d.general_notes,
      currency_code: s.currency_code != null && String(s.currency_code).trim()
        ? String(s.currency_code).trim().toUpperCase().slice(0, 8)
        : d.currency_code,
      org_display_name: s.org_display_name != null && String(s.org_display_name).trim()
        ? String(s.org_display_name).trim().slice(0, 80)
        : d.org_display_name,
      org_tagline: s.org_tagline != null ? String(s.org_tagline).slice(0, 200) : d.org_tagline,
      org_logo_url: s.org_logo_url || null,
      org_banner_url: s.org_banner_url || null,
    };
  },

  updateSettings(patch) {
    const cur = this.getSettings();
    const next = { ...cur, ...patch };
    if (patch.activity_locations) {
      next.activity_locations = patch.activity_locations.map((x) => String(x).trim()).filter(Boolean);
    }
    if (patch.mileage_from_office_km !== undefined) {
      next.mileage_from_office_km = { ...patch.mileage_from_office_km };
    }
    const allowed = new Set(next.activity_locations);
    next.mileage_from_office_km = { ...(next.mileage_from_office_km || {}) };
    for (const k of Object.keys(next.mileage_from_office_km)) {
      if (!allowed.has(k)) delete next.mileage_from_office_km[k];
    }
    data.settings = next;
    save(data);
  },

  findClientByName(name) {
    const q = (name || '').trim().toLowerCase();
    if (!q) return null;
    return data.clients.find((c) => (c.name || '').trim().toLowerCase() === q) || null;
  },

  findClientByShortCode(code) {
    const q = (code || '').trim().toUpperCase();
    if (!q) return null;
    return data.clients.find((c) => String(c.short_code || '').toUpperCase() === q) || null;
  },

  findOrCreateClient(name, shortCode = null) {
    const trimmed = (name || '').trim();
    if (!trimmed && !shortCode) return null;
    if (shortCode) {
      const byCode = this.findClientByShortCode(shortCode);
      if (byCode) return byCode.id;
    }
    if (trimmed) {
      const existing = this.findClientByName(trimmed);
      if (existing) {
        if (shortCode && !existing.short_code) {
          this.updateClient(existing.id, { short_code: shortCode });
        }
        return existing.id;
      }
    }
    return this.addClient({
      name: trimmed || String(shortCode).trim(),
      short_code: shortCode ? String(shortCode).trim().toUpperCase() : null,
    });
  },

  addClient(row) {
    const id = nextId(data.clients);
    const created_at = new Date().toISOString();
    const { contact_name: _cn, email: _e, phone: _p, ...company } = row;
    data.clients.push({
      id,
      name: (company.name || '').trim(),
      short_code: company.short_code != null ? String(company.short_code).trim().toUpperCase() || null : null,
      created_at,
    });
    save(data);
    return id;
  },

  addClientContact(row) {
    if (!data.client_contacts) data.client_contacts = [];
    const id = nextId(data.client_contacts);
    const created_at = new Date().toISOString();
    data.client_contacts.push({
      id,
      client_id: row.client_id,
      contact_name: row.contact_name || null,
      email: row.email || null,
      phone: row.phone || null,
      created_at,
    });
    save(data);
    return id;
  },

  updateClient(id, row) {
    const i = data.clients.findIndex(c => c.id === id);
    if (i === -1) return false;
    const patch = { ...row };
    delete patch.contact_name;
    delete patch.email;
    delete patch.phone;
    if (patch.name !== undefined) patch.name = (patch.name || '').trim();
    data.clients[i] = { ...data.clients[i], ...patch };
    save(data);
    return true;
  },

  updateClientContact(id, row) {
    if (!data.client_contacts) data.client_contacts = [];
    const i = data.client_contacts.findIndex((cc) => cc.id === id);
    if (i === -1) return false;
    data.client_contacts[i] = {
      ...data.client_contacts[i],
      contact_name: row.contact_name !== undefined ? row.contact_name || null : data.client_contacts[i].contact_name,
      email: row.email !== undefined ? row.email || null : data.client_contacts[i].email,
      phone: row.phone !== undefined ? row.phone || null : data.client_contacts[i].phone,
    };
    save(data);
    return true;
  },

  deleteClientContact(id) {
    if (!data.client_contacts) return false;
    const i = data.client_contacts.findIndex((cc) => cc.id === id);
    if (i === -1) return false;
    data.client_contacts.splice(i, 1);
    save(data);
    return true;
  },

  deleteClient(id) {
    const i = data.clients.findIndex(c => c.id === id);
    if (i === -1) return false;
    data.clients.splice(i, 1);
    if (data.client_contacts) {
      data.client_contacts = data.client_contacts.filter((cc) => cc.client_id !== id);
    }
    if (data.project_clients) {
      data.project_clients = data.project_clients.filter((pc) => pc.client_id !== id);
    }
    save(data);
    return true;
  },

  getClientContacts(clientId) {
    return (data.client_contacts || []).filter((cc) => cc.client_id === clientId);
  },

  addPerson(row) {
    const id = nextId(data.people);
    const created_at = new Date().toISOString();
    data.people.push({ id, ...row, created_at });
    save(data);
    return id;
  },
  updatePerson(id, row) {
    const i = data.people.findIndex(p => p.id === id);
    if (i === -1) return false;
    data.people[i] = { ...data.people[i], ...row };
    save(data);
    return true;
  },
  deletePerson(id) {
    const i = data.people.findIndex(p => p.id === id);
    if (i === -1) return false;
    data.people.splice(i, 1);
    data.project_assignments = data.project_assignments.filter(a => a.person_id !== id);
    data.activities = data.activities.filter(a => a.person_id !== id);
    data.project_tasks.forEach((t) => {
      if (t.assignee_id === id) t.assignee_id = null;
    });
    save(data);
    return true;
  },

  addProject(row) {
    const id = nextId(data.projects);
    const created_at = new Date().toISOString();
    const { client_id, client_ids, tags: _tags, classification, engagement_type, ...rest } = row;
    const normalizedClassification = classification != null && String(classification).trim()
      ? String(classification).trim()
      : null;
    const normalizedEngagementType = engagement_type != null && String(engagement_type).trim()
      ? String(engagement_type).trim()
      : null;
    data.projects.push({
      id,
      status: 'active',
      classification: normalizedClassification,
      engagement_type: normalizedEngagementType,
      ...rest,
      created_at,
    });
    const ids = Array.isArray(client_ids)
      ? client_ids
      : client_id != null && client_id !== ''
        ? [client_id]
        : [];
    if (ids.length) this.setProjectClients(id, ids);
    else save(data);
    return id;
  },
  updateProject(id, row) {
    const i = data.projects.findIndex(p => p.id === id);
    if (i === -1) return false;
    const { client_id, client_ids, ...patch } = row;
    if (patch.classification !== undefined) {
      patch.classification =
        patch.classification != null && String(patch.classification).trim()
          ? String(patch.classification).trim()
          : null;
    }
    if (patch.engagement_type !== undefined) {
      patch.engagement_type =
        patch.engagement_type != null && String(patch.engagement_type).trim()
          ? String(patch.engagement_type).trim()
          : null;
    }
    delete patch.tags;
    delete patch.client_id;
    delete patch.client_ids;
    data.projects[i] = { ...data.projects[i], ...patch };
    if (client_ids !== undefined) {
      this.setProjectClients(id, client_ids);
    } else if (client_id !== undefined) {
      this.setProjectClients(id, client_id != null && client_id !== '' ? [client_id] : []);
    } else {
      save(data);
    }
    return true;
  },
  deleteProject(id) {
    const i = data.projects.findIndex(p => p.id === id);
    if (i === -1) return false;
    data.projects.splice(i, 1);
    if (data.project_clients) {
      data.project_clients = data.project_clients.filter((pc) => pc.project_id !== id);
    }
    data.project_assignments = data.project_assignments.filter(a => a.project_id !== id);
    data.project_tasks = data.project_tasks.filter(t => t.project_id !== id);
    if (data.backlogs) data.backlogs = data.backlogs.filter((b) => b.project_id !== id);
    if (data.project_phases) data.project_phases = data.project_phases.filter((p) => p.project_id !== id);
    if (data.work_packages) data.work_packages = data.work_packages.filter((w) => w.project_id !== id);
    data.activities.forEach(a => { if (a.project_id === id) a.project_id = null; });
    save(data);
    return true;
  },

  addAssignment(row) {
    if (data.project_assignments.some(a => a.project_id === row.project_id && a.person_id === row.person_id)) {
      const err = new Error('Person is already assigned to this project');
      err.code = 'DUPLICATE';
      throw err;
    }
    const id = nextId(data.project_assignments);
    const created_at = new Date().toISOString();
    data.project_assignments.push({ id, allocation_percent: 100, ...row, created_at });
    save(data);
    return id;
  },
  updateAssignment(id, row) {
    const i = data.project_assignments.findIndex(a => a.id === id);
    if (i === -1) return false;
    data.project_assignments[i] = { ...data.project_assignments[i], ...row };
    save(data);
    return true;
  },
  deleteAssignment(id) {
    const i = data.project_assignments.findIndex(a => a.id === id);
    if (i === -1) return false;
    data.project_assignments.splice(i, 1);
    save(data);
    return true;
  },

  addActivity(row) {
    const id = nextId(data.activities);
    const created_at = new Date().toISOString();
    data.activities.push({ id, ...row, created_at });
    save(data);
    return id;
  },
  updateActivity(id, row) {
    const i = data.activities.findIndex(a => a.id === id);
    if (i === -1) return false;
    data.activities[i] = { ...data.activities[i], ...row };
    save(data);
    return true;
  },
  /** Removes locally and deletes the row in Supabase (upsert alone does not remove missing rows). */
  async deleteActivity(id) {
    const i = data.activities.findIndex(a => a.id === id);
    if (i === -1) return false;
    data.activities.splice(i, 1);
    save(data);
    if (supabase) {
      const { error } = await supabase.from('activities').delete().eq('id', id);
      if (error) throw error;
    }
    return true;
  },

  /**
   * Delete every DB row for the same logical activity (multi-assignee creates one row per person).
   * Uses the same grouping key as the calendar UI.
   */
  async deleteActivityLogicalGroupByAnyMemberId(id) {
    const ids = idsInSameLogicalGroup(data.activities, id);
    if (ids.length === 0) return { deleted: 0 };
    const idSet = new Set(ids);
    const before = data.activities.length;
    data.activities = data.activities.filter((a) => !idSet.has(a.id));
    if (data.activities.length === before) return { deleted: 0 };
    save(data);
    if (supabase) {
      const { error } = await supabase.from('activities').delete().in('id', ids);
      if (error) throw error;
    }
    return { deleted: ids.length };
  },

  /**
   * Re-read activities from Supabase into memory. Use before listing so direct DB edits
   * (e.g. SQL/dashboard deletes) are visible without restarting the server.
   */
  async refreshActivitiesFromSupabase() {
    if (!supabase) return;
    const { data: rows, error } = await supabase.from('activities').select('*').order('id', { ascending: true });
    if (error) throw error;
    data.activities = rows || [];
  },

  addProjectTask(row) {
    const id = nextId(data.project_tasks);
    const created_at = new Date().toISOString();
    const project_id = +row.project_id;
    const parent_id = row.parent_id != null && row.parent_id !== '' ? +row.parent_id : null;
    const task_kind = row.task_kind === 'group' ? 'group' : 'task';
    let assignee_id = row.assignee_id != null && row.assignee_id !== '' ? +row.assignee_id : null;
    if (task_kind === 'group') assignee_id = null;
    let prog = task_kind === 'group' ? 0 : (row.progress_percent ?? 0);
    let st = row.status && ['new', 'ongoing', 'done'].includes(row.status) ? row.status : 'new';
    if (task_kind === 'group') st = 'new';
    else if (prog >= 100) st = 'done';
    const siblings = data.project_tasks.filter((t) =>
      t.project_id === project_id &&
      (parent_id == null ? t.parent_id == null : t.parent_id === parent_id),
    );
    const sort_order = row.sort_order != null ? row.sort_order : siblings.reduce((m, t) => Math.max(m, t.sort_order ?? 0), -1) + 1;
    data.project_tasks.push({
      id,
      project_id,
      name: row.name,
      planned_start_date: row.planned_start_date || null,
      planned_end_date: row.planned_end_date || null,
      actual_start_date: row.actual_start_date || null,
      actual_end_date: row.actual_end_date || null,
      progress_percent: prog,
      sort_order,
      parent_id,
      task_kind,
      assignee_id,
      status: st,
      backlog_id: row.backlog_id != null && row.backlog_id !== '' ? +row.backlog_id : null,
      work_package_id: row.work_package_id != null && row.work_package_id !== '' ? +row.work_package_id : null,
      estimated_hours: row.estimated_hours != null && row.estimated_hours !== '' ? +row.estimated_hours : null,
      actual_hours: row.actual_hours != null && row.actual_hours !== '' ? +row.actual_hours : null,
      created_at,
    });
    save(data);
    return id;
  },
  updateProjectTask(id, row) {
    const i = data.project_tasks.findIndex(t => t.id === id);
    if (i === -1) return false;
    data.project_tasks[i] = { ...data.project_tasks[i], ...row };
    save(data);
    return true;
  },
  deleteProjectTask(id) {
    const childIds = data.project_tasks.filter((t) => t.parent_id === id).map((t) => t.id);
    for (const cid of childIds) {
      this.deleteProjectTask(cid);
    }
    const i = data.project_tasks.findIndex(t => t.id === id);
    if (i === -1) return false;
    data.project_tasks.splice(i, 1);
    save(data);
    return true;
  },

  addUser(row) {
    const id = nextId(data.users);
    const created_at = new Date().toISOString();
    const user = normalizeUserRow({ id, role: 'admin', active: true, ...row, created_at });
    data.users.push(user);
    save(data);
    return id;
  },
  findUserByEmail(email) {
    return data.users.find((u) => u.email.toLowerCase() === String(email).toLowerCase()) || null;
  },
  findUserById(id) {
    if (id == null || id === '') return null;
    const n = Number(id);
    if (Number.isNaN(n)) return null;
    return data.users.find((u) => Number(u.id) === n) || null;
  },
  async findUserByIdAny(id) {
    const local = this.findUserById(id);
    if (local) return local;
    if (!supabase) return null;
    const { data: row, error } = await supabase.from('users_app').select('*').eq('id', id).maybeSingle();
    if (error || !row) return null;
    const normalized = normalizeUserRow(row);
    data.users.push(normalized);
    return normalized;
  },
  updateUser(id, row) {
    const n = Number(id);
    const i = data.users.findIndex((u) => Number(u.id) === n);
    if (i === -1) return false;
    data.users[i] = normalizeUserRow({ ...data.users[i], ...row });
    save(data);
    return true;
  },
  async createSession(user_id, token, expires_at) {
    const id = nextId(data.sessions);
    const created_at = new Date().toISOString();
    const session = { id, user_id, token, expires_at, created_at };
    data.sessions.push(session);
    if (supabase) {
      const { error } = await supabase.from('sessions_app').upsert([session], { onConflict: 'id' });
      if (error) {
        data.sessions = data.sessions.filter((s) => s.id !== id);
        throw error;
      }
    }
    save(data);
    return session;
  },
  findSessionByToken(token) {
    return data.sessions.find((s) => s.token === token) || null;
  },
  async findSessionByTokenAny(token) {
    const local = this.findSessionByToken(token);
    if (local) return local;
    if (!supabase) return null;
    const { data: row, error } = await supabase
      .from('sessions_app')
      .select('*')
      .eq('token', token)
      .maybeSingle();
    if (error || !row) return null;
    data.sessions.push(row);
    return row;
  },
  deleteSessionByToken(token) {
    const i = data.sessions.findIndex((s) => s.token === token);
    if (i === -1) return false;
    data.sessions.splice(i, 1);
    save(data);
    return true;
  },
  /** Remove all sessions for a user (e.g. when account deactivated). */
  async deleteSessionsForUser(userId) {
    const n = Number(userId);
    if (Number.isNaN(n)) return;
    const before = data.sessions.length;
    data.sessions = data.sessions.filter((s) => Number(s.user_id) !== n);
    if (data.sessions.length !== before) save(data);
    if (supabase) {
      const { error } = await supabase.from('sessions_app').delete().eq('user_id', n);
      if (error) throw error;
    }
  },
  clearExpiredSessions() {
    const now = new Date().toISOString();
    const before = data.sessions.length;
    data.sessions = data.sessions.filter((s) => !s.expires_at || s.expires_at > now);
    if (data.sessions.length !== before) save(data);
  },

  nextIssueTicketNo(moduleCode = 'XXX') {
    return nextEticketNo(data.issues, moduleCode);
  },

  findIssueByTicketNo(ticketNo) {
    if (!data.issues || !ticketNo) return null;
    const q = String(ticketNo).trim().toUpperCase();
    return data.issues.find((i) => String(i.ticket_no || '').toUpperCase() === q) || null;
  },

  findIssueByExternalTicketRef(ref) {
    if (!data.issues || !ref) return null;
    const q = cleanExternalTicketRef(ref);
    if (!q) return null;
    const qu = q.toUpperCase();
    return data.issues.find((i) => {
      const ir = cleanExternalTicketRef(i.external_ticket_ref);
      return ir && ir.toUpperCase() === qu;
    }) || null;
  },

  findBacklogByRefNo(refNo) {
    if (!data.backlogs || !refNo) return null;
    const q = normalizeBacklogRef(refNo);
    if (!q) return null;
    return data.backlogs.find((b) => normalizeBacklogRef(b.ref_no) === q) || null;
  },

  findBacklogByExternalTicketRef(ref) {
    if (!data.backlogs || !ref) return null;
    const q = cleanExternalTicketRef(ref);
    if (!q) return null;
    const qu = q.toUpperCase();
    return data.backlogs.find((b) => {
      const br = cleanExternalTicketRef(b.external_ticket_ref);
      return br && br.toUpperCase() === qu;
    }) || null;
  },

  addIssue(row) {
    if (!data.issues) data.issues = [];
    const id = nextId(data.issues);
    const now = new Date().toISOString();
    const moduleCode = normalizeModuleCode(row.module_code || row.epbt_module);
    const epbtModule = row.epbt_module != null ? String(row.epbt_module).trim() : moduleLabelForCode(moduleCode);
    const incidentType = row.incident_type && ISSUE_INCIDENT_TYPE_SET.has(row.incident_type)
      ? row.incident_type
      : (parseIncidentType(row.incident_type) || 'issue');
    const intakeChannel = row.intake_channel && ISSUE_INTAKE_CHANNEL_SET.has(row.intake_channel)
      ? row.intake_channel
      : parseIntakeChannel(row.intake_channel);
    const issue = {
      id,
      ticket_no: row.ticket_no || this.nextIssueTicketNo(moduleCode),
      title: String(row.title || '').trim(),
      description: row.description != null ? String(row.description) : null,
      status: row.status || 'open',
      priority: row.priority || 'medium',
      category: row.category || categoryForIncidentType(incidentType),
      incident_type: incidentType,
      module_code: moduleCode,
      epbt_module: epbtModule || null,
      intake_channel: intakeChannel,
      client_pic: row.client_pic != null ? String(row.client_pic).trim() || null : null,
      action_taken: row.action_taken != null ? String(row.action_taken) : null,
      l1_assignee_label: row.l1_assignee_label != null ? String(row.l1_assignee_label).trim() || null : null,
      l2_assignee_label: row.l2_assignee_label != null ? String(row.l2_assignee_label).trim() || null : null,
      backlog_ref: row.backlog_ref != null ? String(row.backlog_ref).trim() || null : null,
      issue_attachment_ref: row.issue_attachment_ref != null ? String(row.issue_attachment_ref).trim() || null : null,
      resolution_attachment_ref: row.resolution_attachment_ref != null ? String(row.resolution_attachment_ref).trim() || null : null,
      project_id: row.project_id != null && row.project_id !== '' ? +row.project_id : null,
      client_id: row.client_id != null && row.client_id !== '' ? +row.client_id : null,
      reporter_user_id: row.reporter_user_id != null ? +row.reporter_user_id : null,
      assignee_person_id: row.assignee_person_id != null && row.assignee_person_id !== '' ? +row.assignee_person_id : null,
      external_ticket_ref: row.external_ticket_ref != null ? String(row.external_ticket_ref).trim() || null : null,
      support_level: ['L1', 'L2', 'L3'].includes(String(row.support_level || '').toUpperCase())
        ? String(row.support_level).toUpperCase()
        : 'L1',
      resolution_method: row.resolution_method || null,
      resolution_notes: row.resolution_notes != null ? String(row.resolution_notes) : null,
      created_at: row.created_at || now,
      updated_at: row.updated_at || now,
      resolved_at: row.resolved_at || null,
    };
    data.issues.push(issue);
    save(data);
    return id;
  },

  updateIssue(id, patch) {
    if (!data.issues) data.issues = [];
    const i = data.issues.findIndex((x) => x.id === +id);
    if (i === -1) return false;
    const cur = data.issues[i];
    const next = { ...cur, ...patch, updated_at: new Date().toISOString() };
    if (patch.status === 'resolved' || patch.status === 'closed') {
      if (!cur.resolved_at) next.resolved_at = new Date().toISOString();
    }
    if (patch.status === 'open' || patch.status === 'in_progress') {
      next.resolved_at = null;
    }
    data.issues[i] = next;
    save(data);
    return true;
  },

  addNotification(row) {
    if (!data.notifications) data.notifications = [];
    const id = nextId(data.notifications);
    const notification = {
      id,
      user_id: +row.user_id,
      type: row.type || 'info',
      title: String(row.title || ''),
      body: row.body != null ? String(row.body) : null,
      link: row.link || null,
      entity_type: row.entity_type || null,
      entity_id: row.entity_id ?? null,
      read_at: null,
      created_at: new Date().toISOString(),
    };
    data.notifications.push(notification);
    save(data);
    return id;
  },

  markNotificationRead(id, userId) {
    if (!data.notifications) return false;
    const i = data.notifications.findIndex((n) => n.id === +id && n.user_id === +userId);
    if (i === -1) return false;
    if (!data.notifications[i].read_at) {
      data.notifications[i].read_at = new Date().toISOString();
      save(data);
    }
    return true;
  },

  markAllNotificationsRead(userId) {
    if (!data.notifications) return 0;
    const now = new Date().toISOString();
    let count = 0;
    data.notifications.forEach((n) => {
      if (n.user_id === +userId && !n.read_at) {
        n.read_at = now;
        count += 1;
      }
    });
    if (count) save(data);
    return count;
  },

  nextBacklogRefNo() {
    if (!data.backlogs) data.backlogs = [];
    const year = new Date().getFullYear();
    const prefix = `BLG-${year}-`;
    const nums = data.backlogs
      .filter((b) => b.ref_no && String(b.ref_no).startsWith(prefix))
      .map((b) => parseInt(String(b.ref_no).slice(prefix.length), 10))
      .filter((n) => Number.isFinite(n));
    const next = nums.length ? Math.max(...nums) + 1 : 1;
    return `${prefix}${String(next).padStart(4, '0')}`;
  },

  addBacklog(row) {
    if (!data.backlogs) data.backlogs = [];
    const id = nextId(data.backlogs);
    const now = new Date().toISOString();
    const item = {
      id,
      ref_no: row.ref_no || this.nextBacklogRefNo(),
      project_id: +row.project_id,
      title: String(row.title || '').trim(),
      description: row.description != null ? String(row.description) : null,
      item_type: row.item_type || 'scope',
      source: row.source || 'manual',
      status: normalizeBacklogStatus(row.status || 'open'),
      priority: row.priority || 'medium',
      issue_id: row.issue_id != null && row.issue_id !== '' ? +row.issue_id : null,
      task_id: row.task_id != null && row.task_id !== '' ? +row.task_id : null,
      assignee_person_id: row.assignee_person_id != null && row.assignee_person_id !== '' ? +row.assignee_person_id : null,
      created_by_user_id: row.created_by_user_id != null && row.created_by_user_id !== '' ? +row.created_by_user_id : null,
      module_code: row.module_code != null ? normalizeModuleCode(row.module_code) : null,
      client_id: row.client_id != null && row.client_id !== '' ? +row.client_id : null,
      external_ticket_ref: row.external_ticket_ref != null
        ? cleanExternalTicketRef(row.external_ticket_ref)
        : null,
      effort_days: row.effort_days != null && row.effort_days !== '' ? +row.effort_days : null,
      estimated_hours: row.estimated_hours != null && row.estimated_hours !== ''
        ? +row.estimated_hours
        : (row.effort_days != null && row.effort_days !== '' ? +row.effort_days * 8 : null),
      actual_hours: row.actual_hours != null && row.actual_hours !== '' ? +row.actual_hours : null,
      phase_id: row.phase_id != null && row.phase_id !== '' ? +row.phase_id : null,
      work_package_id: row.work_package_id != null && row.work_package_id !== '' ? +row.work_package_id : null,
      created_at: now,
      updated_at: now,
    };
    data.backlogs.push(item);
    save(data);
    return id;
  },

  updateBacklog(id, patch) {
    if (!data.backlogs) data.backlogs = [];
    const i = data.backlogs.findIndex((b) => b.id === +id);
    if (i === -1) return false;
    const next = { ...patch };
    if (next.status != null) next.status = normalizeBacklogStatus(next.status);
    data.backlogs[i] = { ...data.backlogs[i], ...next, updated_at: new Date().toISOString() };
    save(data);
    return true;
  },

  listBacklogComments(backlogId) {
    return (data.backlog_comments || [])
      .filter((c) => c.backlog_id === +backlogId)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  },

  addBacklogComment(row) {
    if (!data.backlog_comments) data.backlog_comments = [];
    const id = nextId(data.backlog_comments);
    const comment = {
      id,
      backlog_id: +row.backlog_id,
      author_user_id: +row.author_user_id,
      body: String(row.body || '').trim(),
      mentioned_person_ids: Array.isArray(row.mentioned_person_ids)
        ? row.mentioned_person_ids.map((x) => +x).filter(Number.isFinite)
        : [],
      created_at: new Date().toISOString(),
    };
    data.backlog_comments.push(comment);
    save(data);
    return id;
  },

  findBacklogByIssueId(issueId) {
    return (data.backlogs || []).find((b) => b.issue_id === +issueId) || null;
  },

  addProjectPhase(row) {
    if (!data.project_phases) data.project_phases = [];
    const id = nextId(data.project_phases);
    const now = new Date().toISOString();
    const phase = {
      id,
      project_id: +row.project_id,
      work_package_id: row.work_package_id != null && row.work_package_id !== '' ? +row.work_package_id : null,
      name: String(row.name || '').trim(),
      phase_key: row.phase_key || 'custom',
      sort_order: row.sort_order != null ? +row.sort_order : 99,
      status: row.status || 'pending',
      target_date: row.target_date || null,
      completed_date: row.completed_date || null,
      progress_percent: row.progress_percent != null ? +row.progress_percent : 0,
      payment_amount: row.payment_amount != null && row.payment_amount !== '' ? +row.payment_amount : null,
      payment_currency: row.payment_currency || 'MYR',
      invoice_no: row.invoice_no || null,
      invoice_date: row.invoice_date || null,
      paid_date: row.paid_date || null,
      payment_status: row.payment_status || 'pending',
      notes: row.notes || null,
      created_at: now,
      updated_at: now,
    };
    data.project_phases.push(phase);
    save(data);
    return id;
  },

  updateProjectPhase(id, patch) {
    if (!data.project_phases) data.project_phases = [];
    const i = data.project_phases.findIndex((p) => p.id === +id);
    if (i === -1) return false;
    const next = { ...data.project_phases[i], ...patch, updated_at: new Date().toISOString() };
    if (patch.status === 'completed' && !data.project_phases[i].completed_date && !patch.completed_date) {
      next.completed_date = new Date().toISOString().slice(0, 10);
    }
    data.project_phases[i] = next;
    save(data);
    return true;
  },

  initProjectPhasesFromTemplate(projectId, template, workPackageId = null) {
    const ids = [];
    for (const row of template) {
      const id = this.addProjectPhase({
        project_id: projectId,
        work_package_id: workPackageId,
        name: row.name,
        phase_key: row.phase_key,
        sort_order: row.sort_order,
        payment_status: row.payment_status || 'pending',
        status: row.sort_order === 1 ? 'in_progress' : 'pending',
        progress_percent: row.sort_order === 1 ? 0 : 0,
      });
      ids.push(id);
    }
    return ids;
  },

  addWorkPackage(row) {
    if (!data.work_packages) data.work_packages = [];
    const id = nextId(data.work_packages);
    const now = new Date().toISOString();
    const siblings = data.work_packages.filter((w) => w.project_id === +row.project_id);
    const sort_order = row.sort_order != null
      ? +row.sort_order
      : siblings.reduce((m, w) => Math.max(m, w.sort_order ?? 0), -1) + 1;
    const wp = {
      id,
      project_id: +row.project_id,
      name: String(row.name || '').trim(),
      description: row.description != null ? String(row.description) : null,
      classification: String(row.classification || '').trim(),
      status: row.status || 'active',
      start_date: row.start_date || null,
      end_date: row.end_date || null,
      sort_order,
      created_at: now,
      updated_at: now,
    };
    data.work_packages.push(wp);
    save(data);
    return id;
  },

  updateWorkPackage(id, patch) {
    if (!data.work_packages) data.work_packages = [];
    const i = data.work_packages.findIndex((w) => w.id === +id);
    if (i === -1) return false;
    data.work_packages[i] = { ...data.work_packages[i], ...patch, updated_at: new Date().toISOString() };
    save(data);
    return true;
  },

  deleteWorkPackage(id) {
    if (!data.work_packages) data.work_packages = [];
    const i = data.work_packages.findIndex((w) => w.id === +id);
    if (i === -1) return false;
    data.work_packages.splice(i, 1);
    if (data.project_phases) {
      data.project_phases = data.project_phases.filter((p) => p.work_package_id !== +id);
    }
    data.project_tasks.forEach((t, idx) => {
      if (t.work_package_id === +id) {
        data.project_tasks[idx] = { ...t, work_package_id: null };
      }
    });
    if (data.backlogs) {
      data.backlogs.forEach((b, idx) => {
        if (b.work_package_id === +id) {
          data.backlogs[idx] = { ...b, work_package_id: null };
        }
      });
    }
    save(data);
    return true;
  },

  listAttachments(entityType, entityId) {
    if (!data.attachments) data.attachments = [];
    return data.attachments
      .filter((a) => a.entity_type === entityType && a.entity_id === +entityId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },

  findAttachment(id) {
    if (!data.attachments) return null;
    return data.attachments.find((a) => a.id === +id) || null;
  },

  addAttachment(row) {
    if (!data.attachments) data.attachments = [];
    const id = nextId(data.attachments);
    const now = new Date().toISOString();
    const att = {
      id,
      entity_type: String(row.entity_type),
      entity_id: +row.entity_id,
      kind: row.kind === 'url' ? 'url' : 'file',
      file_name: String(row.file_name || 'file').trim(),
      mime_type: row.mime_type != null ? String(row.mime_type) : null,
      file_size: row.file_size != null ? +row.file_size : null,
      storage_path: row.storage_path != null ? String(row.storage_path) : null,
      external_url: row.external_url != null ? String(row.external_url).trim() || null : null,
      label: row.label != null ? String(row.label).trim() || null : null,
      uploaded_by_user_id: row.uploaded_by_user_id != null ? +row.uploaded_by_user_id : null,
      created_at: row.created_at || now,
    };
    data.attachments.push(att);
    save(data);
    return id;
  },

  deleteAttachment(id) {
    if (!data.attachments) return null;
    const i = data.attachments.findIndex((a) => a.id === +id);
    if (i === -1) return null;
    const [removed] = data.attachments.splice(i, 1);
    save(data);
    return removed;
  },

  /**
   * Push full snapshot to Supabase and await completion.
   * On Vercel/serverless, queued sync in `save()` may not finish after the HTTP response,
   * so routes that mutate data should call this before sending the response.
   */
  async persistToSupabase() {
    if (!supabase) return;
    const snap = JSON.parse(JSON.stringify(data));
    await pushSnapshotToSupabase(snap);
  },
};
