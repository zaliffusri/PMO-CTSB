import { stripActorEmbedFromDescription } from './activityActorEmbed.js';
import { APP_TIME_ZONE } from './scheduleEmailUtils.js';
import { interpretActivitySchedule } from './activityDailyWindows.js';

/**
 * Build .ics calendar meeting invites / cancellations for Outlook, Teams, and Gmail.
 * METHOD:REQUEST auto-adds (or prompts Accept) on assignee calendars.
 * METHOD:CANCEL with the same UID removes the event when the activity is cancelled.
 *
 * Multi-day activities use RRULE daily recurrence for the same clock window each day
 * (e.g. Mon–Tue 9–11 => two 9–11 slots, not one overnight block).
 */

function cleanNotes(description) {
  const stripped = stripActorEmbedFromDescription(description);
  if (!stripped) return '';
  return stripped
    .split(/\s*\|\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter(
      (seg) =>
        !/^Imported \(accounts\):/i.test(seg)
        && !/^Imported for:/i.test(seg)
        && !/^Guests:/i.test(seg)
        && !/^__pmo_/i.test(seg),
    )
    .join(' | ')
    .trim();
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Format Date as UTC ICS timestamp: 20260804T010000Z */
export function toIcsUtc(iso) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return (
    `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}`
    + `T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`
  );
}

/** Wall-clock time in Asia/Kuala_Lumpur for TZID form (matches what users enter in PMO). */
export function toIcsLocalMalaysia(iso) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  const year = get('year');
  const month = get('month');
  const day = get('day');
  let hour = get('hour');
  if (hour === '24') hour = '00';
  return `${year}${month}${day}T${hour}${get('minute')}${get('second')}`;
}

/** Google Calendar dates param uses compact UTC without separators (same as ICS). */
export function toGoogleDatesParam(startIso, endIso) {
  const a = toIcsUtc(startIso);
  const b = toIcsUtc(endIso);
  if (!a || !b) return null;
  return `${a}/${b}`;
}

function escapeIcsText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function foldIcsLine(line) {
  const s = String(line);
  if (s.length <= 75) return s;
  let out = s.slice(0, 75);
  let rest = s.slice(75);
  while (rest.length > 0) {
    out += `\r\n ${rest.slice(0, 74)}`;
    rest = rest.slice(74);
  }
  return out;
}

function stableUid(calendarUid) {
  const raw = String(calendarUid || '').trim() || `pmo-${Date.now()}`;
  const safe = raw.replace(/[^a-zA-Z0-9._@-]/g, '-').slice(0, 120);
  return `${safe}@pmo-ctsb`;
}

/** Extract bare email from "Name <email@x.com>" or plain address. */
export function parseEmailAddress(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  const angle = s.match(/<([^>]+)>/);
  if (angle) return String(angle[1] || '').trim().toLowerCase();
  if (s.includes('@')) return s.toLowerCase();
  return '';
}

function normalizeAttendees(attendees, fallbackEmail, fallbackName) {
  const list = Array.isArray(attendees) ? attendees.slice() : [];
  if (fallbackEmail) {
    const email = parseEmailAddress(fallbackEmail) || String(fallbackEmail).trim().toLowerCase();
    if (email && !list.some((a) => parseEmailAddress(a.email || a) === email)) {
      list.push({ email, name: fallbackName || email });
    }
  }
  const seen = new Set();
  const out = [];
  for (const a of list) {
    const email = parseEmailAddress(a?.email || a) || String(a?.email || a || '').trim().toLowerCase();
    if (!email || !email.includes('@') || seen.has(email)) continue;
    seen.add(email);
    out.push({
      email,
      name: String(a?.name || email.split('@')[0] || email).trim(),
    });
  }
  return out;
}

/**
 * Monotonic ICS SEQUENCE for create / update / cancel (must increase for cancel to apply).
 */
export function nextCalendarSequence(kind = 'create') {
  const now = Math.floor(Date.now() / 1000);
  if (kind === 'create') return 0;
  if (kind === 'cancel') return now + 1;
  return Math.max(1, now);
}

/**
 * @param {'request'|'cancel'} method
 * @param {boolean} [markAsCanceled] - For Teams/Outlook: METHOD:REQUEST update that
 *   renames the meeting to "Canceled: …" so the calendar visibly shows it cancelled
 *   even when METHOD:CANCEL is ignored (common with Gmail SMTP → Microsoft 365).
 */
export function buildActivityIcs({
  title,
  description,
  location,
  startAt,
  endAt,
  calendarUid,
  sequence = 0,
  method = 'request',
  markAsCanceled = false,
  organizerEmail,
  organizerName,
  attendeeEmail,
  attendeeName,
  attendees = [],
}) {
  const schedule = interpretActivitySchedule(startAt, endAt, APP_TIME_ZONE);
  const windowStart = schedule.firstStartIso || startAt;
  const windowEnd = schedule.firstEndIso || endAt;
  const dtStart = toIcsUtc(windowStart);
  const dtEnd = toIcsUtc(windowEnd);
  const dtStamp = toIcsUtc(new Date().toISOString());
  if (!dtStart || !dtEnd || !dtStamp) return null;

  const isCancelMethod = method === 'cancel';
  const showCanceled = isCancelMethod || markAsCanceled;
  // Prefer REQUEST+Canceled title for visible Teams update; CANCEL for removal attempts.
  const icsMethod = isCancelMethod && !markAsCanceled ? 'CANCEL' : 'REQUEST';
  const status = showCanceled ? 'CANCELLED' : 'CONFIRMED';
  const notes = cleanNotes(description);
  const baseTitle = String(title || 'Activity').trim() || 'Activity';
  const summary = showCanceled
    ? (baseTitle.toLowerCase().startsWith('canceled:') ? baseTitle : `Canceled: ${baseTitle}`)
    : baseTitle;
  const descParts = [
    showCanceled ? 'This activity has been cancelled in PMO CTSB.' : null,
    schedule.mode === 'daily' && schedule.dayCount > 1
      ? `Repeats daily at the same time for ${schedule.dayCount} days.`
      : null,
    notes || null,
    'Scheduled via PMO CTSB',
  ].filter(Boolean);

  const orgEmail = parseEmailAddress(organizerEmail) || String(organizerEmail || '').trim();
  const party = normalizeAttendees(attendees, attendeeEmail, attendeeName);
  const rrule = schedule.mode === 'daily' && schedule.dayCount > 1
    ? `RRULE:FREQ=DAILY;COUNT=${schedule.dayCount}`
    : null;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Microsoft Corporation//Outlook 16.0 MIMEDIR//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${icsMethod}`,
    'BEGIN:VEVENT',
    `UID:${stableUid(calendarUid)}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    rrule,
    `SUMMARY:${escapeIcsText(summary)}`,
    `DESCRIPTION:${escapeIcsText(descParts.join('\\n'))}`,
    location ? `LOCATION:${escapeIcsText(location)}` : null,
    `STATUS:${status}`,
    `SEQUENCE:${Math.max(0, Number(sequence) || 0)}`,
    `LAST-MODIFIED:${dtStamp}`,
    showCanceled ? 'TRANSP:TRANSPARENT' : 'TRANSP:OPAQUE',
    'CLASS:PUBLIC',
    showCanceled ? 'X-MICROSOFT-CDO-BUSYSTATUS:FREE' : 'X-MICROSOFT-CDO-BUSYSTATUS:BUSY',
    showCanceled ? 'X-MICROSOFT-CDO-INTENDEDSTATUS:FREE' : 'X-MICROSOFT-CDO-INTENDEDSTATUS:BUSY',
    'X-MICROSOFT-CDO-IMPORTANCE:1',
    'X-MICROSOFT-DISALLOW-COUNTER:TRUE',
    'PRIORITY:5',
  ].filter(Boolean);

  if (orgEmail) {
    const cn = escapeIcsText(organizerName || orgEmail);
    lines.push(`ORGANIZER;CN=${cn}:mailto:${orgEmail}`);
  }

  for (const person of party) {
    const cn = escapeIcsText(person.name || person.email);
    if (showCanceled) {
      lines.push(
        `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=DECLINED;RSVP=FALSE;CN=${cn}:mailto:${person.email}`,
      );
    } else {
      lines.push(
        `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=${cn}:mailto:${person.email}`,
      );
    }
  }

  lines.push('END:VEVENT', 'END:VCALENDAR');
  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}

export function buildGoogleCalendarUrl({
  title,
  description,
  location,
  startAt,
  endAt,
}) {
  const schedule = interpretActivitySchedule(startAt, endAt, APP_TIME_ZONE);
  const windowStart = schedule.firstStartIso || startAt;
  const windowEnd = schedule.firstEndIso || endAt;
  const dates = toGoogleDatesParam(windowStart, windowEnd);
  if (!dates) return null;
  const notes = cleanNotes(description);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title || 'Activity',
    dates,
  });
  if (location) params.set('location', String(location));
  if (notes) params.set('details', notes);
  if (schedule.mode === 'daily' && schedule.dayCount > 1) {
    params.set('recur', `RRULE:FREQ=DAILY;COUNT=${schedule.dayCount}`);
  }
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function buildOutlookCalendarUrl({
  title,
  description,
  location,
  startAt,
  endAt,
}) {
  const schedule = interpretActivitySchedule(startAt, endAt, APP_TIME_ZONE);
  const windowStart = schedule.firstStartIso || startAt;
  const windowEnd = schedule.firstEndIso || endAt;
  const start = new Date(windowStart);
  const end = new Date(windowEnd);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return null;
  const notes = [
    cleanNotes(description),
    schedule.mode === 'daily' && schedule.dayCount > 1
      ? `Repeats daily for ${schedule.dayCount} days at the same time (open the attached .ics for the full series).`
      : null,
  ].filter(Boolean).join('\n');
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: title || 'Activity',
    startdt: start.toISOString(),
    enddt: end.toISOString(),
  });
  if (location) params.set('location', String(location));
  if (notes) params.set('body', notes);
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}
