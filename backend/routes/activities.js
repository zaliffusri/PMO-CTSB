import { Router } from 'express';
import { store } from '../db/store.js';

export const activitiesRouter = Router();

activitiesRouter.get('/', (req, res) => {
  const personId = req.query.person_id ? +req.query.person_id : null;
  const projectId = req.query.project_id ? +req.query.project_id : null;
  const from = req.query.from;
  const to = req.query.to;
  let rows = store.activities.map(a => {
    const person = store.people.find(p => p.id === a.person_id);
    const project = store.projects.find(p => p.id === a.project_id);
    return { ...a, person_name: person?.name, project_name: project?.name };
  });
  if (personId) rows = rows.filter(r => r.person_id === personId);
  if (projectId) rows = rows.filter(r => r.project_id === projectId);
  if (from) rows = rows.filter(r => r.end_at >= from);
  if (to) rows = rows.filter(r => r.start_at <= to);
  rows.sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
  res.json(rows);
});

activitiesRouter.post('/', (req, res) => {
  const { person_id, project_id, type, title, description, start_at, end_at } = req.body;
  if (!person_id || !type || !title || !start_at || !end_at) {
    return res.status(400).json({ error: 'person_id, type, title, start_at, end_at are required' });
  }
  const id = store.addActivity({
    person_id: +person_id,
    project_id: project_id || null,
    type,
    title,
    description: description || null,
    start_at,
    end_at,
  });
  const a = store.activities.find(x => x.id === id);
  const person = store.people.find(p => p.id === a.person_id);
  const project = store.projects.find(p => p.id === a.project_id);
  res.status(201).json({ ...a, person_name: person?.name, project_name: project?.name });
});

activitiesRouter.put('/:id', (req, res) => {
  const { person_id, project_id, type, title, description, start_at, end_at } = req.body;
  const id = +req.params.id;
  const existing = store.activities.find(a => a.id === id);
  if (!existing) return res.status(404).json({ error: 'Activity not found' });
  store.updateActivity(id, {
    person_id: person_id ?? existing.person_id,
    project_id: project_id !== undefined ? project_id : existing.project_id,
    type: type ?? existing.type,
    title: title ?? existing.title,
    description: description ?? existing.description,
    start_at: start_at ?? existing.start_at,
    end_at: end_at ?? existing.end_at,
  });
  const a = store.activities.find(x => x.id === id);
  const person = store.people.find(p => p.id === a.person_id);
  const project = store.projects.find(p => p.id === a.project_id);
  res.json({ ...a, person_name: person?.name, project_name: project?.name });
});

activitiesRouter.delete('/:id', (req, res) => {
  const id = +req.params.id;
  const existing = store.activities.find(a => a.id === id);
  if (!existing) return res.status(404).json({ error: 'Activity not found' });
  store.deleteActivity(id);
  res.status(204).send();
});
