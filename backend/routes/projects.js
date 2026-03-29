import { Router } from 'express';
import { store } from '../db/store.js';

export const projectsRouter = Router();

projectsRouter.get('/', (req, res) => {
  let list = store.projects.map(p => {
    const member_count = store.project_assignments.filter(a => a.project_id === p.id).length;
    const client = p.client_id ? store.clients.find(c => c.id === p.client_id) : null;
    const tags = Array.isArray(p.tags) ? p.tags : [];
    return { ...p, tags, member_count, client_name: client?.name || null };
  });
  const tagFilter = req.query.tag ? String(req.query.tag).trim().toLowerCase() : null;
  if (tagFilter) list = list.filter(p => (p.tags || []).some(t => String(t).toLowerCase() === tagFilter));
  list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json(list);
});

projectsRouter.get('/tags/list', (req, res) => {
  const set = new Set();
  store.projects.forEach(p => (p.tags || []).forEach(t => set.add(String(t).trim())));
  res.json([...set].filter(Boolean).sort());
});

projectsRouter.get('/:id', (req, res) => {
  const id = +req.params.id;
  const project = store.projects.find(p => p.id === id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const tags = Array.isArray(project.tags) ? project.tags : [];
  const client = project.client_id ? store.clients.find(c => c.id === project.client_id) : null;
  const members = store.project_assignments
    .filter(a => a.project_id === id)
    .map(a => {
      const person = store.people.find(pe => pe.id === a.person_id);
      return { ...a, name: person?.name, email: person?.email, role: person?.role };
    });
  res.json({ ...project, tags, client_name: client?.name || null, members });
});

projectsRouter.post('/', (req, res) => {
  const { name, description, status, start_date, end_date, client_id } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const tags = Array.isArray(req.body.tags) ? req.body.tags : [];
  const id = store.addProject({ name, description: description || null, status: status || 'active', start_date: start_date || null, end_date: end_date || null, client_id: client_id || null, tags });
  const project = store.projects.find(p => p.id === id);
  const client = project.client_id ? store.clients.find(c => c.id === project.client_id) : null;
  res.status(201).json({ ...project, client_name: client?.name || null });
});

projectsRouter.put('/:id', (req, res) => {
  const { name, description, status, start_date, end_date, client_id } = req.body;
  const id = +req.params.id;
  const existing = store.projects.find(p => p.id === id);
  if (!existing) return res.status(404).json({ error: 'Project not found' });
  const tags = req.body.tags !== undefined ? (Array.isArray(req.body.tags) ? req.body.tags : []) : undefined;
  store.updateProject(id, { name: name ?? existing.name, description, status, start_date, end_date, client_id: client_id !== undefined ? client_id || null : existing.client_id, tags });
  const project = store.projects.find(p => p.id === id);
  const client = project.client_id ? store.clients.find(c => c.id === project.client_id) : null;
  res.json({ ...project, client_name: client?.name || null });
});

projectsRouter.delete('/:id', (req, res) => {
  const id = +req.params.id;
  const existing = store.projects.find(p => p.id === id);
  if (!existing) return res.status(404).json({ error: 'Project not found' });
  store.deleteProject(id);
  res.status(204).send();
});
