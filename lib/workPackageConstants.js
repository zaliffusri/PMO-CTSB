export const WORK_PACKAGE_STATUSES = [
  { id: 'active', label: 'Active' },
  { id: 'on-hold', label: 'On hold' },
  { id: 'completed', label: 'Completed' },
];

export const WORK_PACKAGE_STATUS_SET = new Set(WORK_PACKAGE_STATUSES.map((s) => s.id));

export function workPackageStatusLabel(id) {
  return WORK_PACKAGE_STATUSES.find((s) => s.id === id)?.label || id;
}
