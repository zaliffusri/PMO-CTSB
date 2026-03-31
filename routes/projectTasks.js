import { Router } from 'express';
import { store } from '../db/store.js';
import { normalizeTaskStatus } from '../lib/taskStatus.js';

export const projectTasksRouter = Router();

function withTaskMeta(t) {
  const project = store.projects.find(p => p.id === t.project_id);
  const assignee = t.assignee_id != null ? store.people.find(p => p.id === t.assignee_id) : null;
  const task_kind = t.task_kind === 'group' ? 'group' : 'task';
  const parent = t.parent_id != null ? store.project_tasks.find(p => p.id === t.parent_id) : null;
  return {
    ...t,
    task_kind,
    status: normalizeTaskStatus(t),
    project_name: project?.name,
    assignee_name: assignee?.name ?? null,
    parent_name: parent?.name ?? null,
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

projectTasksRouter.get('/', (req, res) => {
  const projectId = req.query.project_id ? +req.query.project_id : null;
  let tasks = store.project_tasks.map(t => withTaskMeta(t));
  if (projectId) tasks = tasks.filter(t => t.project_id === projectId);
  tasks = applySort(tasks);
  res.json(tasks);
});

projectTasksRouter.get('/gantt', (req, res) => {
  const from = req.query.from;
  const to = req.query.to;
  let tasks = store.project_tasks
    .filter((t) => t.task_kind !== 'group')
    .map(t => withTaskMeta(t));
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

projectTasksRouter.post('/', (req, res) => {
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
  } = req.body;
  if (!project_id || !name) return res.status(400).json({ error: 'project_id and name are required' });
  const task_kind = bodyKind === 'group' ? 'group' : 'task';
  let pid = null;
  if (parent_id != null && parent_id !== '') {
    const n = +parent_id;
    if (Number.isFinite(n) && n > 0) pid = n;
  }

  if (task_kind === 'group') {
    if (pid != null) return res.status(400).json({ error: 'A task group cannot have a parent' });
  }
  if (pid != null) {
    const parent = store.project_tasks.find(t => t.id === pid);
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
  if (aid != null && !store.people.some(p => p.id === aid)) {
    return res.status(400).json({ error: 'Invalid assignee' });
  }

  const id = store.addProjectTask({
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
  });
  const task = store.project_tasks.find(t => t.id === id);
  const proj = store.projects.find((p) => p.id === task.project_id);
  store.appendAuditLog(req.user, {
    action: 'create',
    target_type: 'project_task',
    target_id: id,
    summary: `Created ${task_kind === 'group' ? 'task group' : 'task'} "${name}" in "${proj?.name || task.project_id}"`,
  });
  res.status(201).json(withTaskMeta(task));
});

projectTasksRouter.put('/:id', (req, res) => {
  const id = +req.params.id;
  const existing = store.project_tasks.find(t => t.id === id);
  if (!existing) return res.status(404).json({ error: 'Task not found' });

  const hasChildren = store.project_tasks.some(t => t.parent_id === existing.id);
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
    const parent = store.project_tasks.find(t => t.id === nextParentId);
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
  } = req.body;

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

  let nextAssignee = parseAssigneeId({ assignee_id }, existing);
  if (nextKind === 'group') {
    nextAssignee = null;
  } else if (assignee_id !== undefined && nextAssignee != null && !store.people.some(p => p.id === nextAssignee)) {
    return res.status(400).json({ error: 'Invalid assignee' });
  }

  store.updateProjectTask(id, {
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
  });
  const task = store.project_tasks.find(t => t.id === id);
  res.json(withTaskMeta(task));
});

projectTasksRouter.delete('/:id', (req, res) => {
  const id = +req.params.id;
  const existing = store.project_tasks.find(t => t.id === id);
  if (!existing) return res.status(404).json({ error: 'Task not found' });
  const proj = store.projects.find((p) => p.id === existing.project_id);
  store.deleteProjectTask(id);
  store.appendAuditLog(req.user, {
    action: 'delete',
    target_type: 'project_task',
    target_id: id,
    summary: `Deleted task "${existing.name}" from "${proj?.name || existing.project_id}"`,
  });
  res.status(204).send();
});
