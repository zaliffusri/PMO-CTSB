import { activityLogicalGroupKey } from './activityLogicalGroup.js';
import { interpretActivitySchedule } from './activityDailyWindows.js';

/** PMO CTSB operates in Malaysia — always format email times in this zone (Vercel is UTC). */
export const APP_TIME_ZONE = 'Asia/Kuala_Lumpur';

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
    timeZone: APP_TIME_ZONE,
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
    timeZone: APP_TIME_ZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatEmailClock(iso) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return String(iso || '—');
  return d.toLocaleTimeString('en-MY', {
    timeZone: APP_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function sameDayInAppTz(a, b) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(a) === fmt.format(b);
}

/**
 * Human schedule label for emails.
 * Multi-day 9am→11am = "09:00 am – 11:00 am each day · Mon … – Tue …"
 */
function formatEmailScheduleWhen(startAt, endAt) {
  const schedule = interpretActivitySchedule(startAt, endAt, APP_TIME_ZONE);
  if (schedule.mode === 'daily' && schedule.dayCount > 1) {
    const timePart = `${formatEmailClock(schedule.firstStartIso)} – ${formatEmailClock(schedule.firstEndIso)}`;
    const datePart = `${formatEmailDate(schedule.firstStartIso)} – ${formatEmailDate(schedule.lastStartIso)}`;
    return `${timePart} each day · ${datePart} (${schedule.dayCount} days)`;
  }
  if (schedule.mode === 'single' || sameDayInAppTz(new Date(startAt), new Date(endAt))) {
    return `${formatEmailDate(startAt)} · ${formatEmailClock(startAt)} – ${formatEmailClock(endAt)}`;
  }
  return `${formatEmailDateTime(startAt)} → ${formatEmailDateTime(endAt)}`;
}

function formatEmailTimeRange(startAt, endAt) {
  const schedule = interpretActivitySchedule(startAt, endAt, APP_TIME_ZONE);
  if (schedule.mode === 'daily' && schedule.dayCount > 1) {
    return `${formatEmailClock(schedule.firstStartIso)} – ${formatEmailClock(schedule.firstEndIso)} each day`;
  }
  const start = new Date(startAt);
  const end = new Date(endAt);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    return `${startAt || ''} – ${endAt || ''}`;
  }
  const timeOpts = {
    timeZone: APP_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  };
  if (sameDayInAppTz(start, end)) {
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
    const whenLabel = formatEmailScheduleWhen(primary.start_at, primary.end_at);
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
      whenLabel,
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

export { formatEmailDateTime, formatEmailTimeRange, formatEmailScheduleWhen, typeLabel };
