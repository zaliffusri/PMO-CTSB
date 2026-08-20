import { activityLogicalGroupKey } from '../../lib/activityLogicalGroup.js';
import { interpretActivitySchedule } from '../../lib/activityDailyWindows.js';

export const CANCELLED_ACTIVITY_KEYS_STORAGE = 'pmo_cancelled_activity_keys_v1';

export function readCancelledActivityKeys() {
  try {
    const raw = sessionStorage.getItem(CANCELLED_ACTIVITY_KEYS_STORAGE);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

export function rememberCancelledActivityKey(key) {
  if (!key) return;
  const next = readCancelledActivityKeys();
  next.add(String(key));
  try {
    sessionStorage.setItem(CANCELLED_ACTIVITY_KEYS_STORAGE, JSON.stringify([...next]));
  } catch {
    /* ignore quota */
  }
}

export function withoutCancelledActivityKeys(list) {
  const cancelled = readCancelledActivityKeys();
  if (!cancelled.size) return list || [];
  return (list || []).filter((row) => !cancelled.has(String(activityLogicalGroupKey(row))));
}

export function getMonthRange(year, month) {
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const monthEndExclusive = new Date(year, month, 1);
  return {
    /** Full ISO instants for API overlap (avoid UTC day shift from toISOString().slice(0, 10)). */
    rangeStartIso: first.toISOString(),
    rangeEndExclusiveIso: monthEndExclusive.toISOString(),
    firstDayOfWeek: first.getDay(),
    daysInMonth: last.getDate(),
  };
}

export function getCalendarGrid(year, month) {
  const { firstDayOfWeek, daysInMonth } = getMonthRange(year, month);
  const weeks = [];
  let week = [];
  for (let i = 0; i < firstDayOfWeek; i++) week.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    week.push(d);
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  return weeks;
}

export function isActivityOnDate(activity, year, month, day) {
  const start = new Date(activity.start_at).getTime();
  const end = new Date(activity.end_at).getTime();
  const dayStart = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
  const dayEnd = new Date(year, month - 1, day + 1, 0, 0, 0, 0).getTime();
  return start < dayEnd && end > dayStart;
}

/**
 * One "Log activity" with several people creates one DB row per person. For the calendar,
 * merge those rows into a single chip with all assignee names grouped together.
 *
 * Group key is shared with the API (delete whole logical activity) â€” see lib/activityLogicalGroup.js.
 */
export function groupActivitiesForCalendar(activities) {
  const map = new Map();
  for (const a of activities) {
    const key = activityLogicalGroupKey(a);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(a);
  }
  const result = [];
  for (const [, group] of map) {
    group.sort((x, y) => (x.id ?? 0) - (y.id ?? 0));
    const primary = group[0];
    const names = [...new Set(group.map((g) => g.person_name).filter(Boolean))];
    let person_name = names.length ? names.join(', ') : (primary.person_name ?? '');
    const ext = String(primary.external_attendees || '').trim();
    if (ext) {
      person_name = person_name ? `${person_name}; ${ext}` : ext;
    }
    const person_ids = [...new Set(group.map((g) => g.person_id).filter((x) => x != null))];
    // Prefer earliest create + latest update across assignee rows.
    let created_at = primary.created_at;
    let created_by_name = primary.created_by_name;
    let created_by_user_id = primary.created_by_user_id;
    let updated_at = primary.updated_at;
    let updated_by_name = primary.updated_by_name;
    let updated_by_user_id = primary.updated_by_user_id;
    for (const g of group) {
      if (g.created_at && (!created_at || new Date(g.created_at) < new Date(created_at))) {
        created_at = g.created_at;
        created_by_name = g.created_by_name || created_by_name;
        created_by_user_id = g.created_by_user_id ?? created_by_user_id;
      }
      if (g.updated_at && (!updated_at || new Date(g.updated_at) > new Date(updated_at))) {
        updated_at = g.updated_at;
        updated_by_name = g.updated_by_name || updated_by_name;
        updated_by_user_id = g.updated_by_user_id ?? updated_by_user_id;
      }
      if (!created_by_name && g.created_by_name) created_by_name = g.created_by_name;
      if (!updated_by_name && g.updated_by_name) updated_by_name = g.updated_by_name;
    }
    result.push({
      ...primary,
      person_name,
      person_ids,
      created_at,
      created_by_name,
      created_by_user_id,
      updated_at,
      updated_by_name,
      updated_by_user_id,
    });
  }
  result.sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
  return result;
}

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Maps API type to CSS suffix (legacy `task` â†’ outstation). */
export function activityCssClass(type) {
  if (type === 'task') return 'outstation';
  if (
    type === 'meeting' ||
    type === 'outstation' ||
    type === 'other' ||
    type === 'uat' ||
    type === 'urs' ||
    type === 'fat' ||
    type === 'demo' ||
    type === 'training' ||
    type === 'go-live' ||
    type === 'tender'
  ) return type;
  return 'other';
}

export const ACTIVITY_TYPE_OPTIONS = [
  { value: 'meeting', label: 'Meeting' },
  { value: 'outstation', label: 'Outstation' },
  { value: 'other', label: 'Other' },
  { value: 'uat', label: 'UAT' },
  { value: 'urs', label: 'URS' },
  { value: 'fat', label: 'FAT' },
  { value: 'demo', label: 'DEMO' },
  { value: 'training', label: 'TRAINING' },
  { value: 'go-live', label: 'GO-LIVE' },
  { value: 'tender', label: 'TENDER' },
];
export const ACTIVITY_TYPE_LABELS = Object.fromEntries(ACTIVITY_TYPE_OPTIONS.map((x) => [x.value, x.label]));
ACTIVITY_TYPE_LABELS.task = 'Outstation';
export function activityTypeLabel(type) {
  return ACTIVITY_TYPE_LABELS[type] || String(type || 'Other').toUpperCase();
}

export const DAY_NAMES_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
/** Max activity chips shown per calendar day before "See more". */
export const CALENDAR_DAY_MAX_VISIBLE = 3;

export const LEGEND_TYPES = [
  { css: 'meeting', label: 'Meeting' },
  { css: 'outstation', label: 'Outstation' },
  { css: 'other', label: 'Other' },
  { css: 'uat', label: 'UAT' },
  { css: 'urs', label: 'URS' },
  { css: 'fat', label: 'FAT' },
  { css: 'demo', label: 'DEMO' },
  { css: 'training', label: 'Training' },
  { css: 'go-live', label: 'Go-live' },
  { css: 'tender', label: 'Tender' },
];

export function formatActivityShortTime(a) {
  const start = new Date(a.start_at);
  if (!Number.isFinite(start.getTime())) return '';
  return start.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/** Local wall time for `<input type="datetime-local" />`. Never use `.slice(0,16)` on ISO strings (Z/offset shifts the wrong way). */
export function toDatetimeLocalValue(iso) {
  if (iso == null || iso === '') return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatActivityTimeRange(a) {
  const schedule = interpretActivitySchedule(a.start_at, a.end_at);
  if (schedule.mode === 'daily' && schedule.dayCount > 1) {
    const first = new Date(schedule.firstStartIso);
    const last = new Date(schedule.lastStartIso);
    const endClock = new Date(schedule.firstEndIso);
    const dateOpts = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
    const timeOpts = { hour: '2-digit', minute: '2-digit' };
    return `${first.toLocaleTimeString(undefined, timeOpts)} â€“ ${endClock.toLocaleTimeString(undefined, timeOpts)} each day Â· ${first.toLocaleDateString(undefined, dateOpts)} â€“ ${last.toLocaleDateString(undefined, dateOpts)}`;
  }
  const start = new Date(a.start_at);
  const end = new Date(a.end_at);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    return `${a.start_at ?? ''} â€“ ${a.end_at ?? ''}`;
  }
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();
  const dateOpts = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
  const timeOpts = { hour: '2-digit', minute: '2-digit' };
  if (sameDay) {
    return `${start.toLocaleDateString(undefined, dateOpts)} Â· ${start.toLocaleTimeString(undefined, timeOpts)} â€“ ${end.toLocaleTimeString(undefined, timeOpts)}`;
  }
  const fullOpts = { ...dateOpts, ...timeOpts };
  return `${start.toLocaleString(undefined, fullOpts)} â€“ ${end.toLocaleString(undefined, fullOpts)}`;
}

export function formatAuditWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** True only when the activity was edited after create (not the initial save). */
export function activityWasEditedAfterCreate(a) {
  if (!a?.updated_by_name || !a?.updated_at || !a?.created_at) return false;
  const createdMs = new Date(a.created_at).getTime();
  const updatedMs = new Date(a.updated_at).getTime();
  if (!Number.isFinite(createdMs) || !Number.isFinite(updatedMs)) return false;
  return updatedMs > createdMs + 2000;
}

/** Calendar popovers / detail sheet: hide import audit text; real notes still show; full description stays in edit & API. */
export function activityDescriptionForCalendarDisplay(description) {
  const raw = String(description || '').trim();
  if (!raw) return '';
  const isImportAuditSegment = (seg) =>
    /^Imported \(accounts\):/i.test(seg) ||
    /^Imported for:/i.test(seg) ||
    /^Guests:/i.test(seg) ||
    /^__pmo_act_audit__:/i.test(seg);
  const kept = raw
    .split(/\s*\|\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((seg) => !isImportAuditSegment(seg));
  return kept.join(' | ');
}

/**
 * Convert `datetime-local` value (local wall time) to UTC ISO before saving.
 * Parse parts explicitly so browsers never treat the string as UTC.
 */
export function toApiDateTimeValue(localValue) {
  if (!localValue) return localValue;
  const m = String(localValue).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) {
    const d = new Date(localValue);
    if (!Number.isFinite(d.getTime())) return localValue;
    return d.toISOString();
  }
  const d = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    0,
    0,
  );
  if (!Number.isFinite(d.getTime())) return localValue;
  return d.toISOString();
}

export function shouldUseMobileActivityDetail() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 767px)').matches || window.matchMedia('(hover: none)').matches;
}

export function escapeHtml(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function parseCsvRows(text) {
  const rows = [];
  let i = 0;
  let field = '';
  let row = [];
  let inQuotes = false;
  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { rows.push(row); row = []; };
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i += 1; continue;
      }
      field += ch; i += 1; continue;
    }
    if (ch === '"') { inQuotes = true; i += 1; continue; }
    if (ch === ',') { pushField(); i += 1; continue; }
    if (ch === '\n') { pushField(); pushRow(); i += 1; continue; }
    if (ch === '\r') { i += 1; continue; }
    field += ch; i += 1;
  }
  if (field.length > 0 || row.length > 0) { pushField(); pushRow(); }
  return rows;
}

export function normalizeHeader(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[\\/|]+/g, ' ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

let xlsxModulePromise = null;
export async function getXlsxModule() {
  if (!xlsxModulePromise) {
    xlsxModulePromise = import('https://esm.sh/xlsx@0.18.5');
  }
  return xlsxModulePromise;
}

export function tableRowsToObjects(rows) {
  const nonEmptyRows = rows
    .map((r) => (Array.isArray(r) ? r.map((v) => String(v ?? '').trim()) : []))
    .filter((r) => r.some((v) => v !== ''));
  if (nonEmptyRows.length <= 1) return [];
  const headers = nonEmptyRows[0].map(normalizeHeader);
  return nonEmptyRows.slice(1).map((r) => {
    const item = {};
    headers.forEach((h, idx) => { item[h || `col_${idx}`] = String(r[idx] ?? '').trim(); });
    return item;
  });
}

export function firstNonEmpty(row, keys) {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

export function parseReportDateValue(dateLike) {
  const raw = String(dateLike || '').trim();
  if (!raw) return null;
  // Support dd.mm.yyyy / dd-mm-yyyy / dd/mm/yyyy from imported spreadsheets.
  const m = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yyyy = Number(m[3]);
    if (yyyy >= 1900 && mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      const d = new Date(yyyy, mm - 1, dd, 0, 0, 0, 0);
      if (Number.isFinite(d.getTime())) return d;
    }
  }
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return null;
  return d;
}

/** Key for rows that describe the same meeting (import uses fixed 9:00â€“17:00 local per date). */
export function importMeetingDedupeKey(row) {
  const t = row?.task;
  if (!t) return '';
  const title = String(t.title || '').trim().toLowerCase();
  const loc = String(t.location || '').trim().toLowerCase();
  const start = String(t.start_at || '');
  const end = String(t.end_at || '');
  const proj = t.project_id != null && t.project_id !== '' ? String(t.project_id) : '';
  const client = String(row.client || '').trim().toLowerCase();
  const extPart = String(t.external_attendees || '').trim();
  const extKey = extPart ? `|${extPart.toLowerCase()}` : '';
  return `${start}|${end}|${title}|${loc}|${proj}|${client}${extKey}`;
}

/**
 * Combine valid import rows that share the same meeting into one row (one activity group on confirm).
 * Order follows first occurrence in the file.
 */
export function mergeValidImportPreviewRows(validRows) {
  const map = new Map();
  for (const row of validRows) {
    const k = importMeetingDedupeKey(row);
    if (!k) continue;
    if (!map.has(k)) {
      map.set(k, {
        ...row,
        task: {
          ...row.task,
          person_ids: [...(row.task.person_ids || [])],
        },
      });
      continue;
    }
    const acc = map.get(k);
    const idSet = new Set([...(acc.task.person_ids || []), ...(row.task.person_ids || [])]);
    const nameParts = [
      ...String(acc.resolved_staff || '').split(',').map((s) => s.trim()).filter(Boolean),
      ...String(row.resolved_staff || '').split(',').map((s) => s.trim()).filter(Boolean),
    ];
    const namesUnique = [...new Set(nameParts)];
    const resolved = namesUnique.join(', ');
    const extParts = [
      ...String(acc.task.external_attendees || '').split(',').map((s) => s.trim()).filter(Boolean),
      ...String(row.task.external_attendees || '').split(',').map((s) => s.trim()).filter(Boolean),
    ];
    const extMerged = [...new Set(extParts)].join(', ');
    const descParts = [];
    if (resolved) descParts.push(`Imported (accounts): ${resolved}`);
    if (extMerged) descParts.push(`Guests: ${extMerged}`);
    acc.task = {
      ...acc.task,
      person_ids: [...idSet],
      external_attendees: extMerged || undefined,
      description: descParts.length ? descParts.join(' | ') : undefined,
    };
    acc.resolved_staff = resolved;
    const prevStaff = String(acc.staff_name || '').trim();
    const nextStaff = String(row.staff_name || '').trim();
    acc.staff_name = [prevStaff, nextStaff].filter(Boolean).join('; ');
  }
  return [...map.values()];
}

export function parseImportedReportText(text) {
  const src = String(text || '');
  if (!src.trim()) return [];
  if (src.includes('<table')) {
    const doc = new DOMParser().parseFromString(src, 'text/html');
    const trs = [...doc.querySelectorAll('table tr')];
    if (trs.length === 0) return [];
    const headers = [...trs[0].querySelectorAll('th,td')].map((x) => normalizeHeader(x.textContent));
    const out = [];
    trs.slice(1).forEach((tr) => {
      const cells = [...tr.querySelectorAll('td')];
      if (!cells.length) return;
      const item = {};
      cells.forEach((c, idx) => { item[headers[idx] || `col_${idx}`] = String(c.textContent || '').trim(); });
      out.push(item);
    });
    return out;
  }
  const rows = parseCsvRows(src);
  if (rows.length <= 1) return [];
  const headers = rows[0].map(normalizeHeader);
  return rows.slice(1).filter((r) => r.some((x) => String(x || '').trim() !== '')).map((r) => {
    const item = {};
    r.forEach((v, idx) => { item[headers[idx] || `col_${idx}`] = String(v || '').trim(); });
    return item;
  });
}

/**
 * Every worksheet with a header row + data rows.
 * `__sheet` is set only when the workbook has multiple tabs (for preview / error messages).
 */
export function xlsxWorkbookToImportRows(wb, XLSX) {
  const names = Array.isArray(wb?.SheetNames) ? wb.SheetNames : [];
  const tagSheet = names.length > 1;
  const combined = [];
  for (const sheetName of names) {
    try {
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;
      const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
      const objs = tableRowsToObjects(matrix);
      for (const o of objs) {
        combined.push(tagSheet ? { ...o, __sheet: sheetName } : { ...o });
      }
    } catch (e) {
      console.warn(`import: skipped sheet "${sheetName}"`, e?.message || e);
    }
  }
  return combined;
}

export async function parseImportedReportFile(file) {
  const lower = String(file?.name || '').toLowerCase();
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    const XLSX = await getXlsxModule();
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    return xlsxWorkbookToImportRows(wb, XLSX);
  }
  const text = await file.text();
  return parseImportedReportText(text);
}

/** Return each day-of-month covered by activity interval within the visible month. */
export function activityCoveredDaysInMonth(activity, year, month) {
  const start = new Date(activity.start_at).getTime();
  const end = new Date(activity.end_at).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  const { daysInMonth } = getMonthRange(year, month);
  const result = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dayStart = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
    const dayEnd = new Date(year, month - 1, day + 1, 0, 0, 0, 0).getTime();
    if (start < dayEnd && end > dayStart) result.push(day);
  }
  return result;
}
