import { Router } from 'express';
import { store } from '../db/store.js';
import { parseClientIds } from '../lib/projectClients.js';

export const projectsRouter = Router();
const PROJECT_CLASSIFICATIONS = new Set([
  'Pre-Sales Project',
  'Project Based',
  'Support & Services',
  'Additional Scope',
]);

function enrichProject(project, extra = {}) {
  return { ...store.projectWithClients(project), ...extra };
}

projectsRouter.get('/', (req, res) => {
  let list = store.projects.map((p) => {
    const member_count = store.project_assignments.filter((a) => a.project_id === p.id).length;
    const tags = Array.isArray(p.tags) ? p.tags : [];
    return enrichProject(p, { tags, member_count });
  });
  const tagFilter = req.query.tag ? String(req.query.tag).trim().toLowerCase() : null;
  if (tagFilter) list = list.filter((p) => (p.tags || []).some((t) => String(t).toLowerCase() === tagFilter));
  list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json(list);
});

projectsRouter.get('/tags/list', (req, res) => {
  const set = new Set();
  store.projects.forEach((p) => (p.tags || []).forEach((t) => set.add(String(t).trim())));
  res.json([...set].filter(Boolean).sort());
});

projectsRouter.get('/:id', (req, res) => {
  const id = +req.params.id;
  const project = store.projects.find((p) => p.id === id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const tags = Array.isArray(project.tags) ? project.tags : [];
  const members = store.project_assignments
    .filter((a) => a.project_id === id)
    .map((a) => {
      const person = store.people.find((pe) => pe.id === a.person_id);
      return { ...a, name: person?.name, email: person?.email, role: person?.role };
    });
  res.json(enrichProject(project, { tags, members }));
});

projectsRouter.post('/', (req, res) => {
  const { name, description, status, start_date, end_date, classification } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const tags = Array.isArray(req.body.tags) ? req.body.tags : [];
  const clientIds = parseClientIds(req.body);
  const normalizedClassification = classification != null && String(classification).trim()
    ? String(classification).trim()
    : null;
  if (normalizedClassification && !PROJECT_CLASSIFICATIONS.has(normalizedClassification)) {
    return res.status(400).json({ error: 'Invalid classification value' });
  }
  const id = store.addProject({
    name,
    description: description || null,
    status: status || 'active',
    start_date: start_date || null,
    end_date: end_date || null,
    classification: normalizedClassification,
    tags,
    client_ids: clientIds ?? [],
  });
  store.appendAuditLog(req.user, {
    action: 'create',
    target_type: 'project',
    target_id: id,
    summary: `Created project "${name}"`,
  });
  const project = store.projects.find((p) => p.id === id);
  res.status(201).json(enrichProject(project));
});

projectsRouter.put('/:id', (req, res) => {
  const { name, description, status, start_date, end_date, classification } = req.body;
  const id = +req.params.id;
  const existing = store.projects.find((p) => p.id === id);
  if (!existing) return res.status(404).json({ error: 'Project not found' });
  const tags = req.body.tags !== undefined ? (Array.isArray(req.body.tags) ? req.body.tags : []) : undefined;
  const clientIds = parseClientIds(req.body);
  const nextClassification = classification !== undefined
    ? (classification != null && String(classification).trim() ? String(classification).trim() : null)
    : existing.classification ?? null;
  if (nextClassification && !PROJECT_CLASSIFICATIONS.has(nextClassification)) {
    return res.status(400).json({ error: 'Invalid classification value' });
  }
  const patch = {
    name: name ?? existing.name,
    description,
    status,
    start_date,
    end_date,
    classification: nextClassification,
    tags,
  };
  if (clientIds !== null) patch.client_ids = clientIds;
  store.updateProject(id, patch);
  store.appendAuditLog(req.user, {
    action: 'update',
    target_type: 'project',
    target_id: id,
    summary: `Updated project "${store.projects.find((p) => p.id === id)?.name || id}"`,
  });
  const project = store.projects.find((p) => p.id === id);
  res.json(enrichProject(project));
});

projectsRouter.delete('/:id', (req, res) => {
  const id = +req.params.id;
  const existing = store.projects.find((p) => p.id === id);
  if (!existing) return res.status(404).json({ error: 'Project not found' });
  store.deleteProject(id);
  store.appendAuditLog(req.user, {
    action: 'delete',
    target_type: 'project',
    target_id: id,
    summary: `Deleted project "${existing.name}"`,
  });
  res.status(204).send();
});
