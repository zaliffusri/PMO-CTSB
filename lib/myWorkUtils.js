import { daysUntilDate } from './pmoMetrics.js';

const PRIORITY_WEIGHT = { critical: 4, high: 3, medium: 2, low: 1 };

export function resolveMyPerson(people, user) {
  if (!user) return null;
  const email = String(user.email || '').trim().toLowerCase();
  const name = String(user.name || '').trim().toLowerCase();
  if (email) {
    const byEmail = people.find((p) => String(p.email || '').trim().toLowerCase() === email);
    if (byEmail) return byEmail;
  }
  if (name) {
    return people.find((p) => String(p.name || '').trim().toLowerCase() === name) || null;
  }
  return null;
}

export function isMyTask(task, myPerson, user) {
  if (!task || task.task_kind === 'group') return false;
  if (myPerson && task.assignee_id === myPerson.id) return true;
  const assignee = String(task.assignee_name || '').trim().toLowerCase();
  const name = String(user?.name || '').trim().toLowerCase();
  const email = String(user?.email || '').trim().toLowerCase();
  return assignee === name || (name && assignee.includes(name)) || (email && assignee.includes(email.split('@')[0]));
}

export function isMyBacklog(item, myPerson, user) {
  if (myPerson && item.assignee_person_id === myPerson.id) return true;
  const assignee = String(item.assignee_name || '').trim().toLowerCase();
  const name = String(user?.name || '').trim().toLowerCase();
  return assignee === name || (name && assignee.includes(name));
}

export function taskDueMeta(task) {
  const due = task.planned_end_date || task.actual_end_date;
  const days = daysUntilDate(due);
  const status = String(task.status || 'new').toLowerCase();
  if (!due || status === 'done') return { due, days, tone: 'muted', label: due ? 'No urgency' : 'No due date' };
  if (days < 0) return { due, days, tone: 'danger', label: `${Math.abs(days)}d overdue` };
  if (days === 0) return { due, days, tone: 'warning', label: 'Due today' };
  if (days <= 7) return { due, days, tone: 'warning', label: `${days}d left` };
  return { due, days, tone: 'ok', label: `${days}d left` };
}

export function priorityWeight(priority) {
  return PRIORITY_WEIGHT[priority] || 2;
}

export function sortWorkItems(items, sortBy) {
  const sorted = [...items];
  if (sortBy === 'due') {
    sorted.sort((a, b) => {
      const ad = a.dueSort ?? 99999;
      const bd = b.dueSort ?? 99999;
      if (ad !== bd) return ad - bd;
      return (b.priorityWeight || 0) - (a.priorityWeight || 0);
    });
  } else if (sortBy === 'priority') {
    sorted.sort((a, b) => (b.priorityWeight || 0) - (a.priorityWeight || 0));
  } else {
    sorted.sort((a, b) => (b.urgencyScore || 0) - (a.urgencyScore || 0));
  }
  return sorted;
}

export function formatDueDate(str) {
  if (!str) return null;
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return str;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatActivityTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
