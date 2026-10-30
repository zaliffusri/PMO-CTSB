const DEFAULT_SLA_HOURS = {
  critical: 4,
  high: 8,
  medium: 24,
  low: 72,
};

export function slaHoursForPriority(priority) {
  const key = String(priority || 'medium').toLowerCase();
  return DEFAULT_SLA_HOURS[key] ?? DEFAULT_SLA_HOURS.medium;
}

export function computeSlaDueAt(createdAt, slaHours) {
  const start = new Date(createdAt || Date.now()).getTime();
  const hours = Number(slaHours);
  if (!Number.isFinite(start) || !Number.isFinite(hours) || hours <= 0) return null;
  return new Date(start + hours * 3600000).toISOString();
}

export function slaState(issue, now = Date.now()) {
  const closed = ['resolved', 'closed'].includes(String(issue?.status || '').toLowerCase());
  let dueAt = issue?.sla_due_at || null;
  if (!dueAt) {
    const hours = issue?.sla_hours || slaHoursForPriority(issue?.priority);
    dueAt = computeSlaDueAt(issue?.created_at, hours);
  }
  const due = dueAt ? new Date(dueAt).getTime() : null;
  if (!due || !Number.isFinite(due)) {
    return { sla_due_at: dueAt, sla_breached: false, sla_label: '—' };
  }
  const breached = !closed && now > due;
  const mins = Math.round((due - now) / 60000);
  let sla_label;
  if (closed) sla_label = 'Closed';
  else if (breached) sla_label = 'Breached';
  else if (mins < 60) sla_label = `${Math.max(0, mins)}m left`;
  else sla_label = `${Math.round(mins / 60)}h left`;
  return { sla_due_at: issue.sla_due_at, sla_breached: breached, sla_label };
}
