import { Router } from 'express';
import { store } from '../db/store.js';

export const activitiesRouter = Router();

const ALLOWED_TYPES = new Set(['meeting', 'outstation', 'other']);

function normalizeActivityType(type) {
  if (type === 'task') return 'outstation';
  if (ALLOWED_TYPES.has(String(type))) return String(type);
  return 'other';
}

activitiesRouter.get('/', (req, res) => {
  const personId = req.query.person_id ? +req.query.person_id : null;
  const projectId = req.query.project_id ? +req.query.project_id : null;
  const from = req.query.from;
  const to = req.query.to;
  let rows = store.activities.map(a => {
    const user = store.findUserById(a.person_id);
    const project = store.projects.find(p => p.id === a.project_id);
    return { ...a, type: normalizeActivityType(a.type), person_name: user?.name, project_name: project?.name };
  });
  if (personId) rows = rows.filter(r => r.person_id === personId);
  if (projectId) rows = rows.filter(r => r.project_id === projectId);
  if (from) rows = rows.filter(r => r.end_at >= from);
  if (to) rows = rows.filter(r => r.start_at <= to);
  rows.sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
  res.json(rows);
});

activitiesRouter.post('/', (req, res) => {
  const { person_id, project_id, type, title, description, location, start_at, end_at } = req.body;
  if (!person_id || !type || !title || !start_at || !end_at) {
    return res.status(400).json({ error: 'person_id, type, title, start_at, end_at are required' });
  }
  const loc = location != null ? String(location).trim() : '';
  if (!loc) {
    return res.status(400).json({ error: 'location is required' });
  }
  const uid = +person_id;
  if (!store.findUserById(uid)) {
    return res.status(400).json({ error: 'person_id must be a valid user id' });
  }
  const id = store.addActivity({
    person_id: uid,
    project_id: project_id || null,
    type: normalizeActivityType(type),
    title,
    description: description || null,
    location: loc,
    start_at,
    end_at,
  });
  const a = store.activities.find(x => x.id === id);
  const user = store.findUserById(a.person_id);
  const project = store.projects.find(p => p.id === a.project_id);
  store.appendAuditLog(req.user, {
    action: 'create',
    target_type: 'activity',
    target_id: id,
    summary: `Logged activity "${title}"`,
    detail: { person_name: user?.name, project_name: project?.name },
  });
  res.status(201).json({ ...a, type: normalizeActivityType(a.type), person_name: user?.name, project_name: project?.name });
});

activitiesRouter.put('/:id', (req, res) => {
  const { person_id, project_id, type, title, description, location, start_at, end_at } = req.body;
  const id = +req.params.id;
  const existing = store.activities.find(a => a.id === id);
  if (!existing) return res.status(404).json({ error: 'Activity not found' });
  const nextPersonId = person_id !== undefined ? +person_id : existing.person_id;
  if (person_id !== undefined && !store.findUserById(nextPersonId)) {
    return res.status(400).json({ error: 'person_id must be a valid user id' });
  }
  const nextLocation = location !== undefined ? String(location || '').trim() : (existing.location != null ? String(existing.location).trim() : '');
  if (!nextLocation) {
    return res.status(400).json({ error: 'location is required' });
  }
  store.updateActivity(id, {
    person_id: nextPersonId,
    project_id: project_id !== undefined ? project_id : existing.project_id,
    type: type !== undefined ? normalizeActivityType(type) : normalizeActivityType(existing.type),
    title: title ?? existing.title,
    description: description ?? existing.description,
    location: nextLocation,
    start_at: start_at ?? existing.start_at,
    end_at: end_at ?? existing.end_at,
  });
  const a = store.activities.find(x => x.id === id);
  const user = store.findUserById(a.person_id);
  const project = store.projects.find(p => p.id === a.project_id);
  res.json({ ...a, type: normalizeActivityType(a.type), person_name: user?.name, project_name: project?.name });
});

activitiesRouter.delete('/:id', (req, res) => {
  const id = +req.params.id;
  const existing = store.activities.find(a => a.id === id);
  if (!existing) return res.status(404).json({ error: 'Activity not found' });
  store.deleteActivity(id);
  store.appendAuditLog(req.user, {
    action: 'delete',
    target_type: 'activity',
    target_id: id,
    summary: `Deleted activity "${existing.title}"`,
  });
  res.status(204).send();
});
