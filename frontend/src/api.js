const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export const api = {
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
    check: (personId, from, to) =>
      request(`/availability/check?person_id=${personId}${from ? `&from=${from}&to=${to || from}` : ''}`),
  },
  projectTasks: {
    list: (params) => request('/project-tasks?' + (params ? new URLSearchParams(params).toString() : '')),
    listGantt: (from, to) => request(`/project-tasks/gantt${from && to ? `?from=${from}&to=${to}` : ''}`),
    create: (body) => request('/project-tasks', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => request(`/project-tasks/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id) => request(`/project-tasks/${id}`, { method: 'DELETE' }),
  },
};
