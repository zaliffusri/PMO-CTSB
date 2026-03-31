import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { normalizeTaskStatus } from '../lib/taskStatus.js';
import { defaultSettings } from '../lib/defaultSettings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filePath = path.join(__dirname, 'data.json');
let warnedReadOnlyFs = false;
let warnedSupabase = false;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasSupabase = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
const supabase = hasSupabase
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

const AUDIT_LOG_MAX = 5000;

function load() {
  if (!existsSync(filePath)) {
    return {
      people: [],
      projects: [],
      project_assignments: [],
      activities: [],
      project_tasks: [],
      clients: [],
      users: [],
      sessions: [],
      settings: defaultSettings(),
      audit_log: [],
    };
  }
  const raw = JSON.parse(readFileSync(filePath, 'utf8'));
  if (!raw.project_tasks) raw.project_tasks = [];
  let tasksMigrated = false;
  raw.project_tasks = raw.project_tasks.map((t) => {
    let next = t;
    if (t.assignee_id === undefined) {
      tasksMigrated = true;
      next = { ...next, assignee_id: null };
    }
    if (t.parent_id === undefined) {
      tasksMigrated = true;
      next = { ...next, parent_id: null };
    }
    if (t.task_kind !== 'group' && t.task_kind !== 'task') {
      tasksMigrated = true;
      next = { ...next, task_kind: 'task' };
    }
    if (!next.status || !['new', 'ongoing', 'done'].includes(next.status)) {
      tasksMigrated = true;
      next = { ...next, status: normalizeTaskStatus(next) };
    }
    return next;
  });
  if (!raw.clients) raw.clients = [];
  if (!raw.users) raw.users = [];
  if (!raw.sessions) raw.sessions = [];
  if (!raw.settings) {
    raw.settings = defaultSettings();
    save(raw);
  }
  if (!raw.audit_log) {
    raw.audit_log = [];
    save(raw);
  }
  raw.projects = (raw.projects || []).map(p => ({ ...p, tags: Array.isArray(p.tags) ? p.tags : [] }));
  if (tasksMigrated) save(raw);

  // Activities use person_id as user id; migrate legacy rows that still reference people ids.
  if (raw.activities?.length && raw.users?.length && raw.people?.length) {
    let actMigrated = false;
    const userIds = new Set(raw.users.map((u) => u.id));
    const emailToUser = new Map(raw.users.map((u) => [String(u.email || '').toLowerCase(), u]));
    const nameToUser = new Map();
    raw.users.forEach((u) => {
      const k = String(u.name || '').trim().toLowerCase();
      if (k && !nameToUser.has(k)) nameToUser.set(k, u);
    });
    const personToUserId = new Map();
    raw.people.forEach((p) => {
      const byEmail = emailToUser.get(String(p.email || '').toLowerCase());
      const byName = nameToUser.get(String(p.name || '').trim().toLowerCase());
      const u = byEmail || byName;
      if (u) personToUserId.set(p.id, u.id);
    });
    raw.activities = raw.activities.map((a) => {
      if (userIds.has(a.person_id)) return a;
      const mapped = personToUserId.get(a.person_id);
      if (mapped) {
        actMigrated = true;
        return { ...a, person_id: mapped };
      }
      return a;
    });
    if (actMigrated) save(raw);
  }

  if (raw.activities?.length) {
    let locFix = false;
    raw.activities = raw.activities.map((a) => {
      if (a.location != null && String(a.location).trim()) return a;
      locFix = true;
      return { ...a, location: '—' };
    });
    if (locFix) save(raw);
  }
  return raw;
}

function save(data) {
  try {
    writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    // Vercel serverless filesystem is read-only. Keep running with in-memory state.
    if (!warnedReadOnlyFs) {
      warnedReadOnlyFs = true;
      console.warn(`store.save: persistence disabled (${e.message})`);
    }
  }
  queueSupabaseSync(data);
}

let syncInFlight = false;
let syncQueued = false;

async function upsertAll(table, rows, onConflict = 'id') {
  if (!rows || rows.length === 0) {
    return;
  }
  const { error } = await supabase.from(table).upsert(rows, { onConflict });
  if (error) throw error;
}

async function pushSnapshotToSupabase(snapshot) {
  await upsertAll('clients', snapshot.clients || []);
  await upsertAll('people', snapshot.people || []);
  await upsertAll(
    'projects',
    (snapshot.projects || []).map((p) => ({ ...p, tags: Array.isArray(p.tags) ? p.tags : [] })),
  );
  await upsertAll('project_assignments', snapshot.project_assignments || []);
  await upsertAll('activities', snapshot.activities || []);
  await upsertAll('project_tasks', snapshot.project_tasks || []);
  await upsertAll('users_app', snapshot.users || []);
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
    const errs = [
      clientsRes.error,
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
      people: peopleRes.data || [],
      projects: projectsRes.data || [],
      project_assignments: assignRes.data || [],
      activities: activitiesRes.data || [],
      project_tasks: tasksRes.data || [],
      users: usersRes.data || [],
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

async function loadInitialData() {
  const local = load();
  const remote = await loadFromSupabase();
  if (remote) return remote;
  if (supabase) queueSupabaseSync(local);
  return local;
}

let data = await loadInitialData();

function nextId(arr) {
  const ids = arr.map(x => x.id).filter(Boolean);
  return ids.length ? Math.max(...ids) + 1 : 1;
}

export const store = {
  get people() { return [...data.people]; },
  get projects() { return [...data.projects]; },
  get project_assignments() { return [...data.project_assignments]; },
  get activities() { return [...data.activities]; },
  get project_tasks() { return [...data.project_tasks]; },
  get clients() { return [...data.clients]; },
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

  listAuditLog({ limit = 100, offset = 0 } = {}) {
    const rows = [...(data.audit_log || [])].sort((a, b) => new Date(b.at) - new Date(a.at));
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

  addClient(row) {
    const id = nextId(data.clients);
    const created_at = new Date().toISOString();
    data.clients.push({ id, ...row, created_at });
    save(data);
    return id;
  },
  updateClient(id, row) {
    const i = data.clients.findIndex(c => c.id === id);
    if (i === -1) return false;
    data.clients[i] = { ...data.clients[i], ...row };
    save(data);
    return true;
  },
  deleteClient(id) {
    const i = data.clients.findIndex(c => c.id === id);
    if (i === -1) return false;
    data.clients.splice(i, 1);
    data.projects.forEach(p => { if (p.client_id === id) p.client_id = null; });
    save(data);
    return true;
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
    const { client_id, tags, ...rest } = row;
    const tagList = Array.isArray(tags) ? tags.filter(t => t != null && String(t).trim()) : [];
    data.projects.push({ id, status: 'active', client_id: client_id || null, tags: tagList, ...rest, created_at });
    save(data);
    return id;
  },
  updateProject(id, row) {
    const i = data.projects.findIndex(p => p.id === id);
    if (i === -1) return false;
    if (row.tags !== undefined) {
      row.tags = Array.isArray(row.tags) ? row.tags.filter(t => t != null && String(t).trim()) : [];
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
  deleteActivity(id) {
    const i = data.activities.findIndex(a => a.id === id);
    if (i === -1) return false;
    data.activities.splice(i, 1);
    save(data);
    return true;
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
    const user = { id, role: 'admin', ...row, created_at };
    data.users.push(user);
    save(data);
    return id;
  },
  findUserByEmail(email) {
    return data.users.find((u) => u.email.toLowerCase() === String(email).toLowerCase()) || null;
  },
  findUserById(id) {
    return data.users.find((u) => u.id === id) || null;
  },
  updateUser(id, row) {
    const i = data.users.findIndex((u) => u.id === id);
    if (i === -1) return false;
    data.users[i] = { ...data.users[i], ...row };
    save(data);
    return true;
  },
  createSession(user_id, token, expires_at) {
    const id = nextId(data.sessions);
    const created_at = new Date().toISOString();
    const session = { id, user_id, token, expires_at, created_at };
    data.sessions.push(session);
    save(data);
    return session;
  },
  findSessionByToken(token) {
    return data.sessions.find((s) => s.token === token) || null;
  },
  deleteSessionByToken(token) {
    const i = data.sessions.findIndex((s) => s.token === token);
    if (i === -1) return false;
    data.sessions.splice(i, 1);
    save(data);
    return true;
  },
  clearExpiredSessions() {
    const now = new Date().toISOString();
    const before = data.sessions.length;
    data.sessions = data.sessions.filter((s) => !s.expires_at || s.expires_at > now);
    if (data.sessions.length !== before) save(data);
  },
};
