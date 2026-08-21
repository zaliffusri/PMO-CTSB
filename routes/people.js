import { Router } from 'express';
import { store } from '../db/store.js';
import { requirePmoOrAdmin } from '../middleware/requireRole.js';
import {
  isPersonLinkedToUser,
  isPersonVisibleOnLinkedRoster,
  listLinkedPeopleViaRpc,
  syncPeopleRosterFromUsers,
} from '../lib/teamUserSync.js';
import { isDbMode } from '../db/runtime/query.js';

export const peopleRouter = Router();

peopleRouter.get('/', async (req, res) => {
  const linkedOnly = req.query.linked_only === '1' || req.query.linked_only === 'true';

  if (linkedOnly && isDbMode()) {
    try {
      const rows = await listLinkedPeopleViaRpc();
      return res.json(rows);
    } catch (e) {
      console.warn('list_linked_people RPC unavailable, using table select:', e?.message || e);
    }
  }

  const users = await store.listUsers();
  const people = await store.listPeople();
  const assignments = await store.listAssignments();
  const activeUsers = users.filter((u) => u.active !== false);
  let rows = people.map((pe) => {
    const project_count = assignments.filter((a) => a.person_id === pe.id).length;
    const linked_to_user = linkedOnly
      ? isPersonVisibleOnLinkedRoster(pe, activeUsers)
      : isPersonLinkedToUser(pe, activeUsers);
    return { ...pe, project_count, linked_to_user };
  });
  if (linkedOnly) {
    rows = rows.filter((pe) => pe.linked_to_user);
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));
  res.json(rows);
});

peopleRouter.post('/sync-from-users', requirePmoOrAdmin, async (req, res) => {
  let result;
  try {
    result = await syncPeopleRosterFromUsers(store);
  } catch (e) {
    console.error('people sync-from-users failed', e);
    return res.status(500).json({ error: e.message || 'Failed to sync team roster' });
  }
  const { synced, pruned, orphanRemaining } = result;

  try {
    await store.appendAuditLog(req.user, {
      action: 'sync',
      target_type: 'people',
      target_id: null,
      summary: `Synced ${synced} user(s) to team roster; removed ${pruned.length} orphan roster row(s)`,
      detail: { pruned, orphanRemaining },
    });
  } catch (e) {
    console.warn('people sync-from-users audit log skipped', e?.message || e);
  }

  res.json({ synced, pruned, orphanRemaining });
});

peopleRouter.get('/:id', async (req, res) => {
  const id = +req.params.id;
  const people = await store.listPeople();
  const person = people.find((p) => p.id === id);
  if (!person) return res.status(404).json({ error: 'Person not found' });
  const assignments = await store.listAssignments();
  const projects = await store.listProjects();
  const activitiesList = await store.listActivities();
  const personProjects = assignments
    .filter((a) => a.person_id === id)
    .map((a) => {
      const proj = projects.find((p) => p.id === a.project_id);
      return { ...a, project_name: proj?.name, project_status: proj?.status };
    });
  const activities = activitiesList
    .filter((a) => a.person_id === id)
    .sort((a, b) => new Date(b.start_at) - new Date(a.start_at))
    .slice(0, 50)
    .map((a) => {
      const proj = projects.find((p) => p.id === a.project_id);
      return { ...a, project_name: proj?.name };
    });
  res.json({ ...person, projects: personProjects, activities });
});

peopleRouter.post('/', async (req, res) => {
  const { name, email, role } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const id = await store.addPerson({ name, email: email || null, role: role || null });
  await store.appendAuditLog(req.user, {
    action: 'create',
    target_type: 'person',
    target_id: id,
    summary: `Added team member "${name}"`,
  });
  const people = await store.listPeople();
  const person = people.find((p) => p.id === id);
  res.status(201).json(person);
});

peopleRouter.put('/:id', async (req, res) => {
  const { name, email, role } = req.body;
  const id = +req.params.id;
  const people = await store.listPeople();
  const existing = people.find((p) => p.id === id);
  if (!existing) return res.status(404).json({ error: 'Person not found' });
  await store.updatePerson(id, { name: name ?? existing.name, email: email ?? existing.email, role: role ?? existing.role });
  const updatedPeople = await store.listPeople();
  const person = updatedPeople.find((p) => p.id === id);
  await store.appendAuditLog(req.user, {
    action: 'update',
    target_type: 'person',
    target_id: id,
    summary: `Updated team member "${person?.name || id}"`,
  });
  res.json(person);
});

peopleRouter.delete('/:id', async (req, res) => {
  const id = +req.params.id;
  const people = await store.listPeople();
  const existing = people.find((p) => p.id === id);
  if (!existing) return res.status(404).json({ error: 'Person not found' });
  const assignments = await store.listAssignments();
  const activities = await store.listActivities();
  const personAssignments = assignments.filter((a) => a.person_id === id);
  const personActivities = activities.filter((a) => a.person_id === id);
  const assignCount = personAssignments.length;
  const actCount = personActivities.length;
  for (const a of personAssignments) {
    await store.deleteAssignment(a.id);
  }
  for (const a of personActivities) {
    await store.deleteActivity(a.id);
  }
  await store.deletePerson(id);
  await store.appendAuditLog(req.user, {
    action: 'delete',
    target_type: 'person',
    target_id: id,
    summary: `Deleted team member "${existing.name}"`,
    detail: { assignments_removed: assignCount, activities_removed: actCount },
  });
  res.status(204).send();
});
