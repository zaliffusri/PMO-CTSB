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

export function syncIssueBacklogLink(store, issueId, backlogId, { projectId = null } = {}) {
  const issue = store.issues.find((i) => i.id === +issueId);
  const backlog = (store.backlogs || []).find((b) => b.id === +backlogId);
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

  store.updateIssue(issue.id, issuePatch);
  store.updateBacklog(backlog.id, backlogPatch);
  return {
    linked: true,
    issueId: issue.id,
    backlogId: backlog.id,
    backlog: store.backlogs.find((b) => b.id === backlog.id),
  };
}

export function tryLinkIssueToBacklogByRef(store, issueId) {
  const issue = store.issues.find((i) => i.id === +issueId);
  if (!issue) return null;

  const byIssue = store.findBacklogByIssueId(issue.id);
  if (byIssue) {
    if (issue.backlog_ref !== byIssue.ref_no) {
      store.updateIssue(issue.id, { backlog_ref: byIssue.ref_no });
    }
    return byIssue;
  }

  if (issue.backlog_ref) {
    const backlog = store.findBacklogByRefNo(issue.backlog_ref);
    if (backlog) {
      syncIssueBacklogLink(store, issue.id, backlog.id);
      return store.backlogs.find((b) => b.id === backlog.id);
    }
  }

  if (issue.external_ticket_ref) {
    const backlog = store.findBacklogByExternalTicketRef(issue.external_ticket_ref);
    if (backlog && !backlog.issue_id) {
      syncIssueBacklogLink(store, issue.id, backlog.id);
      return store.backlogs.find((b) => b.id === backlog.id);
    }
  }

  return null;
}

export function tryLinkBacklogToIssueByRef(store, backlogId) {
  const backlog = (store.backlogs || []).find((b) => b.id === +backlogId);
  if (!backlog) return null;
  if (backlog.issue_id) {
    return store.issues.find((i) => i.id === backlog.issue_id) || null;
  }

  if (backlog.external_ticket_ref) {
    const issue = store.findIssueByExternalTicketRef(backlog.external_ticket_ref);
    if (issue) {
      syncIssueBacklogLink(store, issue.id, backlog.id);
      return store.issues.find((i) => i.id === issue.id);
    }
  }

  const issueByRef = (store.issues || []).find(
    (i) => normalizeBacklogRef(i.backlog_ref) === normalizeBacklogRef(backlog.ref_no),
  );
  if (issueByRef) {
    syncIssueBacklogLink(store, issueByRef.id, backlog.id);
    return store.issues.find((i) => i.id === issueByRef.id);
  }

  return null;
}

/**
 * Link helpdesk issue to backlog — reuse existing row when PBLID/BUGID or No Tiket matches.
 */
export function promoteIssueToBacklog(store, issueId, projectId, { createdByUserId = null, assigneePersonId = null } = {}) {
  const issue = store.issues.find((i) => i.id === +issueId);
  if (!issue) throw new Error('Issue not found');

  const assigneeId = assigneePersonId != null && assigneePersonId !== '' ? +assigneePersonId : null;
  if (!assigneeId) throw new Error('assignee_person_id is required when promoting to backlog');

  const applyAssignee = (backlogId, issuePatch = {}, backlogPatch = {}) => {
    store.updateBacklog(backlogId, { assignee_person_id: assigneeId, ...backlogPatch });
    store.updateIssue(issue.id, { assignee_person_id: assigneeId, ...issuePatch });
  };

  const existing = store.findBacklogByIssueId(issue.id);
  if (existing) {
    applyAssignee(existing.id);
    return { backlog: store.backlogs.find((b) => b.id === existing.id), created: false, linked: true };
  }

  const linked = tryLinkIssueToBacklogByRef(store, issue.id);
  if (linked) {
    const issuePatch = { status: 'in_progress' };
    const backlogPatch = {};
    if (projectId && linked.project_id !== projectId) {
      backlogPatch.project_id = projectId;
      issuePatch.project_id = projectId;
    }
    applyAssignee(linked.id, issuePatch, backlogPatch);
    return {
      backlog: store.backlogs.find((b) => b.id === linked.id),
      created: false,
      linked: true,
    };
  }

  const refNo = resolveBacklogRefForIssue(issue, store.backlogs);
  const existingByRef = store.findBacklogByRefNo(refNo);
  if (existingByRef) {
    syncIssueBacklogLink(store, issue.id, existingByRef.id, { projectId });
    applyAssignee(existingByRef.id, { status: 'in_progress' });
    return {
      backlog: store.backlogs.find((b) => b.id === existingByRef.id),
      created: false,
      linked: true,
    };
  }

  const payload = buildBacklogPayloadFromIssue(issue, projectId);
  payload.ref_no = refNo;
  payload.assignee_person_id = assigneeId;
  if (createdByUserId != null) payload.created_by_user_id = +createdByUserId;
  const backlogId = store.addBacklog(payload);
  store.updateIssue(issue.id, {
    backlog_ref: refNo,
    project_id: projectId,
    status: 'in_progress',
    assignee_person_id: assigneeId,
  });
  return {
    backlog: store.backlogs.find((b) => b.id === backlogId),
    created: true,
    linked: true,
  };
}
