export const CALENDAR_EDITOR_ROLES = new Set(['admin', 'pmo', 'pmo officer', 'pmo_officer']);

export function canEditCalendarRole(role) {
  return CALENDAR_EDITOR_ROLES.has(String(role || '').trim().toLowerCase());
}

export function canEditCalendarUser(user) {
  return canEditCalendarRole(user?.role);
}
