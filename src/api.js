/**
 * All server calls go through `request()`. Browser DevTools → Console shows:
 * - `[PMO API] ok …` — successful response (GET includes item count when the body is an array)
 * - `[PMO API] failed …` — HTTP error response
 * - `[PMO API] network error …` — fetch did not complete (offline, DNS, CORS, etc.)
 */
// VITE_API_BASE overrides everything (e.g. different API port).
// In `vite` dev, call the API server directly — the /api proxy on :5173 often 404s on some setups
// (browser hits Vite, which has no /api route). Backend CORS allows localhost origins.
function resolveApiBase() {
  const fromEnv = import.meta.env.VITE_API_BASE;
  if (fromEnv != null && String(fromEnv).trim() !== '') {
    const raw = String(fromEnv).trim().replace(/\/$/, '');
    try {
      const u = new URL(raw);
      // If user sets only origin (no path), default to /api.
      if (u.pathname === '/' || u.pathname === '') return `${u.origin}/api`;
    } catch {
      // Relative values like /api are valid and handled as-is.
    }
    return raw;
  }
  const host =
    typeof window !== 'undefined' && window.location ? String(window.location.hostname || '').toLowerCase() : '';
  if (import.meta.env.DEV || host === 'localhost' || host === '127.0.0.1') {
    return 'http://127.0.0.1:3001/api';
  }
  return '/api';
}

const BASE = resolveApiBase();
let authToken = localStorage.getItem('auth_token') || '';
const AUTH_UNAUTHORIZED_EVENT = 'auth:unauthorized';

export function setAuthToken(token) {
  authToken = token || '';
  if (authToken) localStorage.setItem('auth_token', authToken);
  else localStorage.removeItem('auth_token');
}

export function getAuthToken() {
  return authToken;
}

async function request(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const token = authToken || (typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : '') || '';
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers,
      // Avoid stale GET responses (browser/CDN) when data changes outside the app.
      cache: method === 'GET' ? 'no-store' : 'default',
      ...options,
    });
  } catch (e) {
    console.error('[PMO API] network error', method, path, e?.message || e);
    throw e;
  }

  if (res.status === 204) {
    console.log('[PMO API] ok', method, path, 204);
    return null;
  }

  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    // Do not wipe session on failed login attempt — only when an authenticated call is rejected.
    if (token && !String(path).startsWith('/auth/login')) {
      setAuthToken('');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event(AUTH_UNAUTHORIZED_EVENT));
      }
    }
  }
  if (!res.ok) {
    const msg = data.error || res.statusText;
    console.error('[PMO API] failed', method, path, res.status, msg);
    throw new Error(msg);
  }
  if (method === 'GET' && Array.isArray(data)) {
    console.log('[PMO API] ok', method, path, res.status, `(${data.length} items)`);
  } else {
    console.log('[PMO API] ok', method, path, res.status);
  }
  return data;
}

export const api = {
  auth: {
    registerAdmin: (body) => request('/auth/register-admin', { method: 'POST', body: JSON.stringify(body) }),
    login: (body) => request('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
    me: () => request('/auth/me'),
    logout: () => request('/auth/logout', { method: 'POST' }),
    changePassword: (body) => request('/auth/change-password', { method: 'POST', body: JSON.stringify(body) }),
    uploadAvatar: (avatar_url) => request('/auth/avatar', { method: 'POST', body: JSON.stringify({ avatar_url }) }),
    deleteAvatar: () => request('/auth/avatar', { method: 'DELETE' }),
  },
  users: {
    list: () => request('/users'),
    create: (body) => request('/users', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => request(`/users/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  },
  clients: {
    list: () => request('/clients'),
    get: (id) => request(`/clients/${id}`),
    create: (body) => request('/clients', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => request(`/clients/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    updateContact: (contactId, body) =>
      request(`/clients/contacts/${contactId}`, { method: 'PUT', body: JSON.stringify(body) }),
    deleteContact: (contactId) => request(`/clients/contacts/${contactId}`, { method: 'DELETE' }),
    delete: (id) => request(`/clients/${id}`, { method: 'DELETE' }),
  },
  projects: {
    list: () => request('/projects'),
    get: (id) => request(`/projects/${id}`),
    create: (body) => request('/projects', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => request(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id) => request(`/projects/${id}`, { method: 'DELETE' }),
  },
  people: {
    list: (params) => {
      const q = new URLSearchParams(params || {}).toString();
      return request(`/people${q ? `?${q}` : ''}`);
    },
    syncFromUsers: () => request('/people/sync-from-users', { method: 'POST' }),
    get: (id) => request(`/people/${id}`),
    create: (body) => request('/people', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => request(`/people/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id) => request(`/people/${id}`, { method: 'DELETE' }),
  },
  assignments: {
    list: (params) => request('/assignments?' + new URLSearchParams(params).toString()),
    create: (body) => request('/assignments', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => request(`/assignments/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id) => request(`/assignments/${id}`, { method: 'DELETE' }),
  },
  activities: {
    list: (params) => request('/activities?' + new URLSearchParams(params).toString()),
    create: (body) => request('/activities', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => request(`/activities/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id, params = {}) => {
      const q = new URLSearchParams();
      if (params.notify_email !== undefined) q.set('notify_email', String(params.notify_email));
      const qs = q.toString();
      return request(`/activities/${id}${qs ? `?${qs}` : ''}`, { method: 'DELETE' });
    },
    /** Alias — calendar activities are cancelled (with optional email), not hard-deleted silently. */
    cancel: (id, params = {}) => {
      const q = new URLSearchParams();
      if (params.notify_email !== undefined) q.set('notify_email', String(params.notify_email));
      else q.set('notify_email', 'true');
      const qs = q.toString();
      return request(`/activities/${id}?${qs}`, { method: 'DELETE' });
    },
    mailStatus: () => request('/activities/mail-status'),
    scheduleEmailPreview: (params) =>
      request('/activities/schedule-email/preview?' + new URLSearchParams(params).toString()),
    sendScheduleEmail: (body) =>
      request('/activities/schedule-email/send', { method: 'POST', body: JSON.stringify(body) }),
    notify: (id) => request(`/activities/${id}/notify`, { method: 'POST' }),
  },
  availability: {
    workload: (from, to) => request(`/availability/workload?from=${from}&to=${to || from}`),
    check: (personId, from, to) =>
      request(`/availability/check?person_id=${personId}&from=${from}&to=${to || from}`),
  },
  settings: {
    get: () => request('/settings'),
    getPublic: () => request('/settings/public'),
    update: (body) => request('/settings', { method: 'PUT', body: JSON.stringify(body) }),
    testEmail: (body) => request('/settings/test-email', { method: 'POST', body: JSON.stringify(body || {}) }),
  },
  projectTasks: {
    list: (params) => request('/project-tasks?' + (params ? new URLSearchParams(params).toString() : '')),
    listGantt: (from, to) => request(`/project-tasks/gantt${from && to ? `?from=${from}&to=${to}` : ''}`),
    create: (body) => request('/project-tasks', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => request(`/project-tasks/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id) => request(`/project-tasks/${id}`, { method: 'DELETE' }),
  },
  issues: {
    list: (params) => request('/issues?' + new URLSearchParams(params || {}).toString()),
    get: (id) => request(`/issues/${id}`),
    create: (body) => request('/issues', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => request(`/issues/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    escalate: (id, body) => request(`/issues/${id}/escalate`, { method: 'POST', body: JSON.stringify(body || {}) }),
    resolve: (id, body) => request(`/issues/${id}/resolve`, { method: 'POST', body: JSON.stringify(body || {}) }),
    promoteToBacklog: (id, body) => request(`/issues/${id}/promote-backlog`, { method: 'POST', body: JSON.stringify(body || {}) }),
    importEticket: (csv) => request('/issues/import-eticket', { method: 'POST', body: JSON.stringify({ csv }) }),
  },
  backlogs: {
    list: (params) => request('/backlogs?' + new URLSearchParams(params || {}).toString()),
    get: (id) => request(`/backlogs/${id}`),
    create: (body) => request('/backlogs', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => request(`/backlogs/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    promoteToTask: (id, body) => request(`/backlogs/${id}/promote-task`, { method: 'POST', body: JSON.stringify(body || {}) }),
    listComments: (id) => request(`/backlogs/${id}/comments`),
    addComment: (id, body) => request(`/backlogs/${id}/comments`, { method: 'POST', body: JSON.stringify(body) }),
  },
  projectPhases: {
    list: (params) => request('/project-phases?' + new URLSearchParams(params || {}).toString()),
    financeSummary: () => request('/project-phases/finance-summary'),
    initTemplate: (projectId, workPackageId) => request('/project-phases/init-template', {
      method: 'POST',
      body: JSON.stringify({
        project_id: projectId,
        ...(workPackageId ? { work_package_id: workPackageId } : {}),
      }),
    }),
    create: (body) => request('/project-phases', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => request(`/project-phases/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  },
  workPackages: {
    list: (params) => request('/work-packages?' + new URLSearchParams(params || {}).toString()),
    get: (id) => request(`/work-packages/${id}`),
    create: (body) => request('/work-packages', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => request(`/work-packages/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id) => request(`/work-packages/${id}`, { method: 'DELETE' }),
    initPhases: (id) => request(`/work-packages/${id}/init-phases`, { method: 'POST', body: '{}' }),
  },
  notifications: {
    list: (params) => request('/notifications?' + new URLSearchParams(params || {}).toString()),
    unreadCount: () => request('/notifications/count'),
    markRead: (id) => request(`/notifications/${id}/read`, { method: 'POST' }),
    markAllRead: () => request('/notifications/read-all', { method: 'POST' }),
  },
  auditLog: {
    list: (params) => request('/audit-log?' + new URLSearchParams(params || {}).toString()),
  },
  attachments: {
    list: (entityType, entityId) => request(`/attachments?entity_type=${encodeURIComponent(entityType)}&entity_id=${entityId}`),
    create: (body) => request('/attachments', { method: 'POST', body: JSON.stringify(body) }),
    remove: (id) => request(`/attachments/${id}`, { method: 'DELETE' }),
    async openFile(id) {
      const headers = {};
      const token = getAuthToken();
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`${BASE}/attachments/${id}/file`, { headers });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Download failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    },
  },
};

export { AUTH_UNAUTHORIZED_EVENT };
