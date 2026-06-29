import { nextEticketNo } from '../../lib/issueTicketNo.js';
import { normalizeModuleCode, moduleLabelForCode } from '../../lib/epbtModules.js';
import {
  parseIncidentType,
  categoryForIncidentType,
  parseIntakeChannel,
  ISSUE_INCIDENT_TYPE_SET,
  ISSUE_INTAKE_CHANNEL_SET,
} from '../../lib/issueConstants.js';
import { cleanExternalTicketRef, normalizeBacklogRef } from '../../lib/issueBacklogLink.js';
import { nextId } from '../runtime/helpers.js';

export function createIssuesRepository(ctx, getStore) {
  const { getData, save } = ctx;

  return {
    get issues() {
      return [...(getData().issues || [])];
    },

    nextIssueTicketNo(moduleCode = 'XXX') {
      const data = getData();
      return nextEticketNo(data.issues, moduleCode);
    },

    findIssueByTicketNo(ticketNo) {
      const data = getData();
      if (!data.issues || !ticketNo) return null;
      const q = String(ticketNo).trim().toUpperCase();
      return data.issues.find((i) => String(i.ticket_no || '').toUpperCase() === q) || null;
    },

    findIssueByExternalTicketRef(ref) {
      const data = getData();
      if (!data.issues || !ref) return null;
      const q = cleanExternalTicketRef(ref);
      if (!q) return null;
      const qu = q.toUpperCase();
      return data.issues.find((i) => {
        const ir = cleanExternalTicketRef(i.external_ticket_ref);
        return ir && ir.toUpperCase() === qu;
      }) || null;
    },

    findBacklogByRefNo(refNo) {
      const data = getData();
      if (!data.backlogs || !refNo) return null;
      const q = normalizeBacklogRef(refNo);
      if (!q) return null;
      return data.backlogs.find((b) => normalizeBacklogRef(b.ref_no) === q) || null;
    },

    findBacklogByExternalTicketRef(ref) {
      const data = getData();
      if (!data.backlogs || !ref) return null;
      const q = cleanExternalTicketRef(ref);
      if (!q) return null;
      const qu = q.toUpperCase();
      return data.backlogs.find((b) => {
        const br = cleanExternalTicketRef(b.external_ticket_ref);
        return br && br.toUpperCase() === qu;
      }) || null;
    },

    addIssue(row) {
      const data = getData();
      const store = getStore();
      if (!data.issues) data.issues = [];
      const id = nextId(data.issues);
      const now = new Date().toISOString();
      const moduleCode = normalizeModuleCode(row.module_code || row.epbt_module);
      const epbtModule = row.epbt_module != null ? String(row.epbt_module).trim() : moduleLabelForCode(moduleCode);
      const incidentType = row.incident_type && ISSUE_INCIDENT_TYPE_SET.has(row.incident_type)
        ? row.incident_type
        : (parseIncidentType(row.incident_type) || 'issue');
      const intakeChannel = row.intake_channel && ISSUE_INTAKE_CHANNEL_SET.has(row.intake_channel)
        ? row.intake_channel
        : parseIntakeChannel(row.intake_channel);
      const issue = {
        id,
        ticket_no: row.ticket_no || store.nextIssueTicketNo(moduleCode),
        title: String(row.title || '').trim(),
        description: row.description != null ? String(row.description) : null,
        status: row.status || 'open',
        priority: row.priority || 'medium',
        category: row.category || categoryForIncidentType(incidentType),
        incident_type: incidentType,
        module_code: moduleCode,
        epbt_module: epbtModule || null,
        intake_channel: intakeChannel,
        client_pic: row.client_pic != null ? String(row.client_pic).trim() || null : null,
        action_taken: row.action_taken != null ? String(row.action_taken) : null,
        l1_assignee_label: row.l1_assignee_label != null ? String(row.l1_assignee_label).trim() || null : null,
        l2_assignee_label: row.l2_assignee_label != null ? String(row.l2_assignee_label).trim() || null : null,
        backlog_ref: row.backlog_ref != null ? String(row.backlog_ref).trim() || null : null,
        issue_attachment_ref: row.issue_attachment_ref != null ? String(row.issue_attachment_ref).trim() || null : null,
        resolution_attachment_ref: row.resolution_attachment_ref != null ? String(row.resolution_attachment_ref).trim() || null : null,
        project_id: row.project_id != null && row.project_id !== '' ? +row.project_id : null,
        client_id: row.client_id != null && row.client_id !== '' ? +row.client_id : null,
        reporter_user_id: row.reporter_user_id != null ? +row.reporter_user_id : null,
        assignee_person_id: row.assignee_person_id != null && row.assignee_person_id !== '' ? +row.assignee_person_id : null,
        external_ticket_ref: row.external_ticket_ref != null ? String(row.external_ticket_ref).trim() || null : null,
        support_level: ['L1', 'L2', 'L3'].includes(String(row.support_level || '').toUpperCase())
          ? String(row.support_level).toUpperCase()
          : 'L1',
        resolution_method: row.resolution_method || null,
        resolution_notes: row.resolution_notes != null ? String(row.resolution_notes) : null,
        created_at: row.created_at || now,
        updated_at: row.updated_at || now,
        resolved_at: row.resolved_at || null,
      };
      data.issues.push(issue);
      save();
      return id;
    },

    updateIssue(id, patch) {
      const data = getData();
      if (!data.issues) data.issues = [];
      const i = data.issues.findIndex((x) => x.id === +id);
      if (i === -1) return false;
      const cur = data.issues[i];
      const next = { ...cur, ...patch, updated_at: new Date().toISOString() };
      if (patch.status === 'resolved' || patch.status === 'closed') {
        if (!cur.resolved_at) next.resolved_at = new Date().toISOString();
      }
      if (patch.status === 'open' || patch.status === 'in_progress') {
        next.resolved_at = null;
      }
      data.issues[i] = next;
      save();
      return true;
    },
  };
}
