export const PHASE_STATUSES = [
  { id: 'pending', label: 'Pending' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'completed', label: 'Completed' },
  { id: 'blocked', label: 'Blocked' },
];

export const PAYMENT_STATUSES = [
  { id: 'not_applicable', label: 'N/A' },
  { id: 'pending', label: 'Pending' },
  { id: 'invoiced', label: 'Invoiced' },
  { id: 'paid', label: 'Paid' },
];

export const PHASE_STATUS_SET = new Set(PHASE_STATUSES.map((s) => s.id));
export const PAYMENT_STATUS_SET = new Set(PAYMENT_STATUSES.map((s) => s.id));

/** Delivery phase templates by work package delivery scope (government / PBT). */
export const PHASE_TEMPLATES = {
  'New System Development': [
    { phase_key: 'presales', name: 'Pre-sales / Tender', sort_order: 1, payment_status: 'not_applicable' },
    { phase_key: 'contract', name: 'Contract / LoA', sort_order: 2, payment_status: 'pending' },
    { phase_key: 'urs', name: 'URS & sign-off', sort_order: 3, payment_status: 'pending' },
    { phase_key: 'development', name: 'Development', sort_order: 4, payment_status: 'pending' },
    { phase_key: 'sit', name: 'SIT', sort_order: 5, payment_status: 'pending' },
    { phase_key: 'uat', name: 'UAT & sign-off', sort_order: 6, payment_status: 'pending' },
    { phase_key: 'training', name: 'Training', sort_order: 7, payment_status: 'pending' },
    { phase_key: 'go_live', name: 'Go-live', sort_order: 8, payment_status: 'pending' },
    { phase_key: 'warranty', name: 'Warranty', sort_order: 9, payment_status: 'not_applicable' },
  ],
  'API Integration': [
    { phase_key: 'discovery', name: 'Discovery & API spec', sort_order: 1, payment_status: 'pending' },
    { phase_key: 'development', name: 'Development & integration', sort_order: 2, payment_status: 'pending' },
    { phase_key: 'sit', name: 'SIT', sort_order: 3, payment_status: 'pending' },
    { phase_key: 'uat', name: 'UAT', sort_order: 4, payment_status: 'pending' },
    { phase_key: 'go_live', name: 'Go-live', sort_order: 5, payment_status: 'pending' },
    { phase_key: 'warranty', name: 'Warranty / support', sort_order: 6, payment_status: 'not_applicable' },
  ],
  'Maintenance & Support': [
    { phase_key: 'onboarding', name: 'Onboarding', sort_order: 1, payment_status: 'pending' },
    { phase_key: 'maintenance', name: 'Maintenance period', sort_order: 2, payment_status: 'pending' },
    { phase_key: 'review', name: 'Quarterly review', sort_order: 3, payment_status: 'not_applicable' },
  ],
  'Data Migration': [
    { phase_key: 'assessment', name: 'Data assessment', sort_order: 1, payment_status: 'pending' },
    { phase_key: 'mapping', name: 'Mapping & cleansing', sort_order: 2, payment_status: 'pending' },
    { phase_key: 'migration', name: 'Migration run', sort_order: 3, payment_status: 'pending' },
    { phase_key: 'validation', name: 'Validation & sign-off', sort_order: 4, payment_status: 'pending' },
  ],
  'Data Cleansing': [
    { phase_key: 'profiling', name: 'Data profiling', sort_order: 1, payment_status: 'pending' },
    { phase_key: 'cleansing', name: 'Cleansing execution', sort_order: 2, payment_status: 'pending' },
    { phase_key: 'validation', name: 'Validation report', sort_order: 3, payment_status: 'pending' },
  ],
  'Enhancement': [
    { phase_key: 'scope', name: 'Scope confirmation', sort_order: 1, payment_status: 'pending' },
    { phase_key: 'development', name: 'Development', sort_order: 2, payment_status: 'pending' },
    { phase_key: 'uat', name: 'UAT', sort_order: 3, payment_status: 'pending' },
    { phase_key: 'deploy', name: 'Deploy', sort_order: 4, payment_status: 'pending' },
  ],
  'Pre-Sales / Tender': [
    { phase_key: 'tender', name: 'Tender preparation', sort_order: 1, payment_status: 'not_applicable' },
    { phase_key: 'presentation', name: 'Presentation / demo', sort_order: 2, payment_status: 'not_applicable' },
    { phase_key: 'submission', name: 'Submission', sort_order: 3, payment_status: 'not_applicable' },
  ],
};

export const DEFAULT_PHASE_TEMPLATE = [
  { phase_key: 'planning', name: 'Planning', sort_order: 1, payment_status: 'pending' },
  { phase_key: 'execution', name: 'Execution', sort_order: 2, payment_status: 'pending' },
  { phase_key: 'delivery', name: 'Delivery & sign-off', sort_order: 3, payment_status: 'pending' },
  { phase_key: 'closure', name: 'Closure', sort_order: 4, payment_status: 'not_applicable' },
];

export function templateForClassification(classification) {
  return PHASE_TEMPLATES[classification] || DEFAULT_PHASE_TEMPLATE;
}

export function phaseStatusLabel(id) {
  return PHASE_STATUSES.find((s) => s.id === id)?.label || id;
}

export function paymentStatusLabel(id) {
  return PAYMENT_STATUSES.find((s) => s.id === id)?.label || id;
}
