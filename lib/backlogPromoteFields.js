/**
 * Build visible project_task fields when promoting a backlog item.
 * Dates/status make the new task obvious on the Tasks tab and Gantt.
 */
function isoDate(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function addDays(iso, days) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

export function buildPromotedTaskFields(item, {
  assigneeId = null,
  estimatedHours = null,
  actualHours = null,
} = {}) {
  const est = estimatedHours != null
    ? Number(estimatedHours)
    : (item.estimated_hours != null
      ? Number(item.estimated_hours)
      : (item.effort_days != null ? Number(item.effort_days) * 8 : null));
  const act = actualHours != null
    ? Number(actualHours)
    : (item.actual_hours != null ? Number(item.actual_hours) : null);

  const statusRaw = String(item.status || '').toLowerCase();
  const alreadyStarted = statusRaw === 'in_progress' || statusRaw === 'fixed';
  const today = isoDate();
  const spanDays = Number.isFinite(est) && est > 0
    ? Math.max(1, Math.ceil(est / 8))
    : 5;

  return {
    project_id: item.project_id,
    name: item.title,
    task_kind: 'task',
    status: alreadyStarted ? 'ongoing' : 'new',
    progress_percent: statusRaw === 'fixed' ? 90 : (alreadyStarted ? 25 : 0),
    assignee_id: assigneeId ?? (item.assignee_person_id != null ? +item.assignee_person_id : null),
    backlog_id: item.id,
    work_package_id: item.work_package_id ?? null,
    estimated_hours: Number.isFinite(est) ? est : null,
    actual_hours: Number.isFinite(act) ? act : null,
    planned_start_date: today,
    planned_end_date: addDays(today, spanDays),
    actual_start_date: alreadyStarted ? today : null,
    actual_end_date: null,
  };
}
