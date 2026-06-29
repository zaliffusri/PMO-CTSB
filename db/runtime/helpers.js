import { defaultSettings } from '../../lib/defaultSettings.js';
import { normalizeBacklogStatus } from '../../lib/backlogConstants.js';

export const AUDIT_LOG_MAX = 5000;

/** Values some deployments use for `users_app.status` (NOT NULL in DB). */
export const USER_ROW_STATUSES = new Set(['active', 'inactive', 'pending', 'suspended']);

export function emptyData() {
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

export function nextId(arr) {
  const ids = arr.map((x) => x.id).filter(Boolean);
  return ids.length ? Math.max(...ids) + 1 : 1;
}

/** DB: `active` boolean; some DBs also have `status` text NOT NULL — always set a valid default. */
export function normalizeUserRow(u) {
  if (!u || typeof u !== 'object') return u;
  const raw = u.status != null ? String(u.status).trim().toLowerCase() : '';
  const status = USER_ROW_STATUSES.has(raw) ? raw : 'active';
  return { ...u, active: u.active === false ? false : true, status };
}

export function migrateLegacyClientContacts(snapshot) {
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

export function migrateLegacyProjectClients(snapshot) {
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

export function companyRowForDb(c) {
  return {
    id: c.id,
    name: c.name,
    created_at: c.created_at,
  };
}

export function projectRowForDb(p) {
  const { client_id: _c, tags: _t, ...rest } = p;
  return { ...rest, tags: [] };
}

export function normalizeBacklogRows(rows) {
  return (rows || []).map((b) => ({
    ...b,
    status: normalizeBacklogStatus(b.status),
  }));
}
