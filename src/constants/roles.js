/** Display labels for `users_app.role` values in the UI. */
export const ROLE_LABELS = {
  admin: 'Administrator',
  pmo: 'PMO Officer',
  finance: 'Finance',
  hr: 'HR',
  user: 'User',
};

export const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'pmo', label: 'PMO' },
  { value: 'finance', label: 'Finance' },
  { value: 'hr', label: 'HR' },
  { value: 'user', label: 'User' },
];

export function roleLabel(role) {
  return ROLE_LABELS[role] || role;
}
