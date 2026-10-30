import { canCreateProject, canViewFinance, personIdForUser, normalizeRole } from './permissions.js';

/** PMO, admin, and finance see the full portfolio. Everyone else is assignment-scoped. */
export function canViewAllProjects(user) {
  const r = normalizeRole(user?.role);
  if (r === 'admin') return true;
  if (canCreateProject(user)) return true;
  if (canViewFinance(user)) return true;
  return false;
}

export function canAccessProject(user, projectId, visibleIds) {
  if (canViewAllProjects(user)) return true;
  if (visibleIds == null) return true;
  return visibleIds.has(Number(projectId));
}

/**
 * @returns {Promise<Set<number>|null>} null means unrestricted
 */
export async function getVisibleProjectIdSet(store, user) {
  if (!user || canViewAllProjects(user)) return null;
  const people = await store.listPeople();
  const personId = personIdForUser(user, people);
  const ids = new Set();
  const assignments = await store.listAssignments();
  for (const a of assignments || []) {
    if (personId != null && Number(a.person_id) === Number(personId)) {
      ids.add(Number(a.project_id));
    }
  }
  return ids;
}

export function filterByProjectScope(rows, idSet, key = 'project_id') {
  if (!Array.isArray(rows)) return [];
  if (idSet == null) return rows;
  return rows.filter((r) => idSet.has(Number(r?.[key])));
}
