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

/** Delivery scope / work types within a project (work packages, phases, tasks). */
export const DELIVERY_SCOPE_TYPES = [
  { id: 'New System Development', label: 'New system development', hint: 'Greenfield system for government or local authority clients' },
  { id: 'API Integration', label: 'API integration', hint: 'API integration with agency systems' },
  { id: 'Maintenance & Support', label: 'Maintenance & support', hint: 'Ongoing maintenance and support' },
  { id: 'Data Migration', label: 'Data migration', hint: 'Data transfer to a new system' },
  { id: 'Data Cleansing', label: 'Data cleansing', hint: 'Data quality improvement and cleanup' },
  { id: 'Enhancement', label: 'Enhancement', hint: 'Improvements to existing modules or features' },
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
