export const BACKLOG_TYPES = [
  { id: 'scope', label: 'Original scope', hint: 'Work within the original contract scope' },
  { id: 'cr', label: 'Change request (CR)', hint: 'Approved change request' },
  { id: 'bug', label: 'Bug', hint: 'Functional defect' },
  { id: 'defect', label: 'Defect', hint: 'Quality or recurring defect' },
  { id: 'enhancement', label: 'Enhancement', hint: 'Feature improvement' },
  { id: 'support', label: 'Support', hint: 'Support or technical inquiry' },
  { id: 'data', label: 'Data', hint: 'Migration or data cleansing' },
  { id: 'recurring', label: 'Recurring', hint: 'Recurring issue or work item' },
];

export const BACKLOG_SOURCES = [
  { id: 'scope', label: 'Contract scope' },
  { id: 'helpdesk', label: 'Helpdesk' },
  { id: 'cr', label: 'Approved CR' },
  { id: 'inquiry', label: 'Inquiry' },
  { id: 'recurring', label: 'Recurring' },
  { id: 'manual', label: 'Manual' },
];

/** Workflow statuses aligned with helpdesk / eTicket practice. */
export const BACKLOG_STATUSES = [
  { id: 'open', label: 'Open', hint: 'Queued — not started' },
  { id: 'in_progress', label: 'In progress', hint: 'Assignee is working on it' },
  { id: 'fixed', label: 'Fixed', hint: 'Work complete — awaiting verification or closure' },
  { id: 'closed', label: 'Closed', hint: 'Verified or no further action' },
];

export const BACKLOG_PRIORITIES = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  { id: 'critical', label: 'Critical' },
];

export const BACKLOG_TYPE_SET = new Set(BACKLOG_TYPES.map((t) => t.id));
export const BACKLOG_SOURCE_SET = new Set(BACKLOG_SOURCES.map((s) => s.id));
export const BACKLOG_STATUS_SET = new Set(BACKLOG_STATUSES.map((s) => s.id));
export const BACKLOG_PRIORITY_SET = new Set(BACKLOG_PRIORITIES.map((p) => p.id));

export const OPEN_BACKLOG_STATUSES = new Set(['open', 'in_progress']);

const LEGACY_STATUS_MAP = {
  new: 'open',
  triaged: 'open',
  approved: 'open',
  in_sprint: 'in_progress',
  done: 'fixed',
  rejected: 'closed',
};

export function normalizeBacklogStatus(status) {
  const s = String(status || 'open').toLowerCase();
  if (BACKLOG_STATUS_SET.has(s)) return s;
  return LEGACY_STATUS_MAP[s] || 'open';
}

export function backlogStatusLabel(status) {
  const id = normalizeBacklogStatus(status);
  return BACKLOG_STATUSES.find((s) => s.id === id)?.label || id;
}

export function backlogStatusTone(status) {
  const id = normalizeBacklogStatus(status);
  const map = {
    open: 'open',
    in_progress: 'progress',
    fixed: 'fixed',
    closed: 'closed',
  };
  return map[id] || 'open';
}

export function issueCategoryToBacklogType(category) {
  const map = {
    defect: 'bug',
    change_request: 'cr',
    support: 'support',
    data: 'data',
    access: 'support',
    infrastructure: 'enhancement',
    other: 'enhancement',
  };
  return map[category] || 'enhancement';
}

export function issueCategoryToBacklogSource(category) {
  if (category === 'change_request') return 'cr';
  if (category === 'support' || category === 'access') return 'inquiry';
  return 'helpdesk';
}
