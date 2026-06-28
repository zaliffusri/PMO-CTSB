import { activityLogicalGroupKey } from './activityLogicalGroup.js';

const ACTIVITY_TYPE_LABELS = {
  meeting: 'Meeting',
  outstation: 'Outstation',
  other: 'Other',
  uat: 'UAT',
  urs: 'URS',
  fat: 'FAT',
  demo: 'DEMO',
  training: 'TRAINING',
  'go-live': 'GO-LIVE',
  tender: 'TENDER',
  task: 'Outstation',
};

function normalizeType(type) {
  if (type === 'task') return 'outstation';
  return String(type || 'other');
}

function typeLabel(type) {
  return ACTIVITY_TYPE_LABELS[normalizeType(type)] || String(type || 'Activity');
}

function formatEmailDateTime(iso) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return String(iso || '—');
  return d.toLocaleString('en-MY', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function formatEmailDate(iso) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return String(iso || '—');
  return d.toLocaleDateString('en-MY', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatEmailTimeRange(startAt, endAt) {
  const start = new Date(startAt);
  const end = new Date(endAt);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    return `${startAt || ''} – ${endAt || ''}`;
  }
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();
  const timeOpts = { hour: '2-digit', minute: '2-digit', hour12: true };
  if (sameDay) {
    return `${start.toLocaleTimeString('en-MY', timeOpts)} – ${end.toLocaleTimeString('en-MY', timeOpts)}`;
  }
  return `${formatEmailDateTime(startAt)} – ${formatEmailDateTime(endAt)}`;
}

/** Merge per-person activity rows into one logical activity for schedule emails. */
export function groupActivitiesForScheduleEmail(activities) {
  const map = new Map();
  for (const a of activities || []) {
    const key = activityLogicalGroupKey(a);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(a);
  }
  const result = [];
  for (const group of map.values()) {
    group.sort((x, y) => (x.id ?? 0) - (y.id ?? 0));
    const primary = group[0];
    const names = [...new Set(group.map((g) => g.person_name).filter(Boolean))];
    let assignees = names.join(', ');
    const ext = String(primary.external_attendees || '').trim();
    if (ext) assignees = assignees ? `${assignees}; ${ext}` : ext;
    const typeKey = normalizeType(primary.type);
    result.push({
      id: primary.id,
      title: primary.title,
      typeKey,
      typeLabel: typeLabel(primary.type),
      location: primary.location,
      projectName: primary.project_name || null,
      description: primary.description || null,
      startAt: primary.start_at,
      endAt: primary.end_at,
      dateLabel: formatEmailDate(primary.start_at),
      timeLabel: formatEmailTimeRange(primary.start_at, primary.end_at),
      startAtLabel: formatEmailDateTime(primary.start_at),
      endAtLabel: formatEmailDateTime(primary.end_at),
      assignees,
      external_attendees: ext || null,
      person_ids: group.map((g) => g.person_id).filter((x) => x != null),
    });
  }
  result.sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
  return result;
}

export function extractEmailsFromText(text) {
  const raw = String(text || '');
  const found = raw.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
  return [...new Set(found.map((e) => e.toLowerCase()))];
}

export function resolveScheduleRecipients(store, { mode, customEmails = [], activityRows = [] }) {
  const emails = new Set();
  const add = (email) => {
    const e = String(email || '').trim().toLowerCase();
    if (e && e.includes('@')) emails.add(e);
  };

  if (mode === 'custom') {
    customEmails.forEach(add);
    return [...emails];
  }

  if (mode === 'assignees') {
    for (const row of activityRows) {
      for (const pid of row.person_ids || []) {
        const u = store.findUserById(pid);
        add(u?.email);
        if (!u?.email && u?.name) {
          const pe = store.people.find(
            (p) => String(p.name || '').trim().toLowerCase() === String(u.name || '').trim().toLowerCase(),
          );
          add(pe?.email);
        }
      }
      extractEmailsFromText(row.external_attendees).forEach(add);
    }
    return [...emails];
  }

  // team — all people + active users
  store.people.forEach((p) => add(p.email));
  store.users.filter((u) => u.active !== false).forEach((u) => add(u.email));
  return [...emails];
}

export { formatEmailDateTime, formatEmailTimeRange, typeLabel };
