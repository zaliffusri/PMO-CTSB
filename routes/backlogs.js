import { Router } from 'express';
import { store } from '../db/store.js';
import {
  BACKLOG_TYPE_SET,
  BACKLOG_SOURCE_SET,
  BACKLOG_STATUS_SET,
  BACKLOG_PRIORITY_SET,
  normalizeBacklogStatus,
  backlogStatusLabel,
} from '../lib/backlogConstants.js';
import {
  canCreateProject,
  canUserUpdateBacklog,
  canUserCommentOnBacklog,
} from '../lib/permissions.js';
import { reloadStore, persistStore } from '../lib/storeSync.js';
import { emailForPerson } from '../lib/notifyUser.js';
import { sendTaskAssignedEmail } from '../lib/mailer.js';
import { parseHoursInput } from '../lib/hoursUtils.js';
import { normalizeModuleCode } from '../lib/epbtModules.js';
import {
  tryLinkBacklogToIssueByRef,
  syncIssueBacklogLink,
  nextModuleBacklogRef,
} from '../lib/issueBacklogLink.js';
import { normalizeTaskStatus } from '../lib/taskStatus.js';
import { copyAttachments } from '../lib/attachmentCopy.js';
import {
  notifyBacklogAssigned,
  notifyBacklogStatusChanged,
  notifyBacklogComment,
  canPromoteBacklogToTask,
} from '../lib/backlogNotify.js';
import {
  projectRosterPeople,
  parseMentionedPersonIds,
} from '../lib/backlogComments.js';
import { notifyPersonInApp } from '../lib/notifyUser.js';

export const backlogsRouter = Router();

async function enrichBacklog(item) {
  const [projects, clients, people, issues, tasks, phases, workPackages, users, comments] = await Promise.all([
    store.listProjects(),
    store.listClients(),
    store.listPeople(),
    store.listIssues(),
    store.listProjectTasks(),
    store.listProjectPhases(),
    store.listWorkPackages(),
    store.listUsers(),
    store.listBacklogComments(item.id),
  ]);
  const project = projects.find((p) => p.id === item.project_id);
  const client = item.client_id ? clients.find((c) => c.id === item.client_id) : null;
  const assignee = item.assignee_person_id
    ? people.find((p) => p.id === item.assignee_person_id)
    : null;
  const issue = item.issue_id ? issues.find((i) => i.id === item.issue_id) : null;
  const task = item.task_id ? tasks.find((t) => t.id === item.task_id) : null;
  const phase = item.phase_id ? phases.find((ph) => ph.id === item.phase_id) : null;
  const wp = item.work_package_id
    ? workPackages.find((w) => w.id === item.work_package_id)
    : null;
  const creator = item.created_by_user_id
    ? users.find((u) => u.id === item.created_by_user_id)
    : null;

  return {
    ...item,
    status: normalizeBacklogStatus(item.status),
    project_name: project?.name ?? null,
    client_name: client?.name ?? null,
    assignee_name: assignee?.name ?? null,
    created_by_name: creator?.name ?? null,
    issue_ticket_no: issue?.ticket_no ?? null,
    issue_id: item.issue_id ?? issue?.id ?? null,
    issue_external_ticket_ref: issue?.external_ticket_ref ?? item.external_ticket_ref ?? null,
    task_name: task?.name ?? null,
    phase_name: phase?.name ?? null,
    work_package_name: wp?.name ?? null,
    work_package_classification: wp?.classification ?? null,
    comment_count: comments.length,
  };
}

async function enrichComment(comment) {
  const [users, backlogs, people] = await Promise.all([
    store.listUsers(),
    store.listBacklogs(),
    store.listPeople(),
  ]);
  const author = users.find((u) => u.id === comment.author_user_id);
  const backlog = backlogs.find((b) => b.id === comment.backlog_id);
  const roster = backlog ? await projectRosterPeople(store, backlog.project_id) : [];
  const mentioned = (comment.mentioned_person_ids || [])
    .map((pid) => people.find((p) => p.id === +pid))
    .filter(Boolean)
    .map((p) => p.name);
  return {
    ...comment,
    author_name: author?.name ?? 'User',
    mentioned_names: mentioned,
    roster_people: roster.map((p) => ({ id: p.id, name: p.name, email: p.email })),
  };
}

backlogsRouter.get('/', async (req, res) => {
  await reloadStore();
  const projectId = req.query.project_id ? +req.query.project_id : null;
  const status = req.query.status;
  const itemType = req.query.item_type;
  const source = req.query.source;
  const workPackageId = req.query.work_package_id ? +req.query.work_package_id : null;
  const backlogs = await store.listBacklogs();
  let list = await Promise.all(backlogs.map(enrichBacklog));
  if (projectId) list = list.filter((b) => b.project_id === projectId);
  if (workPackageId) list = list.filter((b) => b.work_package_id === workPackageId);
  if (status && status !== 'all') list = list.filter((b) => b.status === status);
  if (itemType && itemType !== 'all') list = list.filter((b) => b.item_type === itemType);
  if (source && source !== 'all') list = list.filter((b) => b.source === source);
  list.sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
  res.json(list);
});

backlogsRouter.get('/:id/comments', async (req, res) => {
  const backlogs = await store.listBacklogs();
  const item = backlogs.find((b) => b.id === +req.params.id);
  if (!item) return res.status(404).json({ error: 'Backlog item not found' });
  const comments = await store.listBacklogComments(item.id);
  res.json(await Promise.all(comments.map(enrichComment)));
});

backlogsRouter.post('/:id/comments', async (req, res) => {
  const id = +req.params.id;
  const backlogs = await store.listBacklogs();
  const item = backlogs.find((b) => b.id === id);
  if (!item) return res.status(404).json({ error: 'Backlog item not found' });
  const [people, assignments] = await Promise.all([
    store.listPeople(),
    store.listAssignments(),
  ]);
  if (!canUserCommentOnBacklog(req.user, item, people, assignments)) {
    return res.status(403).json({ error: 'You do not have permission to comment on this backlog item' });
  }
  const body = String(req.body?.body || '').trim();
  if (!body) return res.status(400).json({ error: 'Comment body is required' });
  const roster = await projectRosterPeople(store, item.project_id);
  const mentionedPersonIds = parseMentionedPersonIds(body, roster);
  const commentId = await store.addBacklogComment({
    backlog_id: id,
    author_user_id: req.user.id,
    body,
    mentioned_person_ids: mentionedPersonIds,
  });
  const comments = await store.listBacklogComments(id);
  const comment = await enrichComment(comments.find((c) => c.id === commentId));
  await notifyBacklogComment(store, item, comment, {
    actorUser: req.user,
    mentionedPersonIds,
  });
  await store.appendAuditLog(req.user, {
    action: 'comment',
    target_type: 'backlog',
    target_id: id,
    summary: `Comment on backlog ${item.ref_no}`,
  });
  if (!(await persistStore(res))) return;
  res.status(201).json(comment);
});

backlogsRouter.get('/:id', async (req, res) => {
  const backlogs = await store.listBacklogs();
  const item = backlogs.find((b) => b.id === +req.params.id);
  if (!item) return res.status(404).json({ error: 'Backlog item not found' });
  res.json(await enrichBacklog(item));
});

backlogsRouter.post('/', async (req, res) => {
  if (!canCreateProject(req.user)) {
    return res.status(403).json({ error: 'Only PMO can create backlog items' });
  }
  const body = req.body || {};
  if (!body.project_id || !body.title) {
    return res.status(400).json({ error: 'project_id and title are required' });
  }
  const existingBacklogs = await store.listBacklogs();
  const id = await store.addBacklog({
    ref_no: body.ref_no
      ? String(body.ref_no).trim()
      : (body.module_code ? nextModuleBacklogRef(existingBacklogs, body.module_code) : undefined),
    project_id: +body.project_id,
    title: String(body.title).trim(),
    description: body.description != null ? String(body.description) : null,
    item_type: BACKLOG_TYPE_SET.has(body.item_type) ? body.item_type : 'scope',
    source: BACKLOG_SOURCE_SET.has(body.source) ? body.source : 'manual',
    status: BACKLOG_STATUS_SET.has(body.status) ? body.status : 'open',
    priority: BACKLOG_PRIORITY_SET.has(body.priority) ? body.priority : 'medium',
    issue_id: body.issue_id != null && body.issue_id !== '' ? +body.issue_id : null,
    assignee_person_id: body.assignee_person_id != null && body.assignee_person_id !== '' ? +body.assignee_person_id : null,
    created_by_user_id: req.user.id,
    module_code: body.module_code != null ? normalizeModuleCode(body.module_code) : null,
    client_id: body.client_id != null && body.client_id !== '' ? +body.client_id : null,
    external_ticket_ref: body.external_ticket_ref != null ? String(body.external_ticket_ref).trim() : null,
    effort_days: body.effort_days != null && body.effort_days !== '' ? +body.effort_days : null,
    estimated_hours: parseHoursInput(body.estimated_hours)
      ?? (body.effort_days != null && body.effort_days !== '' ? +body.effort_days * 8 : null),
    actual_hours: parseHoursInput(body.actual_hours),
    phase_id: body.phase_id != null && body.phase_id !== '' ? +body.phase_id : null,
    work_package_id: body.work_package_id != null && body.work_package_id !== '' ? +body.work_package_id : null,
  });
  if (body.issue_id) {
    await syncIssueBacklogLink(store, +body.issue_id, id);
  } else {
    await tryLinkBacklogToIssueByRef(store, id);
  }
  const backlogsAfter = await store.listBacklogs();
  const item = await enrichBacklog(backlogsAfter.find((b) => b.id === id));
  await notifyBacklogAssigned(store, item, { actorUser: req.user, isNew: true });
  await store.appendAuditLog(req.user, {
    action: 'create',
    target_type: 'backlog',
    target_id: id,
    summary: `Created backlog ${item.ref_no}: ${item.title}`,
  });
  if (!(await persistStore(res))) return;
  res.status(201).json(item);
});

backlogsRouter.put('/:id', async (req, res) => {
  const id = +req.params.id;
  const backlogs = await store.listBacklogs();
  const cur = backlogs.find((b) => b.id === id);
  if (!cur) return res.status(404).json({ error: 'Backlog item not found' });
  const people = await store.listPeople();
  if (!canUserUpdateBacklog(req.user, cur, people)) {
    return res.status(403).json({ error: 'You do not have permission to update this backlog item' });
  }
  const isPmo = canCreateProject(req.user);
  const body = req.body || {};
  const patch = {};
  const previousStatus = normalizeBacklogStatus(cur.status);
  const previousAssignee = cur.assignee_person_id;

  if (isPmo) {
    if (body.title != null) patch.title = String(body.title).trim();
    if (body.description !== undefined) patch.description = body.description != null ? String(body.description) : null;
    if (body.item_type != null && BACKLOG_TYPE_SET.has(body.item_type)) patch.item_type = body.item_type;
    if (body.source != null && BACKLOG_SOURCE_SET.has(body.source)) patch.source = body.source;
    if (body.priority != null && BACKLOG_PRIORITY_SET.has(body.priority)) patch.priority = body.priority;
    if (body.assignee_person_id !== undefined) {
      patch.assignee_person_id = body.assignee_person_id != null && body.assignee_person_id !== '' ? +body.assignee_person_id : null;
    }
    if (body.effort_days !== undefined) {
      patch.effort_days = body.effort_days != null && body.effort_days !== '' ? +body.effort_days : null;
    }
    if (body.estimated_hours !== undefined) {
      patch.estimated_hours = parseHoursInput(body.estimated_hours);
    }
    if (body.phase_id !== undefined) {
      patch.phase_id = body.phase_id != null && body.phase_id !== '' ? +body.phase_id : null;
    }
    if (body.work_package_id !== undefined) {
      patch.work_package_id = body.work_package_id != null && body.work_package_id !== '' ? +body.work_package_id : null;
    }
    if (body.module_code !== undefined) {
      patch.module_code = body.module_code != null ? normalizeModuleCode(body.module_code) : null;
    }
    if (body.client_id !== undefined) {
      patch.client_id = body.client_id != null && body.client_id !== '' ? +body.client_id : null;
    }
    if (body.external_ticket_ref !== undefined) {
      patch.external_ticket_ref = body.external_ticket_ref != null ? String(body.external_ticket_ref).trim() || null : null;
    }
    if (body.issue_id !== undefined) {
      patch.issue_id = body.issue_id != null && body.issue_id !== '' ? +body.issue_id : null;
    }
  }

  if (body.status != null && BACKLOG_STATUS_SET.has(body.status)) patch.status = body.status;
  if (body.actual_hours !== undefined) {
    patch.actual_hours = parseHoursInput(body.actual_hours);
  }

  if (!isPmo && Object.keys(patch).length === 0) {
    return res.status(400).json({ error: 'No allowed fields to update' });
  }

  await store.updateBacklog(id, patch);
  if (patch.issue_id) {
    await syncIssueBacklogLink(store, patch.issue_id, id);
  } else if (patch.external_ticket_ref !== undefined) {
    await tryLinkBacklogToIssueByRef(store, id);
  }

  const backlogsAfter = await store.listBacklogs();
  const updated = await enrichBacklog(backlogsAfter.find((b) => b.id === id));

  if (patch.status && normalizeBacklogStatus(patch.status) !== previousStatus) {
    await notifyBacklogStatusChanged(store, updated, {
      actorUser: req.user,
      previousStatus,
    });
    await store.appendAuditLog(req.user, {
      action: 'status',
      target_type: 'backlog',
      target_id: id,
      summary: `Backlog ${updated.ref_no}: ${backlogStatusLabel(previousStatus)} → ${backlogStatusLabel(updated.status)}`,
    });
  }

  if (patch.assignee_person_id !== undefined && patch.assignee_person_id !== previousAssignee && patch.assignee_person_id) {
    await notifyBacklogAssigned(store, updated, { actorUser: req.user, isNew: false });
  }

  if (!(await persistStore(res))) return;

  res.json(updated);
});

backlogsRouter.post('/:id/promote-task', async (req, res) => {
  if (!canCreateProject(req.user)) {
    return res.status(403).json({ error: 'Only PMO can promote backlog to task' });
  }
  const id = +req.params.id;
  const backlogs = await store.listBacklogs();
  const item = backlogs.find((b) => b.id === id);
  if (!item) return res.status(404).json({ error: 'Backlog item not found' });
  if (item.task_id) return res.status(400).json({ error: 'Backlog item already linked to a task' });
  if (!canPromoteBacklogToTask(item)) {
    return res.status(400).json({ error: 'Closed backlog items cannot be promoted to a task' });
  }

  const people = await store.listPeople();
  const assigneeId = req.body?.assignee_id != null && req.body.assignee_id !== ''
    ? +req.body.assignee_id
    : item.assignee_person_id;
  if (assigneeId != null && !people.some((p) => p.id === assigneeId)) {
    return res.status(400).json({ error: 'Invalid assignee' });
  }

  let taskId;
  try {
    const { promoteBacklogToTaskTx } = await import('../lib/backlogPromoteTaskTx.js');
    const tx = await promoteBacklogToTaskTx(id, {
      assigneeId: assigneeId ?? null,
      estimatedHours: item.estimated_hours ?? (item.effort_days != null ? item.effort_days * 8 : null),
      actualHours: item.actual_hours ?? null,
    });
    if (tx?.task?.id) {
      taskId = tx.task.id;
    }
  } catch (e) {
    if (/already linked|cannot be promoted|not found/i.test(String(e?.message || ''))) {
      return res.status(400).json({ error: e.message });
    }
    console.warn('promoteBacklogToTaskTx:', e?.message || e);
  }

  if (taskId == null) {
    taskId = await store.addProjectTask({
      project_id: item.project_id,
      name: item.title,
      task_kind: 'task',
      status: 'new',
      progress_percent: 0,
      assignee_id: assigneeId ?? null,
      backlog_id: id,
      work_package_id: item.work_package_id ?? null,
      estimated_hours: item.estimated_hours ?? (item.effort_days != null ? item.effort_days * 8 : null),
      actual_hours: item.actual_hours ?? null,
    });
    await store.updateBacklog(id, { status: 'in_progress', task_id: taskId });
  }

  await copyAttachments(store, 'backlog', id, 'task', taskId);

  const tasks = await store.listProjectTasks();
  const task = tasks.find((t) => t.id === taskId);
  await store.appendAuditLog(req.user, {
    action: 'promote',
    target_type: 'backlog',
    target_id: id,
    summary: `Promoted backlog ${item.ref_no} to task #${taskId}`,
  });

  if (assigneeId) {
    const person = people.find((p) => p.id === assigneeId);
    const projects = await store.listProjects();
    const project = projects.find((p) => p.id === item.project_id);
    await notifyPersonInApp(assigneeId, {
      type: 'task_assigned',
      title: 'New task from backlog',
      body: `${item.ref_no}: ${item.title}`,
      link: `/projects/${item.project_id}?tab=tasks`,
    });
    const email = await emailForPerson(person);
    if (email) {
      await sendTaskAssignedEmail({
        to: email,
        personName: person?.name,
        taskName: item.title,
        projectName: project?.name,
        assignedBy: req.user.name,
      });
    }
  }

  if (!(await persistStore(res))) return;

  const backlogsAfter = await store.listBacklogs();
  const projects = await store.listProjects();
  res.json({
    backlog: await enrichBacklog(backlogsAfter.find((b) => b.id === id)),
    task: {
      ...task,
      status: normalizeTaskStatus(task),
      project_name: projects.find((p) => p.id === task.project_id)?.name,
    },
  });
});
