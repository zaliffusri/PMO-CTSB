import { describe, it, expect } from 'vitest';
import {
  isIssueEligibleForBacklogPromote,
  nextSupportLevel,
  helpdeskStageForIssue,
  supportLevelLabel,
} from '../lib/issueWorkflow.js';
import { canUserPromoteIssueToBacklog } from '../lib/permissions.js';

describe('issueWorkflow support levels', () => {
  it('escalates only from L1 to L2', () => {
    expect(nextSupportLevel('L1')).toBe('L2');
    expect(nextSupportLevel('L2')).toBeNull();
    expect(nextSupportLevel('L3')).toBeNull();
  });

  it('labels legacy L3 as Backlog', () => {
    expect(supportLevelLabel('L3')).toBe('Backlog');
  });

  it('maps backlog-linked issues to backlog stage', () => {
    expect(helpdeskStageForIssue({ support_level: 'L2', backlog_ref: 'ABB-1' }).code).toBe('backlog');
    expect(helpdeskStageForIssue({ support_level: 'L3' }).label).toBe('Backlog');
    expect(helpdeskStageForIssue({ support_level: 'L1' }).code).toBe('L1');
  });
});

describe('issueWorkflow backlog eligibility', () => {
  it('allows open issues at any support level', () => {
    expect(isIssueEligibleForBacklogPromote({ status: 'open', support_level: 'L1' })).toBe(true);
    expect(isIssueEligibleForBacklogPromote({ status: 'in_progress', support_level: 'L2' })).toBe(true);
    expect(isIssueEligibleForBacklogPromote({ status: 'waiting_agency', support_level: 'L3' })).toBe(true);
  });

  it('rejects resolved or closed issues', () => {
    expect(isIssueEligibleForBacklogPromote({ status: 'resolved', support_level: 'L1' })).toBe(false);
    expect(isIssueEligibleForBacklogPromote({ status: 'closed', support_level: 'L3' })).toBe(false);
  });
});

describe('canUserPromoteIssueToBacklog', () => {
  const people = [{ id: 1, email: 'dev@company.com', name: 'Dev User', user_id: 2 }];
  const issue = { status: 'open', support_level: 'L1', reporter_user_id: 99 };

  it('allows PMO and rostered team members', () => {
    expect(canUserPromoteIssueToBacklog({ id: 1, role: 'pmo' }, issue, people)).toBe(true);
    expect(canUserPromoteIssueToBacklog({ id: 2, role: 'user', email: 'dev@company.com' }, issue, people)).toBe(true);
  });

  it('allows the user who logged the ticket', () => {
    expect(canUserPromoteIssueToBacklog({ id: 99, role: 'user' }, issue, people)).toBe(true);
  });

  it('denies users outside the team roster who did not log the ticket', () => {
    expect(canUserPromoteIssueToBacklog({ id: 50, role: 'user', email: 'outsider@x.com' }, issue, people)).toBe(false);
  });
});
