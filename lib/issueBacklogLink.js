import { normalizeModuleCode } from './epbtModules.js';
import {
  issueCategoryToBacklogType,
} from './backlogConstants.js';
import { helpdeskStageForIssue } from './issueWorkflow.js';

export function normalizeBacklogRef(ref) {
  if (ref == null || ref === '') return null;
  const v = String(ref).trim().toUpperCase();
  return v || null;
}

export function cleanExternalTicketRef(value) {
  if (value == null || value === '') return null;
  let v = String(value).trim();
  if (!v) return null;
  v = v.replace(/^Ticket\s*#?\s*/i, '').trim();
  return v || null;
}

/** Next legacy-style backlog ref: ABB-1352, CK-0165 */
export function nextModuleBacklogRef(backlogs = [], moduleCode = 'XXX') {
  const code = normalizeModuleCode(moduleCode);
  const prefix = `${code}-`;
  const nums = (backlogs || [])
    .filter((b) => b.ref_no && String(b.ref_no).toUpperCase().startsWith(prefix))
    .map((b) => parseInt(String(b.ref_no).slice(prefix.length), 10))
    .filter((n) => Number.isFinite(n));
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `${code}-${next}`;
}

export function resolveBacklogRefForIssue(issue, backlogs = []) {
  const fromIssue = normalizeBacklogRef(issue?.backlog_ref);
  if (fromIssue) return fromIssue;
  return nextModuleBacklogRef(backlogs, issue?.module_code);
}

export function buildBacklogPayloadFromIssue(issue, projectId) {
  const stage = helpdeskStageForIssue(issue);
  const stageLabel = stage.code === 'backlog' ? 'Backlog' : stage.label;
  const refLine = issue.external_ticket_ref
    ? `Client ref: ${issue.external_ticket_ref}\n`
    : '';
  return {
    project_id: projectId,
    title: issue.title,
    description: issue.description
      ? `${refLine}${issue.description}\n\n[From helpdesk ${issue.ticket_no} · ${stageLabel}]`
      : `${refLine}[From helpdesk ${issue.ticket_no} · ${stageLabel}]`,
    item_type: issueCategoryToBacklogType(issue.category),
    source: 'helpdesk',
    status: 'open',
    priority: issue.priority,
    issue_id: issue.id,
    assignee_person_id: issue.assignee_person_id,
    module_code: issue.module_code || null,
    client_id: issue.client_id || null,
    external_ticket_ref: issue.external_ticket_ref || null,
  };
}

export async function syncIssueBacklogLink(store, issueId, backlogId, { projectId = null } = {}) {
  const issues = await store.listIssues();
  const backlogs = await store.listBacklogs();
  const issue = issues.find((i) => i.id === +issueId);
  const backlog = (backlogs || []).find((b) => b.id === +backlogId);
  if (!issue || !backlog) return { linked: false };

  const issuePatch = { backlog_ref: backlog.ref_no };
  const resolvedProject = projectId || backlog.project_id || issue.project_id;
  if (resolvedProject && !issue.project_id) issuePatch.project_id = resolvedProject;

  const backlogPatch = { issue_id: issue.id };
  if (!backlog.client_id && issue.client_id) backlogPatch.client_id = issue.client_id;
  if (!backlog.module_code && issue.module_code) backlogPatch.module_code = issue.module_code;
  if (!backlog.external_ticket_ref && issue.external_ticket_ref) {
    backlogPatch.external_ticket_ref = issue.external_ticket_ref;
  }
  if (resolvedProject && !backlog.project_id) backlogPatch.project_id = resolvedProject;

  await store.updateIssue(issue.id, issuePatch);
  await store.updateBacklog(backlog.id, backlogPatch);
  const freshBacklogs = await store.listBacklogs();
  return {
    linked: true,
    issueId: issue.id,
    backlogId: backlog.id,
    backlog: freshBacklogs.find((b) => b.id === backlog.id),
  };
}

export async function tryLinkIssueToBacklogByRef(store, issueId) {
  const issues = await store.listIssues();
  const issue = issues.find((i) => i.id === +issueId);
  if (!issue) return null;

  const byIssue = await store.findBacklogByIssueId(issue.id);
  if (byIssue) {
    if (issue.backlog_ref !== byIssue.ref_no) {
      await store.updateIssue(issue.id, { backlog_ref: byIssue.ref_no });
    }
    return byIssue;
  }

  if (issue.backlog_ref) {
    const backlog = await store.findBacklogByRefNo(issue.backlog_ref);
    if (backlog) {
      await syncIssueBacklogLink(store, issue.id, backlog.id);
      const backlogs = await store.listBacklogs();
      return backlogs.find((b) => b.id === backlog.id);
    }
  }

  if (issue.external_ticket_ref) {
    const backlog = await store.findBacklogByExternalTicketRef(issue.external_ticket_ref);
    if (backlog && !backlog.issue_id) {
      await syncIssueBacklogLink(store, issue.id, backlog.id);
      const backlogs = await store.listBacklogs();
      return backlogs.find((b) => b.id === backlog.id);
    }
  }

  return null;
}

export async function tryLinkBacklogToIssueByRef(store, backlogId) {
  const backlogs = await store.listBacklogs();
  const backlog = (backlogs || []).find((b) => b.id === +backlogId);
  if (!backlog) return null;
  if (backlog.issue_id) {
    const issues = await store.listIssues();
    return issues.find((i) => i.id === backlog.issue_id) || null;
  }

  if (backlog.external_ticket_ref) {
    const issue = await store.findIssueByExternalTicketRef(backlog.external_ticket_ref);
    if (issue) {
      await syncIssueBacklogLink(store, issue.id, backlog.id);
      const issues = await store.listIssues();
      return issues.find((i) => i.id === issue.id);
    }
  }

  const issues = await store.listIssues();
  const issueByRef = (issues || []).find(
    (i) => normalizeBacklogRef(i.backlog_ref) === normalizeBacklogRef(backlog.ref_no),
  );
  if (issueByRef) {
    await syncIssueBacklogLink(store, issueByRef.id, backlog.id);
    const freshIssues = await store.listIssues();
    return freshIssues.find((i) => i.id === issueByRef.id);
  }

  return null;
}

/**
 * Link helpdesk issue to backlog — reuse existing row when PBLID/BUGID or No Tiket matches.
 */
export async function promoteIssueToBacklog(store, issueId, projectId, { createdByUserId = null, assigneePersonId = null } = {}) {
  const issues = await store.listIssues();
  const issue = issues.find((i) => i.id === +issueId);
  if (!issue) throw new Error('Issue not found');

  const assigneeId = assigneePersonId != null && assigneePersonId !== '' ? +assigneePersonId : null;
  if (!assigneeId) throw new Error('assignee_person_id is required when promoting to backlog');

  const applyAssignee = async (backlogId, issuePatch = {}, backlogPatch = {}) => {
    await store.updateBacklog(backlogId, { assignee_person_id: assigneeId, ...backlogPatch });
    await store.updateIssue(issue.id, { assignee_person_id: assigneeId, ...issuePatch });
  };

  const existing = await store.findBacklogByIssueId(issue.id);
  if (existing) {
    await applyAssignee(existing.id);
    const freshBacklogs = await store.listBacklogs();
    return { backlog: freshBacklogs.find((b) => b.id === existing.id), created: false, linked: true };
  }

  const linked = await tryLinkIssueToBacklogByRef(store, issue.id);
  if (linked) {
    const issuePatch = { status: 'in_progress' };
    const backlogPatch = {};
    if (projectId && linked.project_id !== projectId) {
      backlogPatch.project_id = projectId;
      issuePatch.project_id = projectId;
    }
    await applyAssignee(linked.id, issuePatch, backlogPatch);
    const freshBacklogs = await store.listBacklogs();
    return {
      backlog: freshBacklogs.find((b) => b.id === linked.id),
      created: false,
      linked: true,
    };
  }

  const allBacklogs = await store.listBacklogs();
  const refNo = resolveBacklogRefForIssue(issue, allBacklogs);
  const existingByRef = await store.findBacklogByRefNo(refNo);
  if (existingByRef) {
    await syncIssueBacklogLink(store, issue.id, existingByRef.id, { projectId });
    await applyAssignee(existingByRef.id, { status: 'in_progress' });
    const freshBacklogs = await store.listBacklogs();
    return {
      backlog: freshBacklogs.find((b) => b.id === existingByRef.id),
      created: false,
      linked: true,
    };
  }

  const payload = buildBacklogPayloadFromIssue(issue, projectId);
  payload.ref_no = refNo;
  payload.assignee_person_id = assigneeId;
  if (createdByUserId != null) payload.created_by_user_id = +createdByUserId;
  const backlogId = await store.addBacklog(payload);
  await store.updateIssue(issue.id, {
    backlog_ref: refNo,
    project_id: projectId,
    status: 'in_progress',
    assignee_person_id: assigneeId,
  });
  const freshBacklogs = await store.listBacklogs();
  return {
    backlog: freshBacklogs.find((b) => b.id === backlogId),
    created: true,
    linked: true,
  };
}
