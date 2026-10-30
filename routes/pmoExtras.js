import { Router } from 'express';
import { store } from '../db/store.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { canCreateProject } from '../lib/permissions.js';
import { getVisibleProjectIdSet, canAccessProject } from '../lib/projectScope.js';
import { RAID_KINDS, RAID_STATUSES, RAID_IMPACTS } from '../lib/raidConstants.js';
import { earnedValueFromTasks } from '../lib/earnedValue.js';

export const pmoExtrasRouter = Router();

async function assertProjectAccess(req, projectId) {
  const visible = await getVisibleProjectIdSet(store, req.user);
  if (!canAccessProject(req.user, projectId, visible)) {
    const err = new Error('You do not have access to this project');
    err.status = 403;
    throw err;
  }
}

pmoExtrasRouter.get('/raid', asyncHandler(async (req, res) => {
  const projectId = req.query.project_id ? +req.query.project_id : null;
  if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'project_id is required' });
  await assertProjectAccess(req, projectId);
  const people = await store.listPeople();
  const rows = await store.listRaid({ project_id: projectId });
  res.json(rows.map((r) => ({
    ...r,
    owner_name: people.find((p) => Number(p.id) === Number(r.owner_person_id))?.name || null,
  })));
}));

pmoExtrasRouter.post('/raid', asyncHandler(async (req, res) => {
  if (!canCreateProject(req.user)) return res.status(403).json({ error: 'Only PMO can add RAID items' });
  const projectId = +req.body?.project_id;
  await assertProjectAccess(req, projectId);
  const kinds = new Set(RAID_KINDS.map((k) => k.id));
  const statuses = new Set(RAID_STATUSES.map((s) => s.id));
  const impacts = new Set(RAID_IMPACTS.map((i) => i.id));
  const saved = await store.addRaid({
    project_id: projectId,
    kind: kinds.has(req.body?.kind) ? req.body.kind : 'risk',
    title: req.body?.title,
    description: req.body?.description,
    status: statuses.has(req.body?.status) ? req.body.status : 'open',
    impact: impacts.has(req.body?.impact) ? req.body.impact : 'medium',
    owner_person_id: req.body?.owner_person_id,
    mitigation: req.body?.mitigation,
  });
  await store.addProjectActivity({
    project_id: projectId,
    actor_name: req.user?.name,
    summary: `RAID ${saved.kind}: ${saved.title}`,
  });
  res.status(201).json(saved);
}));

pmoExtrasRouter.put('/raid/:id', asyncHandler(async (req, res) => {
  if (!canCreateProject(req.user)) return res.status(403).json({ error: 'Only PMO can update RAID items' });
  const saved = await store.updateRaid(+req.params.id, req.body || {});
  if (!saved) return res.status(404).json({ error: 'RAID item not found' });
  res.json(saved);
}));

pmoExtrasRouter.delete('/raid/:id', asyncHandler(async (req, res) => {
  if (!canCreateProject(req.user)) return res.status(403).json({ error: 'Only PMO can delete RAID items' });
  await store.deleteRaid(+req.params.id);
  res.status(204).send();
}));

pmoExtrasRouter.get('/projects/:id/activity', asyncHandler(async (req, res) => {
  const projectId = +req.params.id;
  await assertProjectAccess(req, projectId);
  res.json(await store.listProjectActivity(projectId));
}));

pmoExtrasRouter.get('/tasks/:id/comments', asyncHandler(async (req, res) => {
  res.json(await store.listTaskComments(+req.params.id));
}));

pmoExtrasRouter.post('/tasks/:id/comments', asyncHandler(async (req, res) => {
  const taskId = +req.params.id;
  const task = await store.findProjectTaskById(taskId);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  await assertProjectAccess(req, task.project_id);
  const saved = await store.addTaskComment({
    task_id: taskId,
    author_user_id: req.user?.id,
    author_name: req.user?.name,
    body: req.body?.body,
  });
  await store.addProjectActivity({
    project_id: task.project_id,
    actor_name: req.user?.name,
    summary: `Comment on task “${task.name}”`,
  });
  res.status(201).json(saved);
}));

pmoExtrasRouter.get('/timesheets', asyncHandler(async (req, res) => {
  const projectId = req.query.project_id ? +req.query.project_id : null;
  let rows = await store.listTimeSessions({});
  rows = rows.filter((r) => r.ended_at);
  if (Number.isFinite(projectId)) {
    await assertProjectAccess(req, projectId);
    rows = rows.filter((r) => Number(r.project_id) === projectId);
  } else if (!canCreateProject(req.user) && !canViewAll(req.user)) {
    const visible = await getVisibleProjectIdSet(store, req.user);
    rows = rows.filter((r) => visible?.has(Number(r.project_id)));
  }
  const [tasks, projects, people] = await Promise.all([
    store.listProjectTasks(),
    store.listProjects(),
    store.listPeople(),
  ]);
  res.json(rows.map((s) => ({
    ...s,
    hours: store.hoursFromMinutes(s.minutes || 0),
    task_name: tasks.find((t) => Number(t.id) === Number(s.task_id))?.name || null,
    project_name: projects.find((p) => Number(p.id) === Number(s.project_id))?.name || null,
    person_name: people.find((p) => Number(p.id) === Number(s.person_id))?.name || null,
  })));
}));

function canViewAll(user) {
  return canCreateProject(user);
}

pmoExtrasRouter.post('/timesheets/:id/approve', asyncHandler(async (req, res) => {
  if (!canCreateProject(req.user)) return res.status(403).json({ error: 'Only PMO can approve timesheets' });
  const saved = await store.approveTimeSession(+req.params.id, {
    userId: req.user.id,
    billable: req.body?.billable,
  });
  if (!saved) return res.status(404).json({ error: 'Session not found' });
  res.json(saved);
}));

pmoExtrasRouter.get('/search', asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  if (q.length < 2) return res.json({ projects: [], tasks: [], issues: [], backlogs: [] });
  const visible = await getVisibleProjectIdSet(store, req.user);
  const match = (text) => String(text || '').toLowerCase().includes(q);
  const inScope = (projectId) => visible == null || visible.has(Number(projectId));
  const [projects, tasks, issues, backlogs] = await Promise.all([
    store.listProjects(),
    store.listProjectTasks(),
    store.listIssues(),
    store.listBacklogs(),
  ]);
  res.json({
    projects: projects.filter((p) => inScope(p.id) && (match(p.name) || match(p.short_code) || match(p.program_name))).slice(0, 8),
    tasks: tasks.filter((t) => inScope(t.project_id) && match(t.name)).slice(0, 8),
    issues: issues.filter((i) => (i.project_id == null || inScope(i.project_id)) && (match(i.title) || match(i.ticket_no))).slice(0, 8),
    backlogs: backlogs.filter((b) => inScope(b.project_id) && (match(b.title) || match(b.ref_no))).slice(0, 8),
  });
}));

pmoExtrasRouter.get('/earned-value', asyncHandler(async (req, res) => {
  const projectId = req.query.project_id ? +req.query.project_id : null;
  let tasks = await store.listProjectTasks(Number.isFinite(projectId) ? { project_id: projectId } : {});
  if (Number.isFinite(projectId)) await assertProjectAccess(req, projectId);
  else {
    const visible = await getVisibleProjectIdSet(store, req.user);
    if (visible) tasks = tasks.filter((t) => visible.has(Number(t.project_id)));
  }
  res.json(earnedValueFromTasks(tasks));
}));
