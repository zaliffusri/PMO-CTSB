import { ISSUE_STATUSES } from '../../lib/issueConstants.js';

export function statusLabel(id) {
  return ISSUE_STATUSES.find((s) => s.id === id)?.label || id;
}

export function helpdeskStageShortLabel(issue) {
  return issue.helpdesk_stage_label
    || (issue.helpdesk_stage === 'backlog' ? 'Backlog' : (issue.helpdesk_stage || issue.support_level || 'L1'));
}
