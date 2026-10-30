/** Extension of Time (EOT) helpers for project timeline. */

export function parseEotLog(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw == null || raw === '') return [];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function daysBetween(fromDate, toDate) {
  const a = String(fromDate || '').slice(0, 10);
  const b = String(toDate || '').slice(0, 10);
  if (!a || !b) return null;
  const ms = new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`);
  if (!Number.isFinite(ms)) return null;
  return Math.round(ms / 86400000);
}

/**
 * Build next project fields after recording an EOT.
 * @returns {{ patch: object, entry: object } | { error: string }}
 */
export function buildEotUpdate(project, {
  new_end_date,
  reason,
  approved_by = null,
  actorName = null,
} = {}) {
  const newEnd = String(new_end_date || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newEnd)) {
    return { error: 'New end date is required (YYYY-MM-DD)' };
  }
  const reasonText = String(reason || '').trim();
  if (!reasonText) {
    return { error: 'Reason is required for EOT' };
  }

  const currentEnd = project?.end_date ? String(project.end_date).slice(0, 10) : null;
  if (currentEnd && newEnd <= currentEnd) {
    return { error: 'New end date must be after the current project end date' };
  }
  if (!currentEnd && project?.start_date && newEnd < String(project.start_date).slice(0, 10)) {
    return { error: 'New end date must be on or after the project start date' };
  }

  const baseline =
    project?.baseline_end_date
      ? String(project.baseline_end_date).slice(0, 10)
      : (currentEnd || newEnd);

  const previousEnd = currentEnd || baseline;
  const days = daysBetween(previousEnd, newEnd);
  const log = parseEotLog(project?.eot_log);
  const entry = {
    id: `eot-${Date.now()}`,
    previous_end_date: previousEnd,
    new_end_date: newEnd,
    days_added: days,
    reason: reasonText.slice(0, 500),
    approved_by: approved_by ? String(approved_by).trim().slice(0, 120) : null,
    recorded_by: actorName ? String(actorName).trim().slice(0, 120) : null,
    created_at: new Date().toISOString(),
  };

  return {
    entry,
    patch: {
      baseline_end_date: baseline,
      end_date: newEnd,
      eot_log: [...log, entry],
    },
  };
}

export function eotSummary(project) {
  const log = parseEotLog(project?.eot_log);
  const baseline = project?.baseline_end_date
    ? String(project.baseline_end_date).slice(0, 10)
    : null;
  const current = project?.end_date ? String(project.end_date).slice(0, 10) : null;
  const totalDays = log.reduce((s, e) => s + (Number(e.days_added) || 0), 0);
  return {
    baseline_end_date: baseline,
    current_end_date: current,
    eot_count: log.length,
    total_days_added: totalDays,
    eot_log: log,
    is_extended: log.length > 0,
  };
}
