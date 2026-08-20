export const CALENDAR_EDITOR_ROLES = new Set(['admin', 'pmo', 'pmo officer', 'pmo_officer']);

export const PMO_ROLES = new Set(['admin', 'pmo', 'pmo officer', 'pmo_officer']);

export const APP_ROLES = new Set(['admin', 'pmo', 'finance', 'hr', 'user']);

export function normalizeRole(role) {
  return String(role || '').trim().toLowerCase();
}

export function isHrUser(user) {
  return normalizeRole(user?.role) === 'hr';
}

/** HR accounts are restricted to calendar and their own profile. */
export function isHrCalendarOnly(user) {
  return isHrUser(user);
}

export function canEditCalendarRole(role) {
  return CALENDAR_EDITOR_ROLES.has(normalizeRole(role));
}

export function canEditCalendarUser(user) {
  return canEditCalendarRole(user?.role);
}

/** PMO and admin create projects (delivery portfolio). */
export function canCreateProject(user) {
  return PMO_ROLES.has(normalizeRole(user?.role));
}

/** Only admins may permanently delete projects. */
export function canDeleteProject(user) {
  return normalizeRole(user?.role) === 'admin';
}

export function canAssignIssues(user) {
  const r = normalizeRole(user?.role);
  return r === 'admin' || r === 'pmo' || r === 'pmo officer' || r === 'pmo_officer';
}

export function canViewFinance(user) {
  const r = normalizeRole(user?.role);
  return r === 'admin' || r === 'pmo' || r === 'pmo officer' || r === 'pmo_officer' || r === 'finance';
}

/**
 * Map logged-in user to people.id via hard FK people.user_id.
 * Soft email/name matching was removed — rename/email changes no longer break links.
 */
export function personIdForUser(user, people = []) {
  if (!user) return null;
  const uid = Number(user.id);
  if (!Number.isFinite(uid)) return null;
  const match = (people || []).find((p) => Number(p.user_id) === uid);
  return match?.id ?? null;
}

/** Resolve roster person row for a login user (by people.user_id). */
export function personForUser(user, people = []) {
  if (!user) return null;
  const uid = Number(user.id);
  if (!Number.isFinite(uid)) return null;
  return (people || []).find((p) => Number(p.user_id) === uid) || null;
}

export function isHelpdeskAssignee(user, issue, people = []) {
  const pid = personIdForUser(user, people);
  return pid != null && issue?.assignee_person_id === pid;
}

/** PMO, ticket reporter, or any rostered team member may promote helpdesk → backlog. */
export function canUserPromoteIssueToBacklog(user, issue, people = []) {
  if (!user || !issue) return false;
  if (canAssignIssues(user)) return true;
  if (issue.reporter_user_id != null && issue.reporter_user_id === user.id) return true;
  if (personIdForUser(user, people) != null) return true;
  return false;
}

export function isUserOnProjectRoster(user, projectId, people = [], projectAssignments = []) {
  const pid = personIdForUser(user, people);
  if (pid == null) return false;
  return projectAssignments.some((a) => a.project_id === +projectId && a.person_id === pid);
}

export function isBacklogAssignee(user, backlog, people = []) {
  const pid = personIdForUser(user, people);
  return pid != null && backlog?.assignee_person_id === pid;
}

/** PMO full control; assignee may update status and actual hours. */
export function canUserUpdateBacklog(user, backlog, people = []) {
  if (!user || !backlog) return false;
  if (canCreateProject(user)) return true;
  return isBacklogAssignee(user, backlog, people);
}

export function canUserCommentOnBacklog(user, backlog, people = [], projectAssignments = []) {
  if (!user || !backlog) return false;
  if (canCreateProject(user)) return true;
  if (isBacklogAssignee(user, backlog, people)) return true;
  return isUserOnProjectRoster(user, backlog.project_id, people, projectAssignments);
}
