import { Router } from 'express';
import { store } from '../db/store.js';

export const peopleRouter = Router();

peopleRouter.get('/', (req, res) => {
  const rows = store.people.map(pe => {
    const project_count = store.project_assignments.filter(a => a.person_id === pe.id).length;
    return { ...pe, project_count };
  }).sort((a, b) => a.name.localeCompare(b.name));
  res.json(rows);
});

peopleRouter.get('/:id', (req, res) => {
  const id = +req.params.id;
  const person = store.people.find(p => p.id === id);
  if (!person) return res.status(404).json({ error: 'Person not found' });
  const projects = store.project_assignments
    .filter(a => a.person_id === id)
    .map(a => {
      const proj = store.projects.find(p => p.id === a.project_id);
      return { ...a, project_name: proj?.name, project_status: proj?.status };
    });
  const activities = store.activities
    .filter(a => a.person_id === id)
    .sort((a, b) => new Date(b.start_at) - new Date(a.start_at))
    .slice(0, 50)
    .map(a => {
      const proj = store.projects.find(p => p.id === a.project_id);
      return { ...a, project_name: proj?.name };
    });
  res.json({ ...person, projects, activities });
});

peopleRouter.post('/', (req, res) => {
  const { name, email, role } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const id = store.addPerson({ name, email: email || null, role: role || null });
  store.appendAuditLog(req.user, {
    action: 'create',
    target_type: 'person',
    target_id: id,
    summary: `Added team member "${name}"`,
  });
  const person = store.people.find(p => p.id === id);
  res.status(201).json(person);
});

peopleRouter.put('/:id', (req, res) => {
  const { name, email, role } = req.body;
  const id = +req.params.id;
  const existing = store.people.find(p => p.id === id);
  if (!existing) return res.status(404).json({ error: 'Person not found' });
  store.updatePerson(id, { name: name ?? existing.name, email: email ?? existing.email, role: role ?? existing.role });
  store.appendAuditLog(req.user, {
    action: 'update',
    target_type: 'person',
    target_id: id,
    summary: `Updated team member "${store.people.find((p) => p.id === id)?.name || id}"`,
  });
  const person = store.people.find(p => p.id === id);
  res.json(person);
});

peopleRouter.delete('/:id', async (req, res) => {
  const id = +req.params.id;
  const existing = store.people.find(p => p.id === id);
  if (!existing) return res.status(404).json({ error: 'Person not found' });
  const assignCount = store.project_assignments.filter((a) => a.person_id === id).length;
  const actCount = store.activities.filter((a) => a.person_id === id).length;
  store.project_assignments.filter(a => a.person_id === id).forEach(a => store.deleteAssignment(a.id));
  const activityIds = store.activities.filter(a => a.person_id === id).map(a => a.id);
  for (const aid of activityIds) {
    await store.deleteActivity(aid);
  }
  store.deletePerson(id);
  store.appendAuditLog(req.user, {
    action: 'delete',
    target_type: 'person',
    target_id: id,
    summary: `Deleted team member "${existing.name}"`,
    detail: { assignments_removed: assignCount, activities_removed: actCount },
  });
  res.status(204).send();
});
