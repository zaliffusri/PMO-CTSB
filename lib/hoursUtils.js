/** Parse user hours input (allows decimals, e.g. 1.5 = 90 min). */
export function parseHoursInput(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

export function formatHours(value) {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return Number.isInteger(n) ? `${n}h` : `${n.toFixed(1)}h`;
}

export function formatHoursPair(estimated, actual) {
  const est = estimated != null && estimated !== '' ? Number(estimated) : null;
  const act = actual != null && actual !== '' ? Number(actual) : null;
  if (est == null && act == null) return '—';
  if (est != null && act != null) return `${formatHours(est)} / ${formatHours(act)}`;
  if (est != null) return `${formatHours(est)} est`;
  return `${formatHours(act)} act`;
}

export function sumHours(items, field = 'estimated_hours') {
  return items.reduce((sum, row) => {
    const n = Number(row?.[field]);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
}

export function hoursVariance(estimated, actual) {
  const est = Number(estimated);
  const act = Number(actual);
  if (!Number.isFinite(est) || !Number.isFinite(act)) return null;
  return Math.round((act - est) * 100) / 100;
}
