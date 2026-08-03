import { stripActorEmbedFromDescription } from './activityActorEmbed.js';
import { APP_TIME_ZONE } from './scheduleEmailUtils.js';

/**
 * Build .ics calendar invites and "Add to Google Calendar" links
 * so assignees can save the exact PMO schedule times.
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

/**
 * @param {'request'|'cancel'} method
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
  organizerEmail,
  organizerName,
  attendeeEmail,
  attendeeName,
}) {
  const dtStart = toIcsLocalMalaysia(startAt);
  const dtEnd = toIcsLocalMalaysia(endAt);
  const dtStamp = toIcsUtc(new Date().toISOString());
  if (!dtStart || !dtEnd || !dtStamp) return null;

  const isCancel = method === 'cancel';
  const icsMethod = isCancel ? 'CANCEL' : 'REQUEST';
  const status = isCancel ? 'CANCELLED' : 'CONFIRMED';
  const notes = cleanNotes(description);
  const summary = isCancel ? `Cancelled: ${title || 'Activity'}` : (title || 'Activity');
  const descParts = [
    notes || null,
    'Scheduled via PMO CTSB',
  ].filter(Boolean);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PMO CTSB//Calendar//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${icsMethod}`,
    'BEGIN:VTIMEZONE',
    `TZID:${APP_TIME_ZONE}`,
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0800',
    'TZOFFSETTO:+0800',
    'TZNAME:MYT',
    'DTSTART:19700101T000000',
    'END:STANDARD',
    'END:VTIMEZONE',
    'BEGIN:VEVENT',
    `UID:${stableUid(calendarUid)}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART;TZID=${APP_TIME_ZONE}:${dtStart}`,
    `DTEND;TZID=${APP_TIME_ZONE}:${dtEnd}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `DESCRIPTION:${escapeIcsText(descParts.join('\\n'))}`,
    location ? `LOCATION:${escapeIcsText(location)}` : null,
    `STATUS:${status}`,
    `SEQUENCE:${Math.max(0, Number(sequence) || 0)}`,
    'TRANSP:OPAQUE',
  ].filter(Boolean);

  if (organizerEmail) {
    const cn = escapeIcsText(organizerName || organizerEmail);
    lines.push(`ORGANIZER;CN=${cn}:mailto:${String(organizerEmail).trim()}`);
  }
  if (attendeeEmail) {
    const cn = escapeIcsText(attendeeName || attendeeEmail);
    lines.push(
      `ATTENDEE;CN=${cn};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${String(attendeeEmail).trim()}`,
    );
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
  const dates = toGoogleDatesParam(startAt, endAt);
  if (!dates) return null;
  const notes = cleanNotes(description);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title || 'Activity',
    dates,
  });
  if (location) params.set('location', String(location));
  if (notes) params.set('details', notes);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function buildOutlookCalendarUrl({
  title,
  description,
  location,
  startAt,
  endAt,
}) {
  const start = new Date(startAt);
  const end = new Date(endAt);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return null;
  const notes = cleanNotes(description);
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
