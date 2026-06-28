import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeBacklogRef,
  cleanExternalTicketRef,
  nextModuleBacklogRef,
  syncIssueBacklogLink,
  tryLinkIssueToBacklogByRef,
  promoteIssueToBacklog,
} from '../lib/issueBacklogLink.js';

function makeStore() {
  const data = {
    issues: [],
    backlogs: [],
    projects: [{ id: 1, name: 'EPBT3.0' }],
    clients: [{ id: 10, name: 'MBIP', short_code: 'MBIP' }],
    people: [],
  };
  let nextIssueId = 1;
  let nextBacklogId = 1;
  return {
    issues: data.issues,
    backlogs: data.backlogs,
    projects: data.projects,
    clients: data.clients,
    people: data.people,
    findBacklogByIssueId(issueId) {
      return data.backlogs.find((b) => b.issue_id === +issueId) || null;
    },
    findBacklogByRefNo(ref) {
      const q = normalizeBacklogRef(ref);
      return data.backlogs.find((b) => normalizeBacklogRef(b.ref_no) === q) || null;
    },
    findBacklogByExternalTicketRef(ref) {
      const q = cleanExternalTicketRef(ref);
      if (!q) return null;
      const qu = q.toUpperCase();
      return data.backlogs.find((b) => {
        const br = cleanExternalTicketRef(b.external_ticket_ref);
        return br && br.toUpperCase() === qu;
      }) || null;
    },
    findIssueByExternalTicketRef(ref) {
      const q = cleanExternalTicketRef(ref);
      if (!q) return null;
      const qu = q.toUpperCase();
      return data.issues.find((i) => {
        const ir = cleanExternalTicketRef(i.external_ticket_ref);
        return ir && ir.toUpperCase() === qu;
      }) || null;
    },
    addIssue(row) {
      const issue = { id: nextIssueId++, status: 'open', support_level: 'L1', ...row };
      data.issues.push(issue);
      return issue.id;
    },
    addBacklog(row) {
      const item = { id: nextBacklogId++, ...row };
      data.backlogs.push(item);
      return item.id;
    },
    updateIssue(id, patch) {
      const i = data.issues.findIndex((x) => x.id === +id);
      if (i >= 0) data.issues[i] = { ...data.issues[i], ...patch };
    },
    updateBacklog(id, patch) {
      const i = data.backlogs.findIndex((x) => x.id === +id);
      if (i >= 0) data.backlogs[i] = { ...data.backlogs[i], ...patch };
    },
  };
}

describe('issueBacklogLink', () => {
  it('normalizes backlog refs', () => {
    expect(normalizeBacklogRef('abb-1351')).toBe('ABB-1351');
    expect(cleanExternalTicketRef('Ticket #13203')).toBe('13203');
  });

  it('generates module backlog refs', () => {
    const backlogs = [{ ref_no: 'ABB-1350' }, { ref_no: 'ABB-1351' }];
    expect(nextModuleBacklogRef(backlogs, 'ABB')).toBe('ABB-1352');
  });

  let store;
  const assigneeId = 42;
  beforeEach(() => {
    store = makeStore();
    store.people.push({ id: assigneeId, name: 'Dev Staff' });
  });

  it('links issue to backlog by PBLID/BUGID', () => {
    store.addBacklog({ ref_no: 'CK-1352', project_id: 1, title: 'Bug fix' });
    const issueId = store.addIssue({
      ticket_no: 'eT-CK-0164',
      title: 'Login issue',
      backlog_ref: 'CK-1352',
      category: 'defect',
    });
    const linked = tryLinkIssueToBacklogByRef(store, issueId);
    expect(linked.ref_no).toBe('CK-1352');
    expect(store.issues[0].backlog_ref).toBe('CK-1352');
    expect(store.backlogs[0].issue_id).toBe(issueId);
  });

  it('links by external ticket ref (No Tiket)', () => {
    store.addBacklog({
      ref_no: 'ABB-1199',
      project_id: 1,
      title: 'Print issue',
      external_ticket_ref: '0680',
    });
    const issueId = store.addIssue({
      ticket_no: 'eT-ABB-0001',
      title: 'Cetakan',
      external_ticket_ref: '0680',
      category: 'defect',
    });
    tryLinkIssueToBacklogByRef(store, issueId);
    expect(store.backlogs[0].issue_id).toBe(issueId);
  });

  it('promote reuses existing backlog instead of duplicate', () => {
    store.addBacklog({ ref_no: 'PN-1331', project_id: 1, title: 'CR export' });
    const issueId = store.addIssue({
      ticket_no: 'eT-PN-0146',
      title: 'Export Excel',
      backlog_ref: 'PN-1331',
      module_code: 'PN',
      category: 'change_request',
      project_id: 1,
    });
    const result = promoteIssueToBacklog(store, issueId, 1, { assigneePersonId: assigneeId });
    expect(result.created).toBe(false);
    expect(result.linked).toBe(true);
    expect(store.backlogs).toHaveLength(1);
    expect(store.backlogs[0].issue_id).toBe(issueId);
    expect(store.backlogs[0].assignee_person_id).toBe(assigneeId);
  });

  it('promote creates new backlog with module ref when none exists', () => {
    const issueId = store.addIssue({
      ticket_no: 'eT-ABB-0002',
      title: 'New defect',
      module_code: 'ABB',
      category: 'defect',
      project_id: 1,
    });
    const result = promoteIssueToBacklog(store, issueId, 1, { assigneePersonId: assigneeId });
    expect(result.created).toBe(true);
    expect(result.backlog.ref_no).toMatch(/^ABB-\d+$/);
    expect(result.backlog.assignee_person_id).toBe(assigneeId);
    expect(store.issues[0].backlog_ref).toBe(result.backlog.ref_no);
    expect(store.issues[0].assignee_person_id).toBe(assigneeId);
  });

  it('promote requires assignee', () => {
    const issueId = store.addIssue({
      ticket_no: 'eT-ABB-0003',
      title: 'No assignee',
      module_code: 'ABB',
      category: 'defect',
      project_id: 1,
    });
    expect(() => promoteIssueToBacklog(store, issueId, 1)).toThrow(/assignee_person_id is required/);
  });
});
