/** Contract / engagement instrument at project level (Kontrak, LO, PO, etc.). */
export const PROJECT_ENGAGEMENT_TYPES = [
  { id: 'contract', label: 'Contract', hint: 'Formal contract with client or agency' },
  { id: 'letter_of_offer', label: 'Letter of offer (LO)', hint: 'Letter of offer acceptance' },
  { id: 'purchase_order', label: 'Purchase order (PO)', hint: 'PO-based engagement' },
  { id: 'mou', label: 'MOU', hint: 'Memorandum of understanding' },
  { id: 'quotation', label: 'Quotation', hint: 'Accepted quotation' },
  { id: 'tender', label: 'Tender award', hint: 'Post-tender contract award' },
  { id: 'internal', label: 'Internal initiative', hint: 'Internal or non-contract work' },
];

export const PROJECT_ENGAGEMENT_TYPE_IDS = PROJECT_ENGAGEMENT_TYPES.map((t) => t.id);
export const PROJECT_ENGAGEMENT_TYPE_SET = new Set(PROJECT_ENGAGEMENT_TYPE_IDS);

export function engagementTypeLabel(id) {
  if (!id) return '';
  return PROJECT_ENGAGEMENT_TYPES.find((t) => t.id === id)?.label ?? id;
}

/** UI labels — API/table still use work_packages; company language is Phases. */
export const PHASE_UI = {
  singular: 'Phase',
  plural: 'Phases',
  tab: 'Phases',
  add: 'Add phase',
  edit: 'Edit phase',
  emptyTitle: 'No phases yet',
  emptyDesc: 'Add Phase 1, Phase 2, or a single phase for hardware / setup projects.',
  select: 'Select phase…',
  filterAll: 'All phases',
  deliveryBy: 'Payment milestones by phase',
  deliveryLane: 'Phase milestones',
  forPhase: 'For phase',
  deleteConfirm: (name) => `Delete phase "${name}"? Delivery milestones for this phase will be removed. Tasks and backlog items will be unassigned.`,
};

/** Delivery scope / work types within a project (phases / packages / tasks). */
export const DELIVERY_SCOPE_TYPES = [
  { id: 'New System Development', label: 'New system development', hint: 'Greenfield system for government or local authority clients' },
  { id: 'API Integration', label: 'API integration', hint: 'API integration with agency systems' },
  { id: 'Hardware Supply', label: 'Hardware supply', hint: 'Supply, install, and commission hardware only' },
  { id: 'Maintenance & Support', label: 'Maintenance & support', hint: 'Ongoing maintenance and support' },
  { id: 'Data Migration', label: 'Data migration', hint: 'Data transfer to a new system' },
  { id: 'Data Cleansing', label: 'Data cleansing', hint: 'Data quality improvement and cleanup' },
  { id: 'Enhancement', label: 'Enhancement', hint: 'Improvements to existing modules or features' },
  { id: 'System Setup / Commissioning', label: 'System setup / commissioning', hint: 'Open, configure, and hand over an existing system' },
  { id: 'Pre-Sales / Tender', label: 'Pre-sales / tender', hint: 'Pre-sales and tender documentation' },
];

/** @deprecated alias — use DELIVERY_SCOPE_TYPES; kept for phase templates and API field names */
export const PROJECT_CLASSIFICATIONS = DELIVERY_SCOPE_TYPES;

export const DELIVERY_SCOPE_TYPE_IDS = DELIVERY_SCOPE_TYPES.map((c) => c.id);
export const PROJECT_CLASSIFICATION_IDS = DELIVERY_SCOPE_TYPE_IDS;

export function deliveryScopeLabel(id) {
  if (!id) return '';
  return DELIVERY_SCOPE_TYPES.find((c) => c.id === id)?.label ?? id;
}

/** Fixed choices for assignment `role_in_project` when adding team members. */
export const PROJECT_ASSIGNMENT_ROLES = [
  'Project Lead',
  'Project Manager',
  'Solution Architect',
  'Lead Developer',
  'Developer',
  'Business Analyst',
  'Analyst',
  'QA',
  'Coordinator',
  'Support',
  'Member',
];

export const PROJECT_ASSIGNMENT_ROLE_SET = new Set(PROJECT_ASSIGNMENT_ROLES);

export function normalizeProjectAssignmentRole(value, { allowCustom = true } = {}) {
  const raw = String(value || '').trim().slice(0, 80);
  if (!raw || raw === '__custom__') return null;
  if (PROJECT_ASSIGNMENT_ROLE_SET.has(raw)) return raw;
  // Soft match common aliases from older free-text data
  const lower = raw.toLowerCase();
  const alias = {
    ba: 'Business Analyst',
    'business analyst': 'Business Analyst',
    'project lead': 'Project Lead',
    pm: 'Project Manager',
    'project manager': 'Project Manager',
    'lead developer': 'Lead Developer',
    developer: 'Developer',
    analyst: 'Analyst',
    qa: 'QA',
    coordinator: 'Coordinator',
    support: 'Support',
    member: 'Member',
    'solution architect': 'Solution Architect',
  };
  if (alias[lower]) return alias[lower];
  // Custom role entered via "Other"
  return allowCustom ? raw : null;
}
