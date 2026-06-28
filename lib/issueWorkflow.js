import {
  ISSUE_SUPPORT_LEVEL_SET,
  ISSUE_RESOLUTION_METHOD_SET,
} from './issueConstants.js';

export const OPEN_ISSUE_STATUSES = new Set(['open', 'in_progress', 'waiting_agency']);

export function normalizeSupportLevel(value) {
  const v = String(value || 'L1').toUpperCase();
  return ISSUE_SUPPORT_LEVEL_SET.has(v) ? v : 'L1';
}

export function nextSupportLevel(level) {
  const l = normalizeSupportLevel(level);
  if (l === 'L1') return 'L2';
  return null;
}

export function supportLevelLabel(level) {
  const l = normalizeSupportLevel(level);
  if (l === 'L1') return '1st level';
  if (l === 'L2') return '2nd level';
  if (l === 'L3') return 'Backlog';
  return '1st level';
}

/** True when ticket is in the backlog stage (linked backlog or legacy L3). */
export function isIssueInBacklogStage(issue, backlog = null) {
  if (!issue) return false;
  if (backlog) return true;
  if (issue.backlog_id || issue.backlog_ref) return true;
  return normalizeSupportLevel(issue.support_level) === 'L3';
}

/** Helpdesk stage shown in UI: L1, L2, or backlog (never "L3"). */
export function helpdeskStageForIssue(issue, backlog = null) {
  if (isIssueInBacklogStage(issue, backlog)) {
    return { code: 'backlog', label: 'Backlog', shortLabel: 'Backlog' };
  }
  const l = normalizeSupportLevel(issue.support_level);
  return {
    code: l,
    label: supportLevelLabel(l),
    shortLabel: l,
  };
}

/** Open helpdesk ticket that may be linked to product backlog (any support level). */
export function isIssueEligibleForBacklogPromote(issue) {
  if (!issue) return false;
  return OPEN_ISSUE_STATUSES.has(issue.status);
}

/** @deprecated use isIssueEligibleForBacklogPromote */
export function canPromoteIssueToBacklog(issue) {
  return isIssueEligibleForBacklogPromote(issue);
}

export function parseResolutionMethod(value) {
  if (value == null || value === '') return null;
  const v = String(value).toLowerCase();
  return ISSUE_RESOLUTION_METHOD_SET.has(v) ? v : null;
}
