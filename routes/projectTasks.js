import { Router } from 'express';
import { store } from '../db/store.js';
import { normalizeTaskStatus } from '../lib/taskStatus.js';
import { notifyPersonInApp, emailForPerson } from '../lib/notifyUser.js';
import { sendTaskAssignedEmail } from '../lib/mailer.js';
import { parseHoursInput } from '../lib/hoursUtils.js';
import { reloadStore, persistStore } from '../lib/storeSync.js';

export const projectTasksRouter = Router();

function rollupGroupHours(groupId, allTasks) {
  const kids = allTasks.filter(
    (t) => t.parent_id === groupId && t.task_kind !== 'group',
  );
  const estimated = kids.reduce((s, t) => s + (Number(t.estimated_hours) || 0), 0);
  const actual = kids.reduce((s, t) => s + (Number(t.actual_hours) || 0), 0);
  return {
    estimated_hours: estimated > 0 ? Math.round(estimated * 100) / 100 : null,
    actual_hours: actual > 0 ? Math.round(actual * 100) / 100 : null,
  };
}

async function withTaskMeta(t, preloaded = null) {
  const projects = preloaded?.projects ?? await store.listProjects();
  const people = preloaded?.people ?? await store.listPeople();
  const allTasks = preloaded?.tasks ?? await store.listProjectTasks();
  const workPackages = preloaded?.workPackages ?? await store.listWorkPackages();
  const project = projects.find(p => p.id === t.project_id);
  const assignee = t.assignee_id != null ? people.find(p => p.id === t.assignee_id) : null;
  const task_kind = t.task_kind === 'group' ? 'group' : 'task';
  const parent = t.parent_id != null ? allTasks.find(p => p.id === t.parent_id) : null;
  const wp = t.work_package_id
    ? workPackages.find((w) => w.id === t.work_package_id)
    : null;
  const hours = task_kind === 'group' ? rollupGroupHours(t.id, allTasks) : {
    estimated_hours: t.estimated_hours ?? null,
    actual_hours: t.actual_hours ?? null,
  };
  return {
    ...t,
    ...hours,
    task_kind,
    status: normalizeTaskStatus(t),
    project_name: project?.name,
    assignee_name: assignee?.name ?? null,
    parent_name: parent?.name ?? null,
    work_package_name: wp?.name ?? null,
    work_package_classification: wp?.classification ?? null,
  };
}

function parseAssigneeId(body, existing = null) {
  if (body.assignee_id === undefined) return existing?.assignee_id ?? null;
  if (body.assignee_id === null || body.assignee_id === '') return null;
  const n = +body.assignee_id;
  return Number.isFinite(n) && n > 0 ? n : null;
}

function hierarchicalTaskSort(tasks) {
  const list = [...tasks];
  const byId = new Set(list.map((t) => t.id));
  const roots = list
    .filter((t) => t.parent_id == null || !byId.has(t.parent_id))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const out = [];
  for (const r of roots) {
    out.push(r);
    list
      .filter((t) => t.parent_id === r.id)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .forEach((c) => out.push(c));
  }
  return out;
}

function applySort(tasks) {
  return hierarchicalTaskSort(tasks);
}

async function loadTaskMetaContext() {
  const [projects, people, tasks, workPackages] = await Promise.all([
    store.listProjects(),
    store.listPeople(),
    store.listProjectTasks(),
    store.listWorkPackages(),
  ]);
  return { projects, people, tasks, workPackages };
}

projectTasksRouter.get('/', async (req, res) => {
  await reloadStore();
  const projectId = req.query.project_id ? +req.query.project_id : null;
  const workPackageId = req.query.work_package_id ? +req.query.work_package_id : null;
  const ctx = await loadTaskMetaContext();
  let tasks = await Promise.all(ctx.tasks.map((t) => withTaskMeta(t, ctx)));
  if (projectId) tasks = tasks.filter(t => t.project_id === projectId);
  if (workPackageId) tasks = tasks.filter((t) => t.work_package_id === workPackageId);
  tasks = applySort(tasks);
  res.json(tasks);
});

projectTasksRouter.get('/gantt', async (req, res) => {
  const from = req.query.from;
  const to = req.query.to;
  const ctx = await loadTaskMetaContext();
  let tasks = await Promise.all(
    ctx.tasks
      .filter((t) => t.task_kind !== 'group')
      .map((t) => withTaskMeta(t, ctx)),
  );
  if (from && to) {
    tasks = tasks.filter(t => {
      const taskStart = t.planned_start_date || t.actual_start_date;
      const taskEnd = t.planned_end_date || t.actual_end_date;
      if (!taskStart && !taskEnd) return true;
      const start = taskStart || taskEnd;
      const end = taskEnd || taskStart;
      return end >= from && start <= to;
    });
  }
  tasks = applySort(tasks);
  res.json(tasks);
});

projectTasksRouter.post('/', async (req, res) => {
  const {
    project_id,
    name,
    planned_start_date,
    planned_end_date,
    actual_start_date,
    actual_end_date,
    progress_percent,
    sort_order,
    status,
    assignee_id,
    parent_id,
    task_kind: bodyKind,
    work_package_id,
    estimated_hours,
    actual_hours,
  } = req.body;
  if (!project_id || !name) return res.status(400).json({ error: 'project_id and name are required' });
  const task_kind = bodyKind === 'group' ? 'group' : 'task';
  let pid = null;
  if (parent_id != null && parent_id !== '') {
    const n = +parent_id;
    if (Number.isFinite(n) && n > 0) pid = n;
  }

  const allTasks = await store.listProjectTasks();
  const people = await store.listPeople();

  if (task_kind === 'group') {
    if (pid != null) return res.status(400).json({ error: 'A task group cannot have a parent' });
  }
  if (pid != null) {
    const parent = allTasks.find(t => t.id === pid);
    if (!parent || parent.project_id !== +project_id) {
      return res.status(400).json({ error: 'Parent task group not found' });
    }
    const parentKind = parent.task_kind === 'group' ? 'group' : 'task';
    if (parentKind !== 'group') {
      return res.status(400).json({ error: 'Subtasks must belong to a task group (create one with + Task group first)' });
    }
    if (parent.parent_id != null) {
      return res.status(400).json({ error: 'Invalid parent' });
    }
  }

  const aid = task_kind === 'group' ? null : parseAssigneeId({ assignee_id }, {});
  if (aid != null && !people.some(p => p.id === aid)) {
    return res.status(400).json({ error: 'Invalid assignee' });
  }

  const id = await store.addProjectTask({
    project_id: +project_id,
    name,
    planned_start_date: planned_start_date || null,
    planned_end_date: planned_end_date || null,
    actual_start_date: actual_start_date || null,
    actual_end_date: actual_end_date || null,
    progress_percent: task_kind === 'group' ? 0 : progress_percent,
    sort_order: sort_order != null ? sort_order : undefined,
    status: task_kind === 'group' ? 'new' : status,
    assignee_id: aid,
    parent_id: pid,
    task_kind,
    work_package_id: work_package_id != null && work_package_id !== '' ? +work_package_id : null,
    estimated_hours: task_kind === 'group' ? null : parseHoursInput(estimated_hours),
    actual_hours: task_kind === 'group' ? null : parseHoursInput(actual_hours),
  });
  const tasks = await store.listProjectTasks();
  const projects = await store.listProjects();
  const task = tasks.find(t => t.id === id);
  const proj = projects.find((p) => p.id === task.project_id);
  await store.appendAuditLog(req.user, {
    action: 'create',
    target_type: 'project_task',
    target_id: id,
    summary: `Created ${task_kind === 'group' ? 'task group' : 'task'} "${name}" in "${proj?.name || task.project_id}"`,
  });
  if (aid != null && task_kind !== 'group') {
    const person = people.find((p) => p.id === aid);
    await notifyPersonInApp(aid, {
      type: 'task_assigned',
      title: `New task: ${name}`,
      body: proj?.name || '',
      link: `/projects/${task.project_id}?tab=tasks&task=${id}`,
      entity_type: 'project_task',
      entity_id: id,
    });
    const to = await emailForPerson(person);
    if (to) {
      sendTaskAssignedEmail({
        to,
        personName: person?.name,
        taskName: name,
        projectName: proj?.name,
        assignedBy: req.user.name,
      }).catch((e) => console.warn('task email:', e.message));
    }
  }
  if (!(await persistStore(res))) return;
  res.status(201).json(await withTaskMeta(task));
});

projectTasksRouter.put('/:id', async (req, res) => {
  const id = +req.params.id;
  const allTasks = await store.listProjectTasks();
  const existing = allTasks.find(t => t.id === id);
  if (!existing) return res.status(404).json({ error: 'Task not found' });

  const hasChildren = allTasks.some(t => t.parent_id === existing.id);
  const existingKind = existing.task_kind === 'group' ? 'group' : 'task';

  let nextKind = existingKind;
  if (req.body.task_kind !== undefined) {
    nextKind = req.body.task_kind === 'group' ? 'group' : 'task';
  }
  if (hasChildren && nextKind !== 'group') {
    return res.status(400).json({ error: 'This task has subtasks; keep it as a task group or delete subtasks first' });
  }

  let nextParentId = existing.parent_id;
  if (req.body.parent_id !== undefined) {
    const raw = req.body.parent_id;
    if (raw === null || raw === '') nextParentId = null;
    else {
      const n = +raw;
      nextParentId = Number.isFinite(n) && n > 0 ? n : null;
    }
  }
  if (nextKind === 'group') {
    nextParentId = null;
  }
  if (nextParentId != null) {
    const parent = allTasks.find(t => t.id === nextParentId);
    if (!parent || parent.project_id !== existing.project_id) {
      return res.status(400).json({ error: 'Parent task group not found' });
    }
    const parentKindPut = parent.task_kind === 'group' ? 'group' : 'task';
    if (parentKindPut !== 'group') {
      return res.status(400).json({ error: 'Subtasks must belong to a task group' });
    }
    if (parent.parent_id != null) {
      return res.status(400).json({ error: 'Invalid parent' });
    }
    if (parent.id === existing.id) {
      return res.status(400).json({ error: 'Task cannot be its own parent' });
    }
    nextKind = 'task';
  }

  const {
    name,
    planned_start_date,
    planned_end_date,
    actual_start_date,
    actual_end_date,
    progress_percent,
    sort_order,
    status,
    assignee_id,
    estimated_hours,
    actual_hours,
  } = req.body;

  let nextWorkPackageId = existing.work_package_id ?? null;
  if (req.body.work_package_id !== undefined) {
    nextWorkPackageId = req.body.work_package_id != null && req.body.work_package_id !== ''
      ? +req.body.work_package_id
      : null;
  }

  const baseStatus = normalizeTaskStatus(existing);
  let nextProgress = progress_percent !== undefined ? progress_percent : existing.progress_percent;
  let nextStatus = status !== undefined && ['new', 'ongoing', 'done'].includes(status) ? status : baseStatus;
  if (nextKind === 'group') {
    nextProgress = 0;
    nextStatus = 'new';
  } else {
    if (nextProgress >= 100) nextStatus = 'done';
    if (nextStatus === 'done' && nextProgress < 100) nextProgress = 100;
  }

  const people = await store.listPeople();
  let nextAssignee = parseAssigneeId({ assignee_id }, existing);
  if (nextKind === 'group') {
    nextAssignee = null;
  } else if (assignee_id !== undefined && nextAssignee != null && !people.some(p => p.id === nextAssignee)) {
    return res.status(400).json({ error: 'Invalid assignee' });
  }

  const prevAssignee = existing.assignee_id;
  const nextEstimated = estimated_hours !== undefined
    ? (nextKind === 'group' ? null : parseHoursInput(estimated_hours))
    : existing.estimated_hours;
  const nextActual = actual_hours !== undefined
    ? (nextKind === 'group' ? null : parseHoursInput(actual_hours))
    : existing.actual_hours;

  await store.updateProjectTask(id, {
    name: name ?? existing.name,
    planned_start_date: planned_start_date !== undefined ? planned_start_date : existing.planned_start_date,
    planned_end_date: planned_end_date !== undefined ? planned_end_date : existing.planned_end_date,
    actual_start_date: actual_start_date !== undefined ? actual_start_date : existing.actual_start_date,
    actual_end_date: actual_end_date !== undefined ? actual_end_date : existing.actual_end_date,
    progress_percent: nextProgress,
    sort_order: sort_order !== undefined ? sort_order : existing.sort_order,
    status: nextStatus,
    assignee_id: nextAssignee,
    parent_id: nextParentId,
    task_kind: nextKind,
    work_package_id: nextWorkPackageId,
    estimated_hours: nextEstimated,
    actual_hours: nextActual,
  });
  const tasks = await store.listProjectTasks();
  const task = tasks.find(t => t.id === id);
  const meta = await withTaskMeta(task);
  if (
    nextKind !== 'group'
    && nextAssignee != null
    && nextAssignee !== prevAssignee
    && assignee_id !== undefined
  ) {
    const person = people.find((p) => p.id === nextAssignee);
    await notifyPersonInApp(nextAssignee, {
      type: 'task_assigned',
      title: `Task assigned: ${meta.name}`,
      body: meta.project_name || '',
      link: `/projects/${task.project_id}?tab=tasks&task=${id}`,
      entity_type: 'project_task',
      entity_id: id,
    });
    const to = await emailForPerson(person);
    if (to) {
      sendTaskAssignedEmail({
        to,
        personName: person?.name,
        taskName: meta.name,
        projectName: meta.project_name,
        assignedBy: req.user.name,
      }).catch((e) => console.warn('task email:', e.message));
    }
  }
  if (!(await persistStore(res))) return;
  res.json(meta);
});

projectTasksRouter.delete('/:id', async (req, res) => {
  const id = +req.params.id;
  const allTasks = await store.listProjectTasks();
  const existing = allTasks.find(t => t.id === id);
  if (!existing) return res.status(404).json({ error: 'Task not found' });
  const projects = await store.listProjects();
  const proj = projects.find((p) => p.id === existing.project_id);
  await store.deleteProjectTask(id);
  await store.appendAuditLog(req.user, {
    action: 'delete',
    target_type: 'project_task',
    target_id: id,
    summary: `Deleted task "${existing.name}" from "${proj?.name || existing.project_id}"`,
  });
  if (!(await persistStore(res))) return;
  res.status(204).send();
});
