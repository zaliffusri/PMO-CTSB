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
  const person = store.people.find(p => p.id === id);
  res.status(201).json(person);
});

peopleRouter.put('/:id', (req, res) => {
  const { name, email, role } = req.body;
  const id = +req.params.id;
  const existing = store.people.find(p => p.id === id);
  if (!existing) return res.status(404).json({ error: 'Person not found' });
  store.updatePerson(id, { name: name ?? existing.name, email: email ?? existing.email, role: role ?? existing.role });
  const person = store.people.find(p => p.id === id);
  res.json(person);
});

peopleRouter.delete('/:id', (req, res) => {
  const id = +req.params.id;
  const existing = store.people.find(p => p.id === id);
  if (!existing) return res.status(404).json({ error: 'Person not found' });
  store.project_assignments.filter(a => a.person_id === id).forEach(a => store.deleteAssignment(a.id));
  store.activities.filter(a => a.person_id === id).forEach(a => store.deleteActivity(a.id));
  store.deletePerson(id);
  res.status(204).send();
});
