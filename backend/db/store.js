import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filePath = path.join(__dirname, 'data.json');

function load() {
  if (!existsSync(filePath)) return { people: [], projects: [], project_assignments: [], activities: [], project_tasks: [], clients: [] };
  const raw = JSON.parse(readFileSync(filePath, 'utf8'));
  if (!raw.project_tasks) raw.project_tasks = [];
  if (!raw.clients) raw.clients = [];
  raw.projects = (raw.projects || []).map(p => ({ ...p, tags: Array.isArray(p.tags) ? p.tags : [] }));
  return raw;
}

function save(data) {
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

let data = load();

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
    data.project_tasks.push({
      id,
      progress_percent: 0,
      sort_order: data.project_tasks.filter(t => t.project_id === row.project_id).length,
      ...row,
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
    const i = data.project_tasks.findIndex(t => t.id === id);
    if (i === -1) return false;
    data.project_tasks.splice(i, 1);
    save(data);
    return true;
  },
};
