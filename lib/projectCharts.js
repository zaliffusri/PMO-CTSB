/** Chart data builders for a single project workspace. */

import { normalizeBacklogStatus, backlogStatusLabel } from './backlogConstants.js';

const TASK_STATUS_COLORS = {
  new: '#64748b',
  ongoing: '#2563eb',
  done: '#16a34a',
};

const PHASE_STATUS_COLORS = {
  pending: '#64748b',
  in_progress: '#2563eb',
  completed: '#16a34a',
  blocked: '#dc2626',
};

const BACKLOG_STATUS_COLORS = {
  open: '#64748b',
  in_progress: '#2563eb',
  fixed: '#16a34a',
  closed: '#94a3b8',
  new: '#64748b',
  approved: '#64748b',
  done: '#16a34a',
  rejected: '#94a3b8',
};

const PACKAGE_PALETTE = [
  '#2563eb', '#16a34a', '#d97706', '#8b5cf6', '#ec4899', '#06b6d4', '#f59e0b', '#6366f1',
];

function leafTasks(tasks = []) {
  return tasks.filter((t) => t.task_kind !== 'group');
}

export function chartProjectTaskStatus(tasks = []) {
  const leaves = leafTasks(tasks);
  const counts = { new: 0, ongoing: 0, done: 0 };
  leaves.forEach((t) => {
    const s = String(t.status || 'new').toLowerCase();
    if (s === 'done') counts.done += 1;
    else if (s === 'ongoing') counts.ongoing += 1;
    else counts.new += 1;
  });
  return [
    { key: 'new', label: 'New', value: counts.new, color: TASK_STATUS_COLORS.new },
    { key: 'ongoing', label: 'Ongoing', value: counts.ongoing, color: TASK_STATUS_COLORS.ongoing },
    { key: 'done', label: 'Done', value: counts.done, color: TASK_STATUS_COLORS.done },
  ].filter((d) => d.value > 0);
}

export function chartProjectAssigneeLoad(tasks = [], limit = 8) {
  const leaves = leafTasks(tasks);
  const map = new Map();
  leaves.forEach((t) => {
    const name = t.assignee_name || 'Unassigned';
    const key = String(t.assignee_id ?? name);
    if (!map.has(key)) {
      map.set(key, { key, label: name, value: 0, done: 0, overdue: 0 });
    }
    const row = map.get(key);
    row.value += 1;
    if (String(t.status || '').toLowerCase() === 'done') row.done += 1;
    const today = new Date().toISOString().slice(0, 10);
    if (t.planned_end_date && t.planned_end_date < today && String(t.status || '').toLowerCase() !== 'done') {
      row.overdue += 1;
    }
  });
  return [...map.values()]
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
    .map((row) => ({
      ...row,
      color: row.overdue > 0 ? '#dc2626' : row.done === row.value ? '#16a34a' : '#2563eb',
      meta: row.overdue > 0 ? `${row.overdue} overdue` : `${row.done} done`,
    }));
}

export function chartProjectWorkPackages(tasks = [], workPackages = []) {
  if (!workPackages.length) return [];
  return workPackages.map((wp, idx) => {
    const pkgTasks = leafTasks(tasks.filter((t) => t.work_package_id === wp.id));
    const progress = pkgTasks.length
      ? Math.round(pkgTasks.reduce((s, t) => s + (Number(t.progress_percent) || 0), 0) / pkgTasks.length)
      : 0;
    return {
      key: String(wp.id),
      label: wp.name,
      value: progress,
      taskCount: pkgTasks.length,
      color: PACKAGE_PALETTE[idx % PACKAGE_PALETTE.length],
    };
  });
}

export function chartProjectPhases(phases = []) {
  if (!phases.length) return [];
  const counts = {};
  phases.forEach((p) => {
    const s = String(p.status || 'pending').toLowerCase();
    counts[s] = (counts[s] || 0) + 1;
  });
  const labels = {
    pending: 'Pending',
    in_progress: 'In progress',
    completed: 'Completed',
    blocked: 'Blocked',
  };
  return Object.entries(counts).map(([key, value]) => ({
    key,
    label: labels[key] || key.replace(/_/g, ' '),
    value,
    color: PHASE_STATUS_COLORS[key] || '#94a3b8',
  }));
}

export function chartProjectBacklog(backlogItems = []) {
  if (!backlogItems.length) return [];
  const counts = {};
  backlogItems.forEach((b) => {
    const s = normalizeBacklogStatus(b.status);
    counts[s] = (counts[s] || 0) + 1;
  });
  return Object.entries(counts).map(([key, value]) => ({
    key,
    label: backlogStatusLabel(key),
    value,
    color: BACKLOG_STATUS_COLORS[key] || '#94a3b8',
  }));
}

/** Weekly task completion trend (last N weeks by actual_end_date or planned). */
export function chartProjectVelocity(tasks = [], weeks = 6) {
  const leaves = leafTasks(tasks);
  const now = new Date();
  const buckets = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const start = new Date(now);
    start.setDate(start.getDate() - i * 7);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const label = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const done = leaves.filter((t) => {
      if (String(t.status || '').toLowerCase() !== 'done') return false;
      const d = t.actual_end_date || t.planned_end_date;
      if (!d) return false;
      const dt = new Date(d);
      return dt >= start && dt < end;
    }).length;
    buckets.push({
      key: `w-${i}`,
      label,
      value: done,
      color: '#16a34a',
    });
  }
  return buckets;
}

export function chartProjectHealthBreakdown(tasks = []) {
  const leaves = leafTasks(tasks);
  const today = new Date().toISOString().slice(0, 10);
  let onTrack = 0;
  let atRisk = 0;
  let blocked = 0;
  leaves.forEach((t) => {
    const status = String(t.status || 'new').toLowerCase();
    if (status === 'done') {
      onTrack += 1;
      return;
    }
    const overdue = t.planned_end_date && t.planned_end_date < today;
    const stalled = status === 'ongoing' && (Number(t.progress_percent) || 0) < 25 && overdue;
    if (stalled) blocked += 1;
    else if (overdue) atRisk += 1;
    else onTrack += 1;
  });
  return [
    { key: 'on_track', label: 'On track', value: onTrack, color: '#16a34a' },
    { key: 'at_risk', label: 'At risk', value: atRisk, color: '#d97706' },
    { key: 'blocked', label: 'Blocked', value: blocked, color: '#dc2626' },
  ].filter((d) => d.value > 0);
}
