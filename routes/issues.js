import { Router } from 'express';
import { store } from '../db/store.js';
import {
  ISSUE_STATUS_SET,
  ISSUE_PRIORITY_SET,
  ISSUE_CATEGORY_SET,
  ISSUE_SUPPORT_LEVEL_SET,
  ISSUE_INCIDENT_TYPE_SET,
  ISSUE_INTAKE_CHANNEL_SET,
  incidentTypeLabel,
  intakeChannelLabel,
  parseIncidentType,
  parseIntakeChannel,
  categoryForIncidentType,
} from '../lib/issueConstants.js';
import { moduleLabelForCode, normalizeModuleCode } from '../lib/epbtModules.js';
import { parseCsv, mapEticketRowToIssue, personLabelFromUser } from '../lib/eticketImport.js';
import {
  canAssignIssues,
  personIdForUser,
  isHelpdeskAssignee,
  canUserPromoteIssueToBacklog,
} from '../lib/permissions.js';
import {
  OPEN_ISSUE_STATUSES,
  normalizeSupportLevel,
  nextSupportLevel,
  isIssueEligibleForBacklogPromote,
  parseResolutionMethod,
  supportLevelLabel,
  helpdeskStageForIssue,
} from '../lib/issueWorkflow.js';
import { notifyPersonInApp, emailForPerson } from '../lib/notifyUser.js';
import { notifyBacklogAssigned } from '../lib/backlogNotify.js';
import { sendIssueAssignedEmail } from '../lib/mailer.js';
import {
  issueCategoryToBacklogType,
  issueCategoryToBacklogSource,
} from '../lib/backlogConstants.js';
import {
  promoteIssueToBacklog,
  tryLinkIssueToBacklogByRef,
} from '../lib/issueBacklogLink.js';
import { copyAttachments } from '../lib/attachmentCopy.js';

export const issuesRouter = Router();

function enrichIssue(issue, user = null) {
  const project = issue.project_id ? store.projects.find((p) => p.id === issue.project_id) : null;
  const client = issue.client_id ? store.clients.find((c) => c.id === issue.client_id) : null;
  const assignee = issue.assignee_person_id
    ? store.people.find((p) => p.id === issue.assignee_person_id)
    : null;
  const reporter = issue.reporter_user_id ? store.findUserById(issue.reporter_user_id) : null;
  const level = normalizeSupportLevel(issue.support_level);
  const backlog = store.findBacklogByIssueId(issue.id);
  const stage = helpdeskStageForIssue(issue, backlog);
  const backlogRef = issue.backlog_ref || backlog?.ref_no || null;
  const eligibleForBacklog = isIssueEligibleForBacklogPromote(issue) && !backlog;
  const canPromote = user
    ? eligibleForBacklog && canUserPromoteIssueToBacklog(user, issue, store.people)
    : eligibleForBacklog;
  return {
    ...issue,
    support_level: level,
    support_level_label: stage.label,
    helpdesk_stage: stage.code,
    helpdesk_stage_label: stage.label,
    incident_type_label: incidentTypeLabel(issue.incident_type),
    intake_channel_label: intakeChannelLabel(issue.intake_channel),
    epbt_module_label: issue.epbt_module || moduleLabelForCode(issue.module_code),
    project_name: project?.name ?? null,
    client_name: client?.name ?? null,
    client_short_code: client?.short_code ?? null,
    assignee_name: assignee?.name ?? null,
    reporter_name: reporter?.name ?? null,
    backlog_ref: backlogRef,
    backlog_id: backlog?.id ?? null,
    backlog_project_id: backlog?.project_id ?? null,
    can_promote_backlog: canPromote,
  };
}

function canEscalateIssue(user, issue) {
  const backlog = store.findBacklogByIssueId(issue.id);
  const stage = helpdeskStageForIssue(issue, backlog);
  if (stage.code !== 'L1') return false;
  if (!OPEN_ISSUE_STATUSES.has(issue.status)) return false;
  if (canAssignIssues(user)) return true;
  return isHelpdeskAssignee(user, issue, store.people);
}

function canResolveIssue(user, issue) {
  if (!OPEN_ISSUE_STATUSES.has(issue.status)) return false;
  if (canAssignIssues(user)) return true;
  return isHelpdeskAssignee(user, issue, store.people);
}

async function notifyAssignee(issue, assigneeId, assignedBy, id) {
  if (!assigneeId) return;
  const person = store.people.find((p) => p.id === assigneeId);
  await notifyPersonInApp(assigneeId, {
    type: 'issue_assigned',
    title: `Issue assigned: ${issue.ticket_no}`,
    body: issue.title,
    link: `/helpdesk?issue=${id}`,
    entity_type: 'issue',
    entity_id: id,
  });
  const to = emailForPerson(person);
  if (to) {
    await sendIssueAssignedEmail({
      to,
      personName: person?.name,
      ticketNo: issue.ticket_no,
      title: issue.title,
      projectName: issue.project_name,
      assignedBy,
    }).catch((e) => console.warn('issue email:', e.message));
  }
}

issuesRouter.get('/', (req, res) => {
  const status = req.query.status;
  const projectId = req.query.project_id ? +req.query.project_id : null;
  const supportLevel = req.query.support_level;
  const moduleCode = req.query.module_code;
  const incidentType = req.query.incident_type;
  const mine = req.query.mine === '1' || req.query.mine === 'true';
  let list = (store.issues || []).map((i) => enrichIssue(i, req.user));
  if (status && status !== 'all') list = list.filter((i) => i.status === status);
  if (projectId) list = list.filter((i) => i.project_id === projectId);
  if (supportLevel && supportLevel !== 'all') {
    const lvl = String(supportLevel).toLowerCase();
    if (lvl === 'backlog') {
      list = list.filter((i) => i.helpdesk_stage === 'backlog');
    } else {
      const up = lvl.toUpperCase();
      list = list.filter((i) => i.helpdesk_stage === up);
    }
  }
  if (moduleCode && moduleCode !== 'all') {
    const mc = String(moduleCode).toUpperCase();
    list = list.filter((i) => (i.module_code || 'XXX') === mc);
  }
  if (incidentType && incidentType !== 'all') {
    list = list.filter((i) => i.incident_type === incidentType);
  }
  if (mine) {
    const myPerson = personIdForUser(req.user, store.people);
    list = list.filter(
      (i) => i.reporter_user_id === req.user.id
        || (myPerson && i.assignee_person_id === myPerson),
    );
  }
  list.sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
  res.json(list);
});

issuesRouter.post('/import-eticket', async (req, res) => {
  if (!canAssignIssues(req.user)) {
    return res.status(403).json({ error: 'Only PMO can import eTicket CSV' });
  }
  const csvText = req.body?.csv;
  if (!csvText || !String(csvText).trim()) {
    return res.status(400).json({ error: 'csv body field is required' });
  }
  const rows = parseCsv(String(csvText));
  let imported = 0;
  let skipped = 0;
  const errors = [];

  for (const row of rows) {
    try {
      const ticketNo = String(row.TicketID || '').trim();
      if (!ticketNo) {
        skipped += 1;
        continue;
      }
      if (store.findIssueByTicketNo(ticketNo)) {
        skipped += 1;
        continue;
      }
      const clientCode = row.Client ? String(row.Client).trim() : null;
      const clientId = clientCode ? store.findOrCreateClient(clientCode, clientCode) : null;
      const payload = mapEticketRowToIssue(row, { clientId, reporterUserId: req.user.id });
      const issueId = store.addIssue(payload);
      tryLinkIssueToBacklogByRef(store, issueId);
      imported += 1;
    } catch (e) {
      errors.push({ ticket: row.TicketID, error: e.message });
    }
  }

  store.appendAuditLog(req.user, {
    action: 'import',
    target_type: 'issue',
    target_id: null,
    summary: `Imported ${imported} eTicket rows (${skipped} skipped)`,
  });

  try { await store.persistToSupabase(); } catch (e) { console.warn('persist:', e.message); }
  res.json({ imported, skipped, errors: errors.slice(0, 20) });
});

issuesRouter.get('/:id', (req, res) => {
  const issue = store.issues.find((i) => i.id === +req.params.id);
  if (!issue) return res.status(404).json({ error: 'Issue not found' });
  res.json(enrichIssue(issue, req.user));
});

issuesRouter.post('/', async (req, res) => {
  const {
    title,
    description,
    priority,
    category,
    project_id,
    client_id,
    assignee_person_id,
    status,
    external_ticket_ref,
    incident_type,
    module_code,
    epbt_module,
    intake_channel,
    client_pic,
    action_taken,
    issue_attachment_ref,
    backlog_ref,
  } = req.body || {};
  if (!title || !String(title).trim()) return res.status(400).json({ error: 'title is required' });

  let assigneeId = assignee_person_id != null && assignee_person_id !== '' ? +assignee_person_id : null;
  if (!canAssignIssues(req.user) && assigneeId == null) {
    assigneeId = personIdForUser(req.user, store.people);
  }
  if (assigneeId != null && !canAssignIssues(req.user) && assigneeId !== personIdForUser(req.user, store.people)) {
    return res.status(403).json({ error: 'You can only assign new issues to yourself' });
  }

  const parsedIncident = parseIncidentType(incident_type) || 'issue';
  const modCode = normalizeModuleCode(module_code || epbt_module);
  const assignee = assigneeId ? store.people.find((p) => p.id === assigneeId) : null;
  const l1Label = assignee?.name ? `CTSB | ${assignee.name}` : personLabelFromUser(req.user);

  const id = store.addIssue({
    title: String(title).trim(),
    description: description != null ? String(description) : null,
    priority: ISSUE_PRIORITY_SET.has(priority) ? priority : 'medium',
    category: category && ISSUE_CATEGORY_SET.has(category) ? category : categoryForIncidentType(parsedIncident),
    incident_type: parsedIncident,
    module_code: modCode,
    epbt_module: epbt_module || moduleLabelForCode(modCode),
    intake_channel: parseIntakeChannel(intake_channel),
    client_pic: client_pic != null ? String(client_pic).trim() || null : null,
    action_taken: action_taken != null ? String(action_taken) : null,
    issue_attachment_ref: issue_attachment_ref != null ? String(issue_attachment_ref).trim() || null : null,
    backlog_ref: backlog_ref != null ? String(backlog_ref).trim() || null : null,
    l1_assignee_label: l1Label,
    status: ISSUE_STATUS_SET.has(status) ? status : 'open',
    project_id: project_id != null && project_id !== '' ? +project_id : null,
    client_id: client_id != null && client_id !== '' ? +client_id : null,
    assignee_person_id: assigneeId,
    reporter_user_id: req.user.id,
    external_ticket_ref: external_ticket_ref != null ? String(external_ticket_ref).trim() : null,
    support_level: 'L1',
  });
  const issue = enrichIssue(store.issues.find((i) => i.id === id), req.user);
  store.appendAuditLog(req.user, {
    action: 'create',
    target_type: 'issue',
    target_id: id,
    summary: `Created issue ${issue.ticket_no} (${issue.support_level})`,
  });

  if (issue.assignee_person_id) {
    await notifyAssignee(issue, issue.assignee_person_id, req.user.name, id);
  }

  tryLinkIssueToBacklogByRef(store, id);

  try { await store.persistToSupabase(); } catch (e) { console.warn('persist:', e.message); }
  res.status(201).json(enrichIssue(store.issues.find((i) => i.id === id), req.user));
});

issuesRouter.put('/:id', async (req, res) => {
  const id = +req.params.id;
  const existing = store.issues.find((i) => i.id === id);
  if (!existing) return res.status(404).json({ error: 'Issue not found' });

  const patch = {};
  if (req.body.title !== undefined) patch.title = String(req.body.title).trim();
  if (req.body.description !== undefined) patch.description = req.body.description != null ? String(req.body.description) : null;
  if (req.body.status !== undefined) {
    if (!ISSUE_STATUS_SET.has(req.body.status)) return res.status(400).json({ error: 'Invalid status' });
    patch.status = req.body.status;
  }
  if (req.body.priority !== undefined) {
    if (!ISSUE_PRIORITY_SET.has(req.body.priority)) return res.status(400).json({ error: 'Invalid priority' });
    patch.priority = req.body.priority;
  }
  if (req.body.category !== undefined) {
    if (!ISSUE_CATEGORY_SET.has(req.body.category)) return res.status(400).json({ error: 'Invalid category' });
    patch.category = req.body.category;
  }
  if (req.body.external_ticket_ref !== undefined) {
    patch.external_ticket_ref = req.body.external_ticket_ref != null ? String(req.body.external_ticket_ref).trim() || null : null;
  }
  if (req.body.incident_type !== undefined) {
    const it = parseIncidentType(req.body.incident_type);
    if (!it || !ISSUE_INCIDENT_TYPE_SET.has(it)) return res.status(400).json({ error: 'Invalid incident type' });
    patch.incident_type = it;
    patch.category = categoryForIncidentType(it);
  }
  if (req.body.module_code !== undefined || req.body.epbt_module !== undefined) {
    if (!canAssignIssues(req.user)) return res.status(403).json({ error: 'Only PMO can change module' });
    const mc = normalizeModuleCode(req.body.module_code || req.body.epbt_module);
    patch.module_code = mc;
    if (req.body.epbt_module !== undefined) patch.epbt_module = req.body.epbt_module != null ? String(req.body.epbt_module).trim() : null;
    else patch.epbt_module = moduleLabelForCode(mc);
  }
  if (req.body.intake_channel !== undefined) {
    patch.intake_channel = parseIntakeChannel(req.body.intake_channel);
  }
  if (req.body.client_pic !== undefined) {
    patch.client_pic = req.body.client_pic != null ? String(req.body.client_pic).trim() || null : null;
  }
  if (req.body.action_taken !== undefined) {
    patch.action_taken = req.body.action_taken != null ? String(req.body.action_taken) : null;
  }
  if (req.body.backlog_ref !== undefined) {
    if (!canAssignIssues(req.user)) return res.status(403).json({ error: 'Only PMO can set backlog ref' });
    patch.backlog_ref = req.body.backlog_ref != null ? String(req.body.backlog_ref).trim() || null : null;
  }
  if (req.body.issue_attachment_ref !== undefined) {
    patch.issue_attachment_ref = req.body.issue_attachment_ref != null ? String(req.body.issue_attachment_ref).trim() || null : null;
  }
  if (req.body.resolution_attachment_ref !== undefined) {
    patch.resolution_attachment_ref = req.body.resolution_attachment_ref != null ? String(req.body.resolution_attachment_ref).trim() || null : null;
  }
  if (req.body.project_id !== undefined) {
    if (!canAssignIssues(req.user)) {
      return res.status(403).json({ error: 'Only PMO can change project link' });
    }
    patch.project_id = req.body.project_id != null && req.body.project_id !== '' ? +req.body.project_id : null;
  }
  if (req.body.client_id !== undefined) {
    if (!canAssignIssues(req.user)) {
      return res.status(403).json({ error: 'Only PMO can change client link' });
    }
    patch.client_id = req.body.client_id != null && req.body.client_id !== '' ? +req.body.client_id : null;
  }
  if (req.body.assignee_person_id !== undefined) {
    if (!canAssignIssues(req.user)) {
      return res.status(403).json({ error: 'Use Escalate to pass the ticket to another level' });
    }
    patch.assignee_person_id = req.body.assignee_person_id != null && req.body.assignee_person_id !== ''
      ? +req.body.assignee_person_id
      : null;
  }
  if (req.body.support_level !== undefined) {
    if (!canAssignIssues(req.user)) {
      return res.status(403).json({ error: 'Use Escalate to change support level' });
    }
    const lvl = String(req.body.support_level).toUpperCase();
    if (!ISSUE_SUPPORT_LEVEL_SET.has(lvl)) return res.status(400).json({ error: 'Invalid support level' });
    patch.support_level = lvl;
  }

  const prevAssignee = existing.assignee_person_id;
  store.updateIssue(id, patch);

  if (patch.backlog_ref !== undefined || patch.external_ticket_ref !== undefined) {
    tryLinkIssueToBacklogByRef(store, id);
  }

  const issue = enrichIssue(store.issues.find((i) => i.id === id), req.user);

  if (patch.assignee_person_id != null && patch.assignee_person_id !== prevAssignee) {
    await notifyAssignee(issue, patch.assignee_person_id, req.user.name, id);
  }

  if (patch.status && patch.status !== existing.status && issue.assignee_person_id) {
    await notifyPersonInApp(issue.assignee_person_id, {
      type: 'issue_status',
      title: `${issue.ticket_no} → ${patch.status.replace(/_/g, ' ')}`,
      body: issue.title,
      link: `/helpdesk?issue=${id}`,
      entity_type: 'issue',
      entity_id: id,
    });
  }

  store.appendAuditLog(req.user, {
    action: 'update',
    target_type: 'issue',
    target_id: id,
    summary: `Updated issue ${issue.ticket_no}`,
  });

  try { await store.persistToSupabase(); } catch (e) { console.warn('persist:', e.message); }
  res.json(issue);
});

issuesRouter.post('/:id/escalate', async (req, res) => {
  const id = +req.params.id;
  const existing = store.issues.find((i) => i.id === id);
  if (!existing) return res.status(404).json({ error: 'Issue not found' });
  if (!canEscalateIssue(req.user, existing)) {
    return res.status(403).json({ error: 'You cannot escalate this issue' });
  }

  const nextLevel = nextSupportLevel(existing.support_level);
  if (!nextLevel) {
    return res.status(400).json({ error: 'Already at 2nd level — promote to backlog for dev/data work' });
  }

  const assigneeId = req.body?.assignee_person_id != null && req.body.assignee_person_id !== ''
    ? +req.body.assignee_person_id
    : null;
  if (!assigneeId || !store.people.some((p) => p.id === assigneeId)) {
    return res.status(400).json({ error: 'assignee_person_id is required when escalating' });
  }

  const note = req.body?.note != null ? String(req.body.note).trim() : '';
  const prevLevel = normalizeSupportLevel(existing.support_level);
  const assigneePerson = store.people.find((p) => p.id === assigneeId);
  const assigneeLabel = assigneePerson?.name ? `CTSB | ${assigneePerson.name}` : null;
  const descriptionAppend = note
    ? `\n\n[Escalated ${prevLevel} → ${nextLevel} by ${req.user.name}: ${note}]`
    : `\n\n[Escalated ${prevLevel} → ${nextLevel} by ${req.user.name}]`;

  const escalatePatch = {
    support_level: nextLevel,
    assignee_person_id: assigneeId,
    status: 'open',
    description: existing.description ? `${existing.description}${descriptionAppend}` : descriptionAppend.trim(),
    resolution_method: null,
    resolution_notes: null,
  };
  if (nextLevel === 'L2') escalatePatch.l2_assignee_label = assigneeLabel;

  store.updateIssue(id, escalatePatch);

  const issue = enrichIssue(store.issues.find((i) => i.id === id), req.user);
  await notifyAssignee(issue, assigneeId, req.user.name, id);

  store.appendAuditLog(req.user, {
    action: 'escalate',
    target_type: 'issue',
    target_id: id,
    summary: `Escalated ${issue.ticket_no} from ${prevLevel} to ${nextLevel}`,
  });

  try { await store.persistToSupabase(); } catch (e) { console.warn('persist:', e.message); }
  res.json(issue);
});

issuesRouter.post('/:id/resolve', async (req, res) => {
  const id = +req.params.id;
  const existing = store.issues.find((i) => i.id === id);
  if (!existing) return res.status(404).json({ error: 'Issue not found' });
  if (!canResolveIssue(req.user, existing)) {
    return res.status(403).json({ error: 'You cannot resolve this issue' });
  }

  const method = parseResolutionMethod(req.body?.resolution_method);
  if (!method) {
    return res.status(400).json({ error: 'resolution_method is required (whatsapp, call, email, onsite, other)' });
  }

  const notes = req.body?.resolution_notes != null ? String(req.body.resolution_notes).trim() : '';
  const actionTaken = req.body?.action_taken != null ? String(req.body.action_taken).trim() : '';
  const level = normalizeSupportLevel(existing.support_level);

  store.updateIssue(id, {
    status: 'resolved',
    resolution_method: method,
    resolution_notes: notes || null,
    action_taken: actionTaken || existing.action_taken || notes || null,
    resolution_attachment_ref: req.body?.resolution_attachment_ref != null
      ? String(req.body.resolution_attachment_ref).trim() || null
      : existing.resolution_attachment_ref,
  });

  const issue = enrichIssue(store.issues.find((i) => i.id === id), req.user);
  store.appendAuditLog(req.user, {
    action: 'resolve',
    target_type: 'issue',
    target_id: id,
    summary: `Resolved ${issue.ticket_no} at ${level} via ${method}`,
  });

  try { await store.persistToSupabase(); } catch (e) { console.warn('persist:', e.message); }
  res.json(issue);
});

issuesRouter.post('/:id/promote-backlog', async (req, res) => {
  const id = +req.params.id;
  const issue = store.issues.find((i) => i.id === id);
  if (!issue) return res.status(404).json({ error: 'Issue not found' });

  if (!canUserPromoteIssueToBacklog(req.user, issue, store.people)) {
    return res.status(403).json({ error: 'You do not have permission to promote this issue to backlog' });
  }

  if (!isIssueEligibleForBacklogPromote(issue)) {
    return res.status(400).json({
      error: 'Only open helpdesk issues can be promoted to product backlog.',
    });
  }

  const projectId = req.body?.project_id != null && req.body.project_id !== ''
    ? +req.body.project_id
    : issue.project_id;
  if (!projectId) {
    return res.status(400).json({ error: 'project_id is required — link this issue to a project first' });
  }

  const assigneeId = req.body?.assignee_person_id != null && req.body.assignee_person_id !== ''
    ? +req.body.assignee_person_id
    : null;
  if (!assigneeId) {
    return res.status(400).json({ error: 'assignee_person_id is required when promoting to backlog' });
  }

  const prevIssueAssignee = issue.assignee_person_id;

  let result;
  try {
    result = promoteIssueToBacklog(store, id, projectId, {
      createdByUserId: req.user.id,
      assigneePersonId: assigneeId,
    });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  const { backlog, created, linked } = result;
  const level = normalizeSupportLevel(issue.support_level);

  if (created && backlog?.id && !backlog.created_by_user_id) {
    store.updateBacklog(backlog.id, { created_by_user_id: req.user.id });
  }
  const freshBacklog = store.backlogs.find((b) => b.id === backlog?.id) || backlog;

  if (issue.id && freshBacklog?.id) {
    copyAttachments(store, 'issue', issue.id, 'backlog', freshBacklog.id);
  }

  store.appendAuditLog(req.user, {
    action: created ? 'promote' : 'link',
    target_type: 'issue',
    target_id: id,
    summary: created
      ? `Promoted ${level} issue ${issue.ticket_no} to backlog ${freshBacklog.ref_no}`
      : `Linked ${level} issue ${issue.ticket_no} to backlog ${freshBacklog.ref_no}`,
  });

  if (created && freshBacklog?.assignee_person_id) {
    await notifyBacklogAssigned(store, freshBacklog, { actorUser: req.user, isNew: true });
  } else if (!created && freshBacklog?.assignee_person_id) {
    await notifyBacklogAssigned(store, freshBacklog, { actorUser: req.user, isNew: false });
  }

  const updatedIssue = store.issues.find((i) => i.id === id);
  if (updatedIssue?.assignee_person_id && updatedIssue.assignee_person_id !== prevIssueAssignee) {
    await notifyAssignee(updatedIssue, updatedIssue.assignee_person_id, req.user.name, id);
  }

  try { await store.persistToSupabase(); } catch (e) { console.warn('persist:', e.message); }
  res.status(created ? 201 : 200).json({
    issue: enrichIssue(store.issues.find((i) => i.id === id), req.user),
    backlog: {
      ...freshBacklog,
      project_name: store.projects.find((p) => p.id === freshBacklog.project_id)?.name,
    },
    linked,
    created,
  });
});
