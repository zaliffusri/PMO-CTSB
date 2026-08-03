/**
 * Multi-day PMO activities mean the same daily time window on each day,
 * not one continuous block through overnight hours.
 *
 * Example: Mon 9:00 → Tue 11:00  =>  Mon 9–11 and Tue 9–11
 */

const DEFAULT_TZ = 'Asia/Kuala_Lumpur';

function pad2(n) {
  return String(n).padStart(2, '0');
}

export function zonedDateTimeParts(isoOrDate, timeZone = DEFAULT_TZ) {
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (!Number.isFinite(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  let hour = get('hour');
  if (hour === '24') hour = '00';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(hour),
    minute: Number(get('minute')),
    second: Number(get('second') || 0),
  };
}

function dayKey(parts) {
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

function addCalendarDays(year, month, day, delta) {
  const next = new Date(Date.UTC(year, month - 1, day + delta));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
}

/**
 * Asia/Kuala_Lumpur is UTC+8 year-round — convert wall clock to UTC ISO.
 */
export function malaysiaWallToUtcIso(year, month, day, hour = 0, minute = 0, second = 0) {
  const ms = Date.UTC(year, month - 1, day, hour - 8, minute, second, 0);
  return new Date(ms).toISOString();
}

/**
 * @returns {{
 *   mode: 'single'|'daily'|'continuous',
 *   dayCount: number,
 *   windows: Array<{ startIso: string, endIso: string }>,
 *   firstStartIso: string,
 *   firstEndIso: string,
 *   lastStartIso: string,
 *   lastEndIso: string,
 * }}
 */
export function interpretActivitySchedule(startAt, endAt, timeZone = DEFAULT_TZ) {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const fallback = {
    mode: 'single',
    dayCount: 1,
    windows: [{ startIso: String(startAt || ''), endIso: String(endAt || '') }],
    firstStartIso: String(startAt || ''),
    firstEndIso: String(endAt || ''),
    lastStartIso: String(startAt || ''),
    lastEndIso: String(endAt || ''),
  };

  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end.getTime() <= start.getTime()) {
    return fallback;
  }

  const sp = zonedDateTimeParts(start, timeZone);
  const ep = zonedDateTimeParts(end, timeZone);
  if (!sp || !ep) return fallback;

  const startMins = sp.hour * 60 + sp.minute;
  const endMins = ep.hour * 60 + ep.minute;
  const sameDay = dayKey(sp) === dayKey(ep);

  if (sameDay) {
    const window = { startIso: start.toISOString(), endIso: end.toISOString() };
    return {
      mode: 'single',
      dayCount: 1,
      windows: [window],
      firstStartIso: window.startIso,
      firstEndIso: window.endIso,
      lastStartIso: window.startIso,
      lastEndIso: window.endIso,
    };
  }

  // Multi-day with a normal same-day window (e.g. 09:00–11:00 each day).
  if (endMins > startMins) {
    const windows = [];
    let cursor = { year: sp.year, month: sp.month, day: sp.day };
    const last = { year: ep.year, month: ep.month, day: ep.day };
    for (let i = 0; i < 400; i += 1) {
      windows.push({
        startIso: malaysiaWallToUtcIso(cursor.year, cursor.month, cursor.day, sp.hour, sp.minute, sp.second),
        endIso: malaysiaWallToUtcIso(cursor.year, cursor.month, cursor.day, ep.hour, ep.minute, ep.second),
      });
      if (cursor.year === last.year && cursor.month === last.month && cursor.day === last.day) break;
      cursor = addCalendarDays(cursor.year, cursor.month, cursor.day, 1);
    }
    return {
      mode: 'daily',
      dayCount: windows.length,
      windows,
      firstStartIso: windows[0].startIso,
      firstEndIso: windows[0].endIso,
      lastStartIso: windows[windows.length - 1].startIso,
      lastEndIso: windows[windows.length - 1].endIso,
    };
  }

  // Overnight / continuous span (end clock earlier than start clock across days).
  const window = { startIso: start.toISOString(), endIso: end.toISOString() };
  return {
    mode: 'continuous',
    dayCount: 1,
    windows: [window],
    firstStartIso: window.startIso,
    firstEndIso: window.endIso,
    lastStartIso: window.startIso,
    lastEndIso: window.endIso,
  };
}

export function activityOccursOnLocalDate(activity, year, month, day, timeZone = DEFAULT_TZ) {
  const schedule = interpretActivitySchedule(activity?.start_at, activity?.end_at, timeZone);
  if (schedule.mode === 'daily') {
    const key = `${year}-${pad2(month)}-${pad2(day)}`;
    return schedule.windows.some((w) => {
      const p = zonedDateTimeParts(w.startIso, timeZone);
      return p && dayKey(p) === key;
    });
  }
  const start = new Date(activity.start_at).getTime();
  const end = new Date(activity.end_at).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  const dayStart = malaysiaWallToUtcIso(year, month, day, 0, 0, 0);
  const next = addCalendarDays(year, month, day, 1);
  const dayEnd = malaysiaWallToUtcIso(next.year, next.month, next.day, 0, 0, 0);
  const dayStartMs = new Date(dayStart).getTime();
  const dayEndMs = new Date(dayEnd).getTime();
  return start < dayEndMs && end > dayStartMs;
}
