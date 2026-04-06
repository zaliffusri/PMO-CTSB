import { Router } from 'express';
import { store } from '../db/store.js';
import { isMailerConfigured, sendAssignmentEmail } from '../lib/mailer.js';

export const assignmentsRouter = Router();

function notifyAssignmentEmail({ person, project, roleInProject, allocationPercent, actorName, action }) {
  if (!isMailerConfigured()) return;
  const recipient = String(person?.email || '').trim();
  if (!recipient) return;
  sendAssignmentEmail({
    to: recipient,
    personName: person?.name,
    projectName: project?.name || String(project?.id || ''),
    roleInProject,
    allocationPercent,
    assignedBy: actorName,
    action,
  }).catch((e) => {
    console.warn(`assignments: failed to send notification email (${e.message})`);
  });
}

assignmentsRouter.get('/', (req, res) => {
  const projectId = req.query.project_id ? +req.query.project_id : null;
  const personId = req.query.person_id ? +req.query.person_id : null;
  let rows = store.project_assignments.map(pa => {
    const person = store.people.find(p => p.id === pa.person_id);
    const project = store.projects.find(p => p.id === pa.project_id);
    return { ...pa, person_name: person?.name, project_name: project?.name };
  });
  if (projectId) rows = rows.filter(r => r.project_id === projectId);
  if (personId) rows = rows.filter(r => r.person_id === personId);
  rows.sort((a, b) => a.project_id - b.project_id || (store.people.find(p => p.id === a.person_id)?.name || '').localeCompare(store.people.find(p => p.id === b.person_id)?.name || ''));
  res.json(rows);
});

assignmentsRouter.post('/', (req, res) => {
  const { project_id, person_id, role_in_project, allocation_percent } = req.body;
  if (!project_id || !person_id) {
    return res.status(400).json({ error: 'project_id and person_id are required' });
  }
  try {
    const id = store.addAssignment({
      project_id: +project_id,
      person_id: +person_id,
      role_in_project: role_in_project || null,
      allocation_percent: allocation_percent ?? 100,
    });
    const pa = store.project_assignments.find(a => a.id === id);
    const person = store.people.find(p => p.id === pa.person_id);
    const project = store.projects.find(p => p.id === pa.project_id);
    store.appendAuditLog(req.user, {
      action: 'create',
      target_type: 'assignment',
      target_id: id,
      summary: `Assigned ${person?.name || 'member'} to project "${project?.name || pa.project_id}"`,
    });
    notifyAssignmentEmail({
      person,
      project,
      roleInProject: pa.role_in_project,
      allocationPercent: pa.allocation_percent,
      actorName: req.user?.name || req.user?.email || '',
      action: 'assigned',
    });
    res.status(201).json({ ...pa, person_name: person?.name, project_name: project?.name });
  } catch (e) {
    if (e.code === 'DUPLICATE') {
      return res.status(409).json({ error: 'Person is already assigned to this project' });
    }
    throw e;
  }
});

assignmentsRouter.delete('/:id', (req, res) => {
  const id = +req.params.id;
  const existing = store.project_assignments.find(a => a.id === id);
  if (!existing) return res.status(404).json({ error: 'Assignment not found' });
  store.deleteAssignment(id);
  res.status(204).send();
});

assignmentsRouter.put('/:id', (req, res) => {
  const { role_in_project, allocation_percent } = req.body;
  const id = +req.params.id;
  const existing = store.project_assignments.find(a => a.id === id);
  if (!existing) return res.status(404).json({ error: 'Assignment not found' });
  store.updateAssignment(id, {
    role_in_project: role_in_project ?? existing.role_in_project,
    allocation_percent: allocation_percent ?? existing.allocation_percent,
  });
  const pa = store.project_assignments.find(a => a.id === id);
  const person = store.people.find(p => p.id === pa.person_id);
  const project = store.projects.find(p => p.id === pa.project_id);
  store.appendAuditLog(req.user, {
    action: 'update',
    target_type: 'assignment',
    target_id: id,
    summary: `Updated assignment: ${person?.name || 'member'} ↔ "${project?.name || pa.project_id}"`,
  });
  notifyAssignmentEmail({
    person,
    project,
    roleInProject: pa.role_in_project,
    allocationPercent: pa.allocation_percent,
    actorName: req.user?.name || req.user?.email || '',
    action: 'updated',
  });
  res.json({ ...pa, person_name: person?.name, project_name: project?.name });
});
