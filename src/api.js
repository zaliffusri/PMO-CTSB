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

async function request(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers,
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
    // Session/token is invalid or expired.
    setAuthToken('');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(AUTH_UNAUTHORIZED_EVENT));
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
    delete: (id) => request(`/clients/${id}`, { method: 'DELETE' }),
  },
  projects: {
    list: (params) => request('/projects' + (params?.tag ? '?tag=' + encodeURIComponent(params.tag) : '')),
    tagsList: () => request('/projects/tags/list'),
    get: (id) => request(`/projects/${id}`),
    create: (body) => request('/projects', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => request(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id) => request(`/projects/${id}`, { method: 'DELETE' }),
  },
  people: {
    list: () => request('/people'),
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
    delete: (id) => request(`/activities/${id}`, { method: 'DELETE' }),
  },
  availability: {
    workload: (from, to) => request(`/availability/workload?from=${from}&to=${to || from}`),
  },
  settings: {
    get: () => request('/settings'),
    update: (body) => request('/settings', { method: 'PUT', body: JSON.stringify(body) }),
  },
  projectTasks: {
    list: (params) => request('/project-tasks?' + (params ? new URLSearchParams(params).toString() : '')),
    listGantt: (from, to) => request(`/project-tasks/gantt${from && to ? `?from=${from}&to=${to}` : ''}`),
    create: (body) => request('/project-tasks', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => request(`/project-tasks/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id) => request(`/project-tasks/${id}`, { method: 'DELETE' }),
  },
  auditLog: {
    list: (params) => request('/audit-log?' + new URLSearchParams(params || {}).toString()),
  },
};

export { AUTH_UNAUTHORIZED_EVENT };
