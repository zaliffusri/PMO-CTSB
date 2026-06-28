export const ISSUE_STATUSES = [
  { id: 'open', label: 'Open', hint: 'New issue, not yet assigned' },
  { id: 'in_progress', label: 'In progress', hint: 'Team is working on it' },
  { id: 'waiting_agency', label: 'Waiting on client', hint: 'Waiting for client or agency response' },
  { id: 'resolved', label: 'Resolved', hint: 'Completed, pending confirmation' },
  { id: 'closed', label: 'Closed', hint: 'Issue closed' },
];

export const ISSUE_PRIORITIES = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  { id: 'critical', label: 'Critical' },
];

export const ISSUE_CATEGORIES = [
  { id: 'defect', label: 'Defect / bug' },
  { id: 'support', label: 'Support request' },
  { id: 'change_request', label: 'Change request' },
  { id: 'data', label: 'Data issue' },
  { id: 'access', label: 'Access / permission' },
  { id: 'infrastructure', label: 'Infrastructure' },
  { id: 'other', label: 'Other' },
];

/** Legacy eTicket incident types */
export const ISSUE_INCIDENT_TYPES = [
  { id: 'bug_defect', label: 'Bug / Defect', category: 'defect' },
  { id: 'inquiry', label: 'Inquiry', category: 'support' },
  { id: 'issue', label: 'Issue', category: 'other' },
  { id: 'change_request', label: 'Change Request', category: 'change_request' },
  { id: 'service_request', label: 'Service Request', category: 'support' },
];

/** How the client reported the ticket (eTicket "Medium") */
export const ISSUE_INTAKE_CHANNELS = [
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'helpdesk', label: 'Helpdesk portal' },
  { id: 'email', label: 'Email' },
  { id: 'call', label: 'Phone call' },
  { id: 'other', label: 'Other' },
];

export { EPBT_MODULES } from './epbtModules.js';

/** L1 = frontline support, L2 = senior support; dev/data work → product backlog (not a third helpdesk level). */
export const ISSUE_SUPPORT_LEVELS = [
  { id: 'L1', label: '1st level', hint: 'Frontline — resolve via WhatsApp, call, etc.' },
  { id: 'L2', label: '2nd level', hint: 'Escalated support — still on helpdesk ticket' },
];

/** Helpdesk list filters — backlog replaces legacy L3 in the UI. */
export const HELPDESK_LEVEL_FILTERS = [
  ...ISSUE_SUPPORT_LEVELS,
  { id: 'backlog', label: 'Backlog', hint: 'Promoted to product backlog for dev/data work' },
];

export const ISSUE_RESOLUTION_METHODS = [
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'call', label: 'Phone call' },
  { id: 'email', label: 'Email' },
  { id: 'onsite', label: 'On-site / remote session' },
  { id: 'other', label: 'Other' },
];

export const ISSUE_STATUS_SET = new Set(ISSUE_STATUSES.map((s) => s.id));
export const ISSUE_PRIORITY_SET = new Set(ISSUE_PRIORITIES.map((p) => p.id));
export const ISSUE_CATEGORY_SET = new Set(ISSUE_CATEGORIES.map((c) => c.id));
export const ISSUE_INCIDENT_TYPE_SET = new Set(ISSUE_INCIDENT_TYPES.map((t) => t.id));
export const ISSUE_INTAKE_CHANNEL_SET = new Set(ISSUE_INTAKE_CHANNELS.map((c) => c.id));
export const ISSUE_SUPPORT_LEVEL_SET = new Set(['L1', 'L2', 'L3']);
export const ISSUE_RESOLUTION_METHOD_SET = new Set(ISSUE_RESOLUTION_METHODS.map((m) => m.id));

export function resolutionMethodLabel(id) {
  if (!id) return '';
  return ISSUE_RESOLUTION_METHODS.find((m) => m.id === id)?.label ?? id;
}

export function incidentTypeLabel(id) {
  if (!id) return '';
  return ISSUE_INCIDENT_TYPES.find((t) => t.id === id)?.label ?? id;
}

export function intakeChannelLabel(id) {
  if (!id) return '';
  return ISSUE_INTAKE_CHANNELS.find((c) => c.id === id)?.label ?? id;
}

export function parseIncidentType(value) {
  if (value == null || value === '') return null;
  const raw = String(value).trim();
  const byId = ISSUE_INCIDENT_TYPES.find((t) => t.id === raw.toLowerCase().replace(/\s+/g, '_'));
  if (byId) return byId.id;
  const norm = raw.toLowerCase();
  if (norm.includes('bug') || norm.includes('defect')) return 'bug_defect';
  if (norm.includes('change')) return 'change_request';
  if (norm.includes('service')) return 'service_request';
  if (norm.includes('inquir')) return 'inquiry';
  if (norm === 'issue') return 'issue';
  return ISSUE_INCIDENT_TYPE_SET.has(raw) ? raw : null;
}

export function categoryForIncidentType(incidentType) {
  const t = ISSUE_INCIDENT_TYPES.find((x) => x.id === incidentType);
  return t?.category ?? 'other';
}

export function parseIntakeChannel(value) {
  if (value == null || value === '') return null;
  const v = String(value).trim().toLowerCase();
  if (v.includes('whatsapp')) return 'whatsapp';
  if (v.includes('helpdesk')) return 'helpdesk';
  if (v.includes('email')) return 'email';
  if (v.includes('phone') || v === 'call') return 'call';
  if (ISSUE_INTAKE_CHANNEL_SET.has(v)) return v;
  return 'other';
}
