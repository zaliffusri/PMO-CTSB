export const BACKLOG_TYPES = [
  { id: 'inquiry', label: 'Inquiry', hint: 'Question or information request' },
  { id: 'issue', label: 'Issue', hint: 'General product issue' },
  { id: 'bug_defect', label: 'Bug/Defect', hint: 'Functional or quality defect' },
  { id: 'cr', label: 'CR', hint: 'Change request' },
  { id: 'changes', label: 'Changes', hint: 'Configuration or process change' },
  { id: 'golive', label: 'GoLive', hint: 'Go-live related work' },
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

/** Map older backlog type ids to the current catalog. */
const LEGACY_TYPE_MAP = {
  scope: 'issue',
  bug: 'bug_defect',
  defect: 'bug_defect',
  enhancement: 'changes',
  support: 'inquiry',
  data: 'issue',
  recurring: 'issue',
  change_request: 'cr',
  'bug/defect': 'bug_defect',
  golive: 'golive',
  'go-live': 'golive',
  go_live: 'golive',
};

export function normalizeBacklogStatus(status) {
  const s = String(status || 'open').toLowerCase();
  if (BACKLOG_STATUS_SET.has(s)) return s;
  return LEGACY_STATUS_MAP[s] || 'open';
}

export function normalizeBacklogType(type) {
  const raw = String(type || 'inquiry').trim().toLowerCase();
  if (BACKLOG_TYPE_SET.has(raw)) return raw;
  if (LEGACY_TYPE_MAP[raw]) return LEGACY_TYPE_MAP[raw];
  return 'inquiry';
}

export function backlogStatusLabel(status) {
  const id = normalizeBacklogStatus(status);
  return BACKLOG_STATUSES.find((s) => s.id === id)?.label || id;
}

export function backlogTypeLabel(type) {
  const id = normalizeBacklogType(type);
  return BACKLOG_TYPES.find((t) => t.id === id)?.label || id;
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
    defect: 'bug_defect',
    change_request: 'cr',
    support: 'inquiry',
    data: 'issue',
    access: 'inquiry',
    infrastructure: 'changes',
    other: 'issue',
  };
  return map[category] || 'issue';
}

export function issueCategoryToBacklogSource(category) {
  if (category === 'change_request') return 'cr';
  if (category === 'support' || category === 'access') return 'inquiry';
  return 'helpdesk';
}
