/** @typedef {'new' | 'ongoing' | 'done'} TaskStatus */

const VALID = new Set(['new', 'ongoing', 'done']);

/**
 * Resolve display/storage status from a task row (handles legacy rows without status).
 * @param {object} t
 * @returns {TaskStatus}
 */
export function normalizeTaskStatus(t) {
  if (t.status && VALID.has(t.status)) return t.status;
  const p = t.progress_percent ?? 0;
  if (p >= 100) return 'done';
  if (t.actual_start_date || p > 0) return 'ongoing';
  return 'new';
}
