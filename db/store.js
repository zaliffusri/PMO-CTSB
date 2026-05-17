import { createClient } from '@supabase/supabase-js';
import { normalizeTaskStatus } from '../lib/taskStatus.js';
import { idsInSameLogicalGroup } from '../lib/activityLogicalGroup.js';
import { defaultSettings } from '../lib/defaultSettings.js';
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
    users: [],
    sessions: [],
    settings: defaultSettings(),
    audit_log: [],
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

async function pushSnapshotToSupabase(snapshot) {
  await upsertAll('clients', (snapshot.clients || []).map(companyRowForDb));
  await upsertClientContacts(snapshot.client_contacts || []);
  await upsertAll('people', snapshot.people || []);
  await upsertAll(
    'projects',
    (snapshot.projects || []).map((p) => ({ ...p, tags: Array.isArray(p.tags) ? p.tags : [] })),
  );
  await upsertAll('project_assignments', snapshot.project_assignments || []);
  await upsertActivitiesApp(snapshot.activities || []);
  await upsertAll('project_tasks', snapshot.project_tasks || []);
  await upsertUsersApp(snapshot.users || []);
  await upsertAll('sessions_app', snapshot.sessions || []);
  const settingsRow = { id: 1, ...(snapshot.settings || {}) };
  await upsertAll('settings_app', [settingsRow], 'id');
  await upsertAll('audit_log', snapshot.audit_log || []);
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
      peopleRes,
      projectsRes,
      assignRes,
      activitiesRes,
      tasksRes,
      usersRes,
      sessionsRes,
      settingsRes,
      auditRes,
    ] = await Promise.all([
      supabase.from('clients').select('*').order('id', { ascending: true }),
      supabase.from('client_contacts').select('*').order('id', { ascending: true }),
      supabase.from('people').select('*').order('id', { ascending: true }),
      supabase.from('projects').select('*').order('id', { ascending: true }),
      supabase.from('project_assignments').select('*').order('id', { ascending: true }),
      supabase.from('activities').select('*').order('id', { ascending: true }),
      supabase.from('project_tasks').select('*').order('id', { ascending: true }),
      supabase.from('users_app').select('*').order('id', { ascending: true }),
      supabase.from('sessions_app').select('*').order('id', { ascending: true }),
      supabase.from('settings_app').select('*').eq('id', 1).maybeSingle(),
      supabase.from('audit_log').select('*').order('id', { ascending: true }),
    ]);
    const clientContactsMissing =
      clientContactsRes.error &&
      /client_contacts|schema cache|Could not find|does not exist|PGRST204/i.test(String(clientContactsRes.error.message || ''));

    const errs = [
      clientsRes.error,
      clientContactsMissing ? null : clientContactsRes.error,
      peopleRes.error,
      projectsRes.error,
      assignRes.error,
      activitiesRes.error,
      tasksRes.error,
      usersRes.error,
      sessionsRes.error,
      settingsRes.error,
      auditRes.error,
    ].filter(Boolean);
    if (errs.length > 0) throw errs[0];

    const settingsRow = settingsRes.data || {};
    const { id: _id, updated_at: _updatedAt, ...settings } = settingsRow;
    const remote = {
      clients: clientsRes.data || [],
      client_contacts: clientContactsMissing ? [] : clientContactsRes.data || [],
      people: peopleRes.data || [],
      projects: projectsRes.data || [],
      project_assignments: assignRes.data || [],
      activities: activitiesRes.data || [],
      project_tasks: tasksRes.data || [],
      users: (usersRes.data || []).map(normalizeUserRow),
      sessions: sessionsRes.data || [],
      settings,
      audit_log: auditRes.data || [],
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

async function loadInitialData() {
  const remote = await loadFromSupabase();
  const base = remote || emptyData();
  return migrateLegacyClientContacts(base);
}

let data = await loadInitialData();

export const store = {
  get people() { return [...data.people]; },
  get projects() { return [...data.projects]; },
  get project_assignments() { return [...data.project_assignments]; },
  get activities() { return [...data.activities]; },
  get project_tasks() { return [...data.project_tasks]; },
  get clients() { return [...data.clients]; },
  get client_contacts() { return [...(data.client_contacts || [])]; },
  get users() { return [...data.users]; },
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

  findOrCreateClient(name) {
    const trimmed = (name || '').trim();
    if (!trimmed) return null;
    const existing = this.findClientByName(trimmed);
    if (existing) return existing.id;
    return this.addClient({ name: trimmed });
  },

  addClient(row) {
    const id = nextId(data.clients);
    const created_at = new Date().toISOString();
    const { contact_name: _cn, email: _e, phone: _p, ...company } = row;
    data.clients.push({ id, name: (company.name || '').trim(), created_at });
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
    data.projects.forEach(p => { if (p.client_id === id) p.client_id = null; });
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
    const { client_id, tags, classification, ...rest } = row;
    const tagList = Array.isArray(tags) ? tags.filter(t => t != null && String(t).trim()) : [];
    const normalizedClassification = classification != null && String(classification).trim()
      ? String(classification).trim()
      : null;
    data.projects.push({
      id,
      status: 'active',
      client_id: client_id || null,
      classification: normalizedClassification,
      tags: tagList,
      ...rest,
      created_at,
    });
    save(data);
    return id;
  },
  updateProject(id, row) {
    const i = data.projects.findIndex(p => p.id === id);
    if (i === -1) return false;
    if (row.tags !== undefined) {
      row.tags = Array.isArray(row.tags) ? row.tags.filter(t => t != null && String(t).trim()) : [];
    }
    if (row.classification !== undefined) {
      row.classification =
        row.classification != null && String(row.classification).trim()
          ? String(row.classification).trim()
          : null;
    }
    data.projects[i] = { ...data.projects[i], ...row, client_id: row.client_id ?? data.projects[i].client_id };
    if (data.projects[i].client_id === undefined || data.projects[i].client_id === '') data.projects[i].client_id = null;
    if (!Array.isArray(data.projects[i].tags)) data.projects[i].tags = [];
    save(data);
    return true;
  },
  deleteProject(id) {
    const i = data.projects.findIndex(p => p.id === id);
    if (i === -1) return false;
    data.projects.splice(i, 1);
    data.project_assignments = data.project_assignments.filter(a => a.project_id !== id);
    data.project_tasks = data.project_tasks.filter(t => t.project_id !== id);
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
