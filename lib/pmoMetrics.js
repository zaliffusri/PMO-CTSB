/** Shared PMO portfolio / project health helpers (frontend + backend safe). */

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function leafTasks(tasks = []) {
  return tasks.filter((t) => t.task_kind !== 'group');
}

export function computeProjectHealth(project, tasks = []) {
  const leaves = leafTasks(tasks.filter((t) => t.project_id === project.id));
  const progress = leaves.length
    ? Math.round(leaves.reduce((s, t) => s + (Number(t.progress_percent) || 0), 0) / leaves.length)
    : 0;

  const today = todayIso();
  const overdueTasks = leaves.filter((t) => {
    const due = t.planned_end_date;
    const status = String(t.status || 'new').toLowerCase();
    return due && due < today && status !== 'done';
  }).length;

  const stalled = leaves.filter((t) => {
    const due = t.planned_end_date;
    const status = String(t.status || 'new').toLowerCase();
    const pct = Number(t.progress_percent) || 0;
    return status === 'ongoing' && pct < 25 && due && due < today;
  }).length;

  const projectOverdue =
    project.status === 'active' && project.end_date && String(project.end_date).slice(0, 10) < today;

  let health = 'on_track';
  if (stalled > 0) health = 'blocked';
  else if (overdueTasks > 0 || projectOverdue) health = 'at_risk';

  return {
    health,
    progress,
    overdueTasks,
    stalledTasks: stalled,
    taskCount: leaves.length,
    projectOverdue: Boolean(projectOverdue),
  };
}

export function healthLabel(health) {
  if (health === 'at_risk') return 'At risk';
  if (health === 'blocked') return 'Blocked';
  return 'On track';
}

export function formatProjectDate(str) {
  if (!str) return null;
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return str;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function daysUntilDate(endDate) {
  if (!endDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  return Math.round((end - today) / 86400000);
}

/** @returns {{ label: string, tone: 'ok' | 'warning' | 'danger' | 'muted' } | null} */
export function deadlineSummary(endDate, status = 'active') {
  const days = daysUntilDate(endDate);
  if (days == null) return null;
  if (status === 'completed') return { label: 'Completed', tone: 'muted' };
  if (days < 0) return { label: `${Math.abs(days)}d overdue`, tone: 'danger' };
  if (days === 0) return { label: 'Due today', tone: 'warning' };
  if (days <= 14) return { label: `${days}d left`, tone: 'warning' };
  return { label: `${days}d left`, tone: 'ok' };
}

export function progressColor(health) {
  if (health === 'at_risk') return HEALTH_COLORS.at_risk;
  if (health === 'blocked') return HEALTH_COLORS.blocked;
  return HEALTH_COLORS.on_track;
}

export function enrichProjectsWithHealth(projects, allTasks) {
  return projects.map((p) => {
    const metrics = computeProjectHealth(p, allTasks);
    return { ...p, ...metrics };
  });
}

export function portfolioSummary(enrichedProjects, workload = []) {
  const active = enrichedProjects.filter((p) => p.status === 'active');
  const onTrack = active.filter((p) => p.health === 'on_track').length;
  const atRisk = active.filter((p) => p.health === 'at_risk').length;
  const blocked = active.filter((p) => p.health === 'blocked').length;
  const avgCompletion = active.length
    ? Math.round(active.reduce((s, p) => s + (p.progress || 0), 0) / active.length)
    : 0;
  const overloaded = workload.filter((w) => w.isOverloaded).length;

  return {
    totalProjects: enrichedProjects.length,
    activeProjects: active.length,
    onTrack,
    atRisk,
    blocked,
    avgCompletion,
    overloadedPeople: overloaded,
  };
}

export function needsAttentionItems(enrichedProjects, workload = []) {
  const items = [];
  const today = todayIso();

  enrichedProjects
    .filter((p) => p.status === 'active')
    .forEach((p) => {
      if (p.health === 'at_risk' || p.health === 'blocked') {
        items.push({
          id: `project-${p.id}`,
          type: 'project',
          severity: p.health === 'blocked' ? 'high' : 'medium',
          title: p.name,
          detail: p.health === 'blocked'
            ? `${p.stalledTasks} stalled task(s)`
            : p.projectOverdue
              ? 'Past planned end date'
              : `${p.overdueTasks} overdue task(s)`,
          link: `/projects/${p.id}`,
        });
      }
      if (p.end_date && String(p.end_date).slice(0, 10) < today && (p.progress || 0) < 100) {
        items.push({
          id: `due-${p.id}`,
          type: 'deadline',
          severity: 'medium',
          title: p.name,
          detail: `Due ${p.end_date}`,
          link: `/projects/${p.id}`,
        });
      }
    });

  workload
    .filter((w) => w.isOverloaded)
    .forEach((w) => {
      items.push({
        id: `overload-${w.id}`,
        type: 'resource',
        severity: 'high',
        title: w.name,
        detail: `${w.totalAllocation}% allocated across projects`,
        link: '/team',
      });
    });

  return items.slice(0, 12);
}

/** Chart data builders */
const HEALTH_COLORS = {
  on_track: '#16a34a',
  at_risk: '#d97706',
  blocked: '#dc2626',
};

const STATUS_COLORS = {
  active: '#2563eb',
  'on-hold': '#64748b',
  completed: '#16a34a',
};

export function chartHealthData(enrichedProjects) {
  const active = enrichedProjects.filter((p) => p.status === 'active');
  return [
    { key: 'on_track', label: 'On track', value: active.filter((p) => p.health === 'on_track').length, color: HEALTH_COLORS.on_track },
    { key: 'at_risk', label: 'At risk', value: active.filter((p) => p.health === 'at_risk').length, color: HEALTH_COLORS.at_risk },
    { key: 'blocked', label: 'Blocked', value: active.filter((p) => p.health === 'blocked').length, color: HEALTH_COLORS.blocked },
  ].filter((d) => d.value > 0);
}

export function chartStatusData(projects) {
  const counts = {};
  projects.forEach((p) => {
    const s = p.status || 'active';
    counts[s] = (counts[s] || 0) + 1;
  });
  return Object.entries(counts).map(([key, value]) => ({
    key,
    label: key.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    value,
    color: STATUS_COLORS[key] || '#94a3b8',
  }));
}

export function chartProgressData(enrichedProjects, limit = 8) {
  return enrichedProjects
    .filter((p) => p.status === 'active')
    .sort((a, b) => (b.progress || 0) - (a.progress || 0))
    .slice(0, limit)
    .map((p) => ({
      key: String(p.id),
      label: p.name,
      value: p.progress || 0,
      color: HEALTH_COLORS[p.health] || '#2563eb',
    }));
}

export function chartCapacityData(workload = [], limit = 8) {
  return [...workload]
    .sort((a, b) => (b.totalAllocation || 0) - (a.totalAllocation || 0))
    .slice(0, limit)
    .map((w) => ({
      key: String(w.id),
      label: w.name,
      value: w.totalAllocation || 0,
      color: w.isOverloaded ? HEALTH_COLORS.blocked : (w.totalAllocation || 0) >= 80 ? HEALTH_COLORS.at_risk : HEALTH_COLORS.on_track,
    }));
}

export function chartCapacityBands(workload = []) {
  const ok = workload.filter((w) => (w.totalAllocation || 0) < 80).length;
  const high = workload.filter((w) => {
    const v = w.totalAllocation || 0;
    return v >= 80 && v <= 100;
  }).length;
  const overload = workload.filter((w) => w.isOverloaded || (w.totalAllocation || 0) > 100).length;
  return [
    { key: 'ok', label: 'Under 80%', value: ok, color: HEALTH_COLORS.on_track },
    { key: 'high', label: '80–100%', value: high, color: HEALTH_COLORS.at_risk },
    { key: 'overload', label: 'Overloaded', value: overload, color: HEALTH_COLORS.blocked },
  ].filter((d) => d.value > 0);
}

const ENGAGEMENT_COLORS = {
  contract: '#2563eb',
  letter_of_offer: '#8b5cf6',
  purchase_order: '#06b6d4',
  mou: '#14b8a6',
  quotation: '#f59e0b',
  tender: '#ec4899',
  internal: '#64748b',
  unset: '#94a3b8',
};

export function chartEngagementTypeData(projects, labelFn = (id) => id) {
  const counts = {};
  projects.forEach((p) => {
    const k = p.engagement_type || 'unset';
    counts[k] = (counts[k] || 0) + 1;
  });
  return Object.entries(counts)
    .map(([key, value]) => ({
      key: key === 'unset' ? '' : key,
      rawKey: key,
      label: key === 'unset' ? 'Not set' : labelFn(key),
      value,
      color: ENGAGEMENT_COLORS[key] || '#94a3b8',
    }))
    .sort((a, b) => b.value - a.value);
}

export function chartOverdueByProject(enrichedProjects, limit = 8) {
  return enrichedProjects
    .filter((p) => p.status === 'active' && (p.overdueTasks || 0) > 0)
    .sort((a, b) => (b.overdueTasks || 0) - (a.overdueTasks || 0))
    .slice(0, limit)
    .map((p) => ({
      key: String(p.id),
      label: p.name,
      value: p.overdueTasks || 0,
      color: HEALTH_COLORS.blocked,
      meta: `${p.overdueTasks} overdue task(s)`,
    }));
}

export function chartTaskVolumeByProject(enrichedProjects, limit = 8) {
  return enrichedProjects
    .filter((p) => p.status === 'active' && (p.taskCount || 0) > 0)
    .sort((a, b) => (b.taskCount || 0) - (a.taskCount || 0))
    .slice(0, limit)
    .map((p) => ({
      key: String(p.id),
      label: p.name,
      value: p.taskCount || 0,
      color: HEALTH_COLORS[p.health] || '#2563eb',
      meta: `${p.progress || 0}% complete`,
    }));
}
