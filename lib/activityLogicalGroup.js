/**
 * One "activity" in the UI can be several DB rows (one per assignee). Grouping uses this key
 * so calendar chips match; DELETE uses the same key to remove the whole logical activity.
 */
export function activityGroupTimeMs(value) {
  const n = new Date(value).getTime();
  return Number.isFinite(n) ? n : String(value ?? '');
}

export function activityLogicalGroupKey(a) {
  if (a?.activity_group_id != null && String(a.activity_group_id).trim() !== '') {
    return `gid:${String(a.activity_group_id).trim()}`;
  }
  const projectKey = a.project_id != null && a.project_id !== '' ? String(a.project_id) : '';
  const desc = String(a.description ?? '').trim();
  const title = String(a.title ?? '').trim();
  const loc = String(a.location ?? '').trim();
  const type = String(a.type ?? '').toLowerCase();
  const extPart = String(a.external_attendees ?? '').trim();
  const extKey = extPart ? `|ext:${extPart.toLowerCase()}` : '';
  return `${activityGroupTimeMs(a.start_at)}|${activityGroupTimeMs(a.end_at)}|${type}|${title}|${loc}|${projectKey}|${desc}${extKey}`;
}

/** All activity row ids that belong to the same logical event as the row with `anchorId`. */
export function idsInSameLogicalGroup(allActivities, anchorId) {
  const idNum = Number(anchorId);
  const anchor = allActivities.find((x) => Number(x.id) === idNum);
  if (!anchor) return [];
  const k = activityLogicalGroupKey(anchor);
  return allActivities.filter((x) => activityLogicalGroupKey(x) === k).map((x) => x.id);
}
