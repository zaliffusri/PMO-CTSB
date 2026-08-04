import { Router } from 'express';
import { store } from '../db/store.js';
import { isMailerConfigured, sendAssignmentEmail } from '../lib/mailer.js';
import { notifyPersonInApp } from '../lib/notifyUser.js';

export const assignmentsRouter = Router();

function normalizePersonName(s) {
  return String(s || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** Team member row, or synthetic from app user when person_id matches a user id (legacy / sync). */
function resolvePersonForAssignment(personId) {
  const p = store.people.find((x) => x.id === personId);
  if (p) return p;
  const u = store.findUserById(personId);
  if (u) return { id: personId, name: u.name, email: u.email || null };
  return null;
}

/**
 * Resolve where to send assignment mail: team email, then user account by email, then by normalized name.
 */
function resolveAssigneeEmail(person) {
  if (!person) return '';
  const direct = String(person.email || '').trim();
  if (direct) return direct;

  const nm = normalizePersonName(person.name);
  if (nm) {
    const u = store.users.find((x) => normalizePersonName(x.name) === nm);
    if (u?.email) return String(u.email).trim();
  }
  return '';
}

/** @returns {'sent'|'no_recipient'|'smtp_not_configured'|'failed'} */
async function notifyAssignmentEmail({ person, project, roleInProject, allocationPercent, actorName, action }) {
  if (!isMailerConfigured()) {
    console.warn('assignments: SMTP not configured; assignment email skipped');
    return 'smtp_not_configured';
  }
  const recipient = resolveAssigneeEmail(person);
  if (!recipient) {
    const label = person?.name || person?.email || 'assignee';
    console.warn(
      `assignments: no recipient email for "${label}" — add email on Team or ensure a system user has the same name as the team member`,
    );
    return 'no_recipient';
  }
  try {
    await sendAssignmentEmail({
      to: recipient,
      personName: person?.name,
      projectName: project?.name || String(project?.id || ''),
      roleInProject,
      allocationPercent,
      assignedBy: actorName,
      action,
    });
    console.info(`assignments: assignment email sent to ${recipient}`);
    return 'sent';
  } catch (e) {
    console.warn(`assignments: failed to send notification email (${e.message})`);
    return 'failed';
  }
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

assignmentsRouter.post('/', async (req, res) => {
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
    const person = resolvePersonForAssignment(pa.person_id);
    const project = store.projects.find(p => p.id === pa.project_id);
    store.appendAuditLog(req.user, {
      action: 'create',
      target_type: 'assignment',
      target_id: id,
      summary: `Assigned ${person?.name || 'member'} to project "${project?.name || pa.project_id}"`,
    });
    try {
      await store.persistAssignmentsToSupabase();
    } catch (e) {
      console.error('assignments POST persistAssignmentsToSupabase failed', e);
      return res.status(500).json({ error: e.message || 'Failed to save assignment to database' });
    }
    store.persistToSupabase().catch((err) => console.warn('assignments POST full persist:', err.message));
    const email_notification = await notifyAssignmentEmail({
      person,
      project,
      roleInProject: pa.role_in_project,
      allocationPercent: pa.allocation_percent,
      actorName: req.user?.name || req.user?.email || '',
      action: 'assigned',
    });
    notifyPersonInApp(pa.person_id, {
      type: 'project_assigned',
      title: `Added to project: ${project?.name || 'Project'}`,
      body: [
        pa.role_in_project ? `Role: ${pa.role_in_project}` : null,
        req.user?.name ? `By ${req.user.name}` : null,
      ].filter(Boolean).join(' · ') || null,
      link: `/projects/${pa.project_id}?tab=people`,
      entity_type: 'project',
      entity_id: pa.project_id,
    });
    res.status(201).json({
      ...pa,
      person_name: person?.name,
      project_name: project?.name,
      email_notification,
    });
  } catch (e) {
    if (e.code === 'DUPLICATE') {
      return res.status(409).json({ error: 'Person is already assigned to this project' });
    }
    throw e;
  }
});

assignmentsRouter.delete('/:id', async (req, res) => {
  const id = +req.params.id;
  const existing = store.project_assignments.find(a => a.id === id);
  if (!existing) return res.status(404).json({ error: 'Assignment not found' });
  store.deleteAssignment(id);
  try {
    await store.persistAssignmentsToSupabase();
  } catch (e) {
    console.error('assignments DELETE persistAssignmentsToSupabase failed', e);
    return res.status(500).json({ error: e.message || 'Failed to save to database' });
  }
  store.persistToSupabase().catch((err) => console.warn('assignments DELETE full persist:', err.message));
  res.status(204).send();
});

assignmentsRouter.put('/:id', async (req, res) => {
  const { role_in_project, allocation_percent } = req.body;
  const id = +req.params.id;
  const existing = store.project_assignments.find(a => a.id === id);
  if (!existing) return res.status(404).json({ error: 'Assignment not found' });
  store.updateAssignment(id, {
    role_in_project: role_in_project ?? existing.role_in_project,
    allocation_percent: allocation_percent ?? existing.allocation_percent,
  });
  const pa = store.project_assignments.find(a => a.id === id);
  const person = resolvePersonForAssignment(pa.person_id);
  const project = store.projects.find(p => p.id === pa.project_id);
  store.appendAuditLog(req.user, {
    action: 'update',
    target_type: 'assignment',
    target_id: id,
    summary: `Updated assignment: ${person?.name || 'member'} ↔ "${project?.name || pa.project_id}"`,
  });
  try {
    await store.persistAssignmentsToSupabase();
  } catch (e) {
    console.error('assignments PUT persistAssignmentsToSupabase failed', e);
    return res.status(500).json({ error: e.message || 'Failed to save to database' });
  }
  store.persistToSupabase().catch((err) => console.warn('assignments PUT full persist:', err.message));
  const email_notification = await notifyAssignmentEmail({
    person,
    project,
    roleInProject: pa.role_in_project,
    allocationPercent: pa.allocation_percent,
    actorName: req.user?.name || req.user?.email || '',
    action: 'updated',
  });
  res.json({ ...pa, person_name: person?.name, project_name: project?.name, email_notification });
});
