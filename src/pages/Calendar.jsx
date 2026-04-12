import { useState, useEffect, useLayoutEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { btnPrimary, btnSecondary, card, inputStyle } from '../styles/commonStyles';
import { useSubmitLock } from '../hooks/useSubmitLock';
import { activityLogicalGroupKey } from '../../lib/activityLogicalGroup.js';
import {
  ACTIVITY_LOCATION_OTHERS,
  DEFAULT_ACTIVITY_SITE_LOCATIONS,
  composeLocation,
  resolveLocationForForm,
} from '../constants/activityLocations';

const btnNav = { padding: '0.5rem 0.75rem', background: 'var(--surface-hover)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', cursor: 'pointer', fontSize: '1rem' };

function getMonthRange(year, month) {
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

function getCalendarGrid(year, month) {
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

function isActivityOnDate(activity, year, month, day) {
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
 * Group key is shared with the API (delete whole logical activity) — see lib/activityLogicalGroup.js.
 */
function groupActivitiesForCalendar(activities) {
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
    const person_name = names.length ? names.join(', ') : (primary.person_name ?? '');
    const person_ids = [...new Set(group.map((g) => g.person_id).filter((x) => x != null))];
    result.push({ ...primary, person_name, person_ids });
  }
  result.sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
  return result;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Maps API type to CSS suffix (legacy `task` → outstation). */
function activityCssClass(type) {
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

const ACTIVITY_TYPE_OPTIONS = [
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
const ACTIVITY_TYPE_LABELS = Object.fromEntries(ACTIVITY_TYPE_OPTIONS.map((x) => [x.value, x.label]));
ACTIVITY_TYPE_LABELS.task = 'Outstation';
function activityTypeLabel(type) {
  return ACTIVITY_TYPE_LABELS[type] || String(type || 'Other').toUpperCase();
}

const DAY_NAMES_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
/** Max activity chips shown per calendar day before "See more". */
const CALENDAR_DAY_MAX_VISIBLE = 3;

/** Local wall time for `<input type="datetime-local" />`. Never use `.slice(0,16)` on ISO strings (Z/offset shifts the wrong way). */
function toDatetimeLocalValue(iso) {
  if (iso == null || iso === '') return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatActivityTimeRange(a) {
  const start = new Date(a.start_at);
  const end = new Date(a.end_at);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    return `${a.start_at ?? ''} – ${a.end_at ?? ''}`;
  }
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();
  const dateOpts = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
  const timeOpts = { hour: '2-digit', minute: '2-digit' };
  if (sameDay) {
    return `${start.toLocaleDateString(undefined, dateOpts)} · ${start.toLocaleTimeString(undefined, timeOpts)} – ${end.toLocaleTimeString(undefined, timeOpts)}`;
  }
  const fullOpts = { ...dateOpts, ...timeOpts };
  return `${start.toLocaleString(undefined, fullOpts)} – ${end.toLocaleString(undefined, fullOpts)}`;
}

/**
 * Convert `datetime-local` value (local wall time) to UTC ISO before saving.
 * This avoids DB/server timezone defaults shifting the intended user time.
 */
function toApiDateTimeValue(localValue) {
  if (!localValue) return localValue;
  const d = new Date(localValue);
  if (!Number.isFinite(d.getTime())) return localValue;
  return d.toISOString();
}

function shouldUseMobileActivityDetail() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 767px)').matches || window.matchMedia('(hover: none)').matches;
}

function escapeHtml(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function parseCsvRows(text) {
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

function normalizeHeader(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[\\/|]+/g, ' ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

let xlsxModulePromise = null;
async function getXlsxModule() {
  if (!xlsxModulePromise) {
    xlsxModulePromise = import('https://esm.sh/xlsx@0.18.5');
  }
  return xlsxModulePromise;
}

function tableRowsToObjects(rows) {
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

function firstNonEmpty(row, keys) {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function parseReportDateValue(dateLike) {
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

/** Key for rows that describe the same meeting (import uses fixed 9:00–17:00 local per date). */
function importMeetingDedupeKey(row) {
  const t = row?.task;
  if (!t) return '';
  const title = String(t.title || '').trim().toLowerCase();
  const loc = String(t.location || '').trim().toLowerCase();
  const start = String(t.start_at || '');
  const end = String(t.end_at || '');
  const proj = t.project_id != null && t.project_id !== '' ? String(t.project_id) : '';
  const client = String(row.client || '').trim().toLowerCase();
  return `${start}|${end}|${title}|${loc}|${proj}|${client}`;
}

/**
 * Combine valid import rows that share the same meeting into one row (one activity group on confirm).
 * Order follows first occurrence in the file.
 */
function mergeValidImportPreviewRows(validRows) {
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
    acc.task = {
      ...acc.task,
      person_ids: [...idSet],
      description: resolved ? `Imported for: ${resolved}` : undefined,
    };
    acc.resolved_staff = resolved;
    const prevStaff = String(acc.staff_name || '').trim();
    const nextStaff = String(row.staff_name || '').trim();
    acc.staff_name = [prevStaff, nextStaff].filter(Boolean).join('; ');
  }
  return [...map.values()];
}

function parseImportedReportText(text) {
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
function xlsxWorkbookToImportRows(wb, XLSX) {
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

async function parseImportedReportFile(file) {
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
function activityCoveredDaysInMonth(activity, year, month) {
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

/** Location from Settings → Locations (plus Others). */
function ActivityLocationFields({ siteLocations, preset, other, onPreset, onOther, style }) {
  return (
    <>
      <label style={style}>
        Location *
        <select value={preset} onChange={(e) => onPreset(e.target.value)} required style={inputStyle}>
          <option value="">Select location…</option>
          {siteLocations.map((loc) => (
            <option key={loc} value={loc}>
              {loc}
            </option>
          ))}
          <option value={ACTIVITY_LOCATION_OTHERS}>{ACTIVITY_LOCATION_OTHERS}</option>
        </select>
      </label>
      {preset === ACTIVITY_LOCATION_OTHERS && (
        <label style={{ gridColumn: '1 / -1' }}>
          Specify location *
          <input
            type="text"
            value={other}
            onChange={(e) => onOther(e.target.value)}
            placeholder="Custom location name"
            required
            style={inputStyle}
          />
        </label>
      )}
    </>
  );
}

function CalendarActivityChip({ activity: a, detailOpen, onToggleDetail }) {
  const rangeLabel = formatActivityTimeRange(a);
  const label = `${activityTypeLabel(a.type)}: ${a.title}. ${a.location ? `${a.location}. ` : ''}${a.person_name ?? ''}. ${rangeLabel}`;

  const handleClick = (e) => {
    e.stopPropagation();
    onToggleDetail(a.id);
  };

  return (
    <div className="calendar-activity-wrap">
      <button
        type="button"
        className={`calendar-activity calendar-activity-${activityCssClass(a.type)} calendar-activity-trigger`}
        onClick={handleClick}
        aria-label={label}
        aria-expanded={detailOpen}
        aria-haspopup="dialog"
      >
        <span className="calendar-activity-title">{a.title}</span>
        {a.project_name && <span className="calendar-activity-project">{a.project_name}</span>}
      </button>
      <div className="calendar-activity-popover" role="tooltip">
        <div className="calendar-activity-popover-title">{a.title}</div>
        <div className="calendar-activity-popover-meta">{activityTypeLabel(a.type)} · {a.person_name}</div>
        {a.project_name && <div className="calendar-activity-popover-meta">{a.project_name}</div>}
        {a.location && <div className="calendar-activity-popover-meta">{a.location}</div>}
        <div className="calendar-activity-popover-meta">{rangeLabel}</div>
        {a.description && <div className="calendar-activity-popover-desc">{a.description}</div>}
      </div>
    </div>
  );
}

function CalendarActivityDetailSheet({ activity: a, onClose, onEdit, onDelete, actionPending }) {
  if (!a) return null;
  const rangeLabel = formatActivityTimeRange(a);
  return (
    <div className="calendar-detail-backdrop" onClick={onClose} role="presentation">
      <div
        className="calendar-detail-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-detail-heading"
      >
        <div className="calendar-detail-sheet-handle" aria-hidden />
        <h3 id="calendar-detail-heading" className="calendar-detail-sheet-title">{a.title}</h3>
        <p className="calendar-detail-sheet-line"><strong>{activityTypeLabel(a.type)}</strong> · {a.person_name}</p>
        {a.project_name && <p className="calendar-detail-sheet-line">{a.project_name}</p>}
        {a.location && <p className="calendar-detail-sheet-line">{a.location}</p>}
        <p className="calendar-detail-sheet-line calendar-detail-sheet-muted">{rangeLabel}</p>
        {a.description && <p className="calendar-detail-sheet-desc">{a.description}</p>}
        <button
          type="button"
          style={{ ...btnPrimary, width: '100%', marginTop: '0.5rem' }}
          onClick={() => onEdit?.(a)}
          disabled={actionPending}
        >
          Edit activity
        </button>
        <button
          type="button"
          style={{ ...btnSecondary, width: '100%', marginTop: '0.5rem', color: 'var(--danger)' }}
          onClick={() => onDelete?.(a)}
          disabled={actionPending}
        >
          {actionPending ? 'Please wait…' : 'Delete activity'}
        </button>
        <button type="button" className="calendar-detail-close" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

function CalendarDayActivitiesSheet({
  year,
  month,
  day,
  activities: items,
  onClose,
  detailActivityId,
  onToggleDetail,
}) {
  const title = `${MONTH_NAMES[month - 1]} ${day}, ${year}`;
  return (
    <div className="calendar-detail-backdrop" onClick={onClose} role="presentation">
      <div
        className="calendar-detail-sheet calendar-day-list-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-day-list-heading"
      >
        <div className="calendar-detail-sheet-handle" aria-hidden />
        <h3 id="calendar-day-list-heading" className="calendar-detail-sheet-title">{title}</h3>
        <p className="calendar-detail-sheet-line calendar-detail-sheet-muted" style={{ marginBottom: '0.75rem' }}>
          {items.length} {items.length === 1 ? 'activity' : 'activities'}
        </p>
        <div className="calendar-day-list-inner">
          {items.map((a) => (
            <CalendarActivityChip
              key={a.id}
              activity={a}
              detailOpen={detailActivityId === a.id}
              onToggleDetail={onToggleDetail}
            />
          ))}
        </div>
        <button type="button" className="calendar-detail-close" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

export default function Calendar() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [activitySites, setActivitySites] = useState(DEFAULT_ACTIVITY_SITE_LOCATIONS);
  const [form, setForm] = useState({
    person_ids: [],
    project_id: '',
    type: 'meeting',
    title: '',
    description: '',
    locationPreset: '',
    locationOther: '',
    start_at: '',
    end_at: '',
  });
  const [personSearch, setPersonSearch] = useState('');
  const [editingActivityId, setEditingActivityId] = useState(null);
  const { user } = useAuth();
  const [detailActivityId, setDetailActivityId] = useState(null);
  const [showReport, setShowReport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const importPreviewHasSheetColumn = useMemo(
    () => Boolean(importPreview?.rows?.some((r) => r.source_sheet)),
    [importPreview],
  );
  const nonAdminUsers = useMemo(
    () => users.filter((u) => u.role !== 'admin' && u.active !== false),
    [users],
  );

  /** Day of month (1–31) when the "all activities for this day" sheet is open. */
  const [dayListDay, setDayListDay] = useState(null);
  const { pending: mutating, run: runMutation } = useSubmitLock();

  const { rangeStartIso, rangeEndExclusiveIso } = useMemo(() => getMonthRange(year, month), [year, month]);
  const grid = useMemo(() => getCalendarGrid(year, month), [year, month]);

  const loadActivities = (f, t) =>
    api.activities.list({ from: f, to: t }).then(setActivities).catch(() => setActivities([]));

  useEffect(() => {
    setLoading(true);
    loadActivities(rangeStartIso, rangeEndExclusiveIso).finally(() => setLoading(false));
  }, [rangeStartIso, rangeEndExclusiveIso]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [u, pr] = await Promise.all([api.users.list(), api.projects.list()]);
        if (!cancelled) {
          setUsers(u);
          setProjects(pr);
        }
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.settings
      .get()
      .then((s) => {
        if (cancelled) return;
        const list = Array.isArray(s.activity_locations) && s.activity_locations.length > 0
          ? s.activity_locations.map((x) => String(x).trim()).filter(Boolean)
          : DEFAULT_ACTIVITY_SITE_LOCATIONS;
        setActivitySites(list.length ? list : DEFAULT_ACTIVITY_SITE_LOCATIONS);
      })
      .catch(() => {
        if (!cancelled) setActivitySites(DEFAULT_ACTIVITY_SITE_LOCATIONS);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useLayoutEffect(() => {
    if (!showForm || !activitySites.length) return;
    setForm((f) => {
      if (f.locationPreset) return f;
      return { ...f, locationPreset: activitySites[0], locationOther: '' };
    });
  }, [showForm, activitySites]);

  useEffect(() => {
    const anyOpen = showForm || detailActivityId != null || dayListDay != null;
    if (!anyOpen) return;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (showForm) setShowForm(false);
      else if (detailActivityId != null) setDetailActivityId(null);
      else setDayListDay(null);
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [showForm, detailActivityId, dayListDay]);

  const groupedCalendarActivities = useMemo(() => groupActivitiesForCalendar(activities), [activities]);

  useEffect(() => {
    if (detailActivityId == null) return;
    if (!activities.some((x) => x.id === detailActivityId)) setDetailActivityId(null);
  }, [activities, detailActivityId]);

  const activitiesByDay = useMemo(() => {
    const byDay = {};
    for (let d = 1; d <= 31; d++) byDay[d] = [];
    groupedCalendarActivities.forEach((a) => {
      for (let d = 1; d <= 31; d++) {
        if (isActivityOnDate(a, year, month, d)) byDay[d].push(a);
      }
    });
    for (let d = 1; d <= 31; d++) {
      byDay[d].sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
    }
    return byDay;
  }, [groupedCalendarActivities, year, month]);

  useEffect(() => {
    setDayListDay(null);
  }, [year, month]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.person_ids?.length) {
      alert('Select at least one person for this activity.');
      return;
    }
    if (!form.title?.trim()) {
      alert('Enter a title for the activity.');
      return;
    }
    if (!form.start_at || !form.end_at) {
      alert('Set both start and end date/time.');
      return;
    }
    const location = composeLocation(form.locationPreset, form.locationOther);
    if (!location) {
      alert('Please select a location or enter a custom one under Others.');
      return;
    }
    await runMutation(async () => {
      try {
        if (editingActivityId != null) {
          await api.activities.update(editingActivityId, {
            person_ids: form.person_ids.map((pid) => +pid),
            project_id: form.project_id || null,
            type: form.type,
            title: form.title,
            description: form.description || null,
            location,
            start_at: toApiDateTimeValue(form.start_at),
            end_at: toApiDateTimeValue(form.end_at),
          });
        } else {
          await api.activities.create({
            person_ids: form.person_ids.map((pid) => +pid),
            project_id: form.project_id || undefined,
            type: form.type,
            title: form.title,
            description: form.description || undefined,
            location,
            start_at: toApiDateTimeValue(form.start_at),
            end_at: toApiDateTimeValue(form.end_at),
          });
        }
        setForm({
          person_ids: [],
          project_id: '',
          type: 'meeting',
          title: '',
          description: '',
          locationPreset: activitySites[0] || '',
          locationOther: '',
          start_at: '',
          end_at: '',
        });
        setPersonSearch('');
        setShowForm(false);
        setEditingActivityId(null);
        loadActivities(rangeStartIso, rangeEndExclusiveIso);
      } catch (err) {
        alert(err.message);
      }
    });
  };

  const filteredUsers = nonAdminUsers.filter((u) => {
    const q = personSearch.trim().toLowerCase();
    if (!q) return true;
    return String(u.name || '').toLowerCase().includes(q);
  });

  const togglePerson = (id) => {
    const sid = String(id);
    setForm((f) => ({
      ...f,
      person_ids: f.person_ids.includes(sid) ? f.person_ids.filter((x) => x !== sid) : [...f.person_ids, sid],
    }));
  };

  const prevMonth = () => { if (month === 1) { setMonth(12); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 12) { setMonth(1); setYear(y => y + 1); } else setMonth(m => m + 1); };
  const goToToday = () => { const d = new Date(); setYear(d.getFullYear()); setMonth(d.getMonth() + 1); };
  const isToday = (d) => d !== null && year === today.getFullYear() && month === today.getMonth() + 1 && d === today.getDate();

  const toggleActivityDetail = (id) => {
    setDayListDay(null);
    setDetailActivityId((prev) => (prev === id ? null : id));
  };

  const openCreateForm = () => {
    setEditingActivityId(null);
    setForm((f) => ({
      ...f,
      person_ids: [],
      project_id: '',
      type: 'meeting',
      title: '',
      description: '',
      locationPreset: activitySites[0] || f.locationPreset || '',
      locationOther: '',
      start_at: '',
      end_at: '',
    }));
    setPersonSearch('');
    setShowForm(true);
  };

  const openEditActivity = (a) => {
    const personIds = Array.isArray(a.person_ids) && a.person_ids.length
      ? a.person_ids.map((x) => String(x))
      : (a.person_id != null ? [String(a.person_id)] : []);
    const { preset, custom } = resolveLocationForForm(a.location, activitySites);
    setForm({
      person_ids: personIds,
      project_id: a.project_id != null ? String(a.project_id) : '',
      type: a.type === 'task' ? 'outstation' : (ACTIVITY_TYPE_OPTIONS.some((x) => x.value === a.type) ? a.type : 'meeting'),
      title: a.title || '',
      description: a.description || '',
      locationPreset: preset || (activitySites[0] || ''),
      locationOther: custom,
      start_at: toDatetimeLocalValue(a.start_at),
      end_at: toDatetimeLocalValue(a.end_at),
    });
    setPersonSearch('');
    setEditingActivityId(a.id);
    setDetailActivityId(null);
    setDayListDay(null);
    setShowForm(true);
  };

  const deleteActivity = async (a) => {
    if (!a?.id) return;
    const assigneeCount = Array.isArray(a.person_ids) && a.person_ids.length > 0 ? a.person_ids.length : 1;
    const multiHint =
      assigneeCount > 1
        ? ` All ${assigneeCount} assignee records for this activity will be removed.`
        : '';
    if (!confirm(`Delete activity "${a.title}"?${multiHint}`)) return;
    await runMutation(async () => {
      try {
        await api.activities.delete(a.id);
        setDetailActivityId(null);
        setDayListDay(null);
        if (editingActivityId === a.id) {
          setShowForm(false);
          setEditingActivityId(null);
        }
        loadActivities(rangeStartIso, rangeEndExclusiveIso);
      } catch (err) {
        alert(err.message);
      }
    });
  };

  const detailActivity = detailActivityId != null ? groupedCalendarActivities.find((x) => x.id === detailActivityId) : null;
  const dayListActivities = dayListDay != null ? (activitiesByDay[dayListDay] ?? []) : [];
  const clientByProjectId = useMemo(
    () => Object.fromEntries(projects.map((p) => [String(p.id), p.client_name || '-'])),
    [projects],
  );
  const reportRows = useMemo(() => {
    const rows = [];
    for (const a of activities) {
      const coveredDays = activityCoveredDaysInMonth(a, year, month);
      if (coveredDays.length === 0) continue;
      for (const day of coveredDays) {
        rows.push({
          sort_date: new Date(year, month - 1, day).getTime(),
          date: new Date(year, month - 1, day).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
          staff_name: a.person_name || '-',
          client: a.project_id != null ? clientByProjectId[String(a.project_id)] || '-' : '-',
          title: a.title || '-',
          location: a.location || '-',
        });
      }
    }
    rows.sort((x, y) => x.sort_date - y.sort_date || x.staff_name.localeCompare(y.staff_name));
    return rows;
  }, [activities, clientByProjectId, year, month]);

  const buildImportPreview = (editableRows, fileName = 'import-file') => {
    const userByName = new Map(nonAdminUsers.map((u) => [String(u.name || '').trim().toLowerCase(), u]));
    const userByEmail = new Map(nonAdminUsers.map((u) => [String(u.email || '').trim().toLowerCase(), u]));
    const projectByClient = new Map(
      projects
        .filter((p) => String(p.client_name || '').trim() !== '')
        .map((p) => [String(p.client_name || '').trim().toLowerCase(), p]),
    );
    const toIso = (dateLike, hh, mm) => {
      const d = parseReportDateValue(dateLike);
      if (!d) return '';
      const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm, 0, 0);
      return x.toISOString();
    };
    const rowsOut = [];
    editableRows.forEach((raw) => {
      const dateText = String(raw.date || '').trim();
      const staffText = String(raw.staff_name || '').trim();
      const title = String(raw.title || '').trim();
      const location = String(raw.location || '').trim();
      const client = String(raw.client || '').trim();
      const sourceSheet = String(raw.sheet || '').trim();
      const base = {
        row: raw.row,
        source_sheet: sourceSheet || undefined,
        date: dateText,
        staff_name: staffText,
        client: client || '-',
        title,
        location,
      };
      if (!dateText || !staffText || !title || !location) {
        rowsOut.push({ ...base, status: 'invalid', reason: 'Missing required columns (Date/Staff Name/Title/Location)' });
        return;
      }
      const startIso = toIso(dateText, 9, 0);
      const endIso = toIso(dateText, 17, 0);
      if (!startIso || !endIso) {
        rowsOut.push({ ...base, status: 'invalid', reason: `Invalid date "${dateText}"` });
        return;
      }
      const staffTokens = String(staffText).split(',').map((s) => s.trim()).filter(Boolean);
      const personIds = [];
      const resolvedNames = [];
      staffTokens.forEach((token) => {
        const key = token.toLowerCase();
        const u = key.includes('@') ? userByEmail.get(key) : userByName.get(key);
        if (u?.id != null) {
          personIds.push(Number(u.id));
          if (u.name) resolvedNames.push(String(u.name));
        }
      });
      if (personIds.length === 0) {
        rowsOut.push({ ...base, status: 'invalid', reason: `No matched user name/email for "${staffText}"` });
        return;
      }
      const project = projectByClient.get(String(client).trim().toLowerCase());
      rowsOut.push({
        ...base,
        status: 'valid',
        reason: '',
        resolved_staff: [...new Set(resolvedNames)].join(', '),
        task: {
          person_ids: [...new Set(personIds)],
          project_id: project?.id || undefined,
          type: 'meeting',
          title,
          location,
          start_at: startIso,
          end_at: endIso,
          description: resolvedNames.length > 0 ? `Imported for: ${[...new Set(resolvedNames)].join(', ')}` : undefined,
          import_client_name: client || '',
        },
      });
    });
    const validCount = rowsOut.filter((x) => x.status === 'valid').length;
    const activityCreateCount = mergeValidImportPreviewRows(rowsOut.filter((x) => x.status === 'valid')).length;
    return {
      fileName,
      rows: rowsOut,
      validCount,
      invalidCount: rowsOut.length - validCount,
      activityCreateCount,
    };
  };

  const downloadReportExcel = () => {
    const title = `Activity Report - ${MONTH_NAMES[month - 1]} ${year}`;
    const generatedAt = new Date().toLocaleString();
    const rowsHtml = reportRows.length
      ? reportRows
          .map(
            (r) => `<tr>
<td>${escapeHtml(r.date)}</td>
<td>${escapeHtml(r.staff_name)}</td>
<td>${escapeHtml(r.client)}</td>
<td>${escapeHtml(r.title)}</td>
<td>${escapeHtml(r.location)}</td>
</tr>`,
          )
          .join('')
      : '<tr><td colspan="5" style="text-align:center;color:#6b7280;">No activity for this month.</td></tr>';
    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: Calibri, Arial, sans-serif; color: #111827; }
    .title { font-size: 16pt; font-weight: 700; margin-bottom: 4px; }
    .meta { font-size: 10pt; color: #4b5563; margin: 2px 0; }
    table { border-collapse: collapse; width: 100%; margin-top: 12px; }
    th, td { border: 1px solid #d1d5db; padding: 6px 8px; font-size: 10.5pt; }
    th { background: #e5e7eb; font-weight: 700; text-align: left; }
    tr:nth-child(even) td { background: #f9fafb; }
  </style>
</head>
<body>
  <div class="title">${escapeHtml(title)}</div>
  <div class="meta">Month: ${escapeHtml(MONTH_NAMES[month - 1])}</div>
  <div class="meta">Year: ${escapeHtml(year)}</div>
  <div class="meta">Generated at: ${escapeHtml(generatedAt)}</div>
  <table>
    <colgroup>
      <col style="width: 120px;" />
      <col style="width: 220px;" />
      <col style="width: 220px;" />
      <col style="width: 240px;" />
      <col style="width: 220px;" />
    </colgroup>
    <thead>
      <tr>
        <th>Date</th>
        <th>Staff Name</th>
        <th>Client</th>
        <th>Title</th>
        <th>Location</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
</body>
</html>`;
    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity_report_${year}_${String(month).padStart(2, '0')}.xls`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const importReportExcel = async (file) => {
    if (!file) return;
    const name = String(file.name || '').toLowerCase();
    if (!(name.endsWith('.xls') || name.endsWith('.csv') || name.endsWith('.xlsx'))) {
      alert('Please import .xls, .xlsx, or .csv file.');
      return;
    }
    const rows = await parseImportedReportFile(file);
    if (rows.length === 0) {
      alert('No rows found in imported file.');
      return;
    }
    const editableRows = [];
    rows.forEach((r, idx) => {
      const dateText = firstNonEmpty(r, ['date', 'activity date', 'day', 'tarikh', 'date tarikh']);
      const staffText = firstNonEmpty(r, ['staff name', 'staff', 'person', 'assignee', 'nama staff', 'nama staf', 'nama staff staff name']);
      const title = firstNonEmpty(r, ['title', 'activity', 'tujuan', 'tujuan title']);
      const location = firstNonEmpty(r, ['location', 'tempat', 'tempat location']);
      const client = firstNonEmpty(r, ['client', 'organisasi', 'organization', 'organisasi client', 'client organisasi']);
      editableRows.push({
        row: idx + 2,
        sheet: String(r.__sheet || '').trim(),
        date: dateText,
        staff_name: staffText,
        client: client || '-',
        title: title || '',
        location: location || '',
      });
    });
    const preview = buildImportPreview(editableRows, file.name || 'import-file');
    if (preview.validCount === 0) {
      const invalidRows = preview.rows.filter((x) => x.status !== 'valid');
      alert(
        `No valid rows to import.\n${invalidRows
          .slice(0, 6)
          .map((x) => `Row ${x.row}${x.source_sheet ? ` (${x.source_sheet})` : ''}: ${x.reason}`)
          .join('\n')}`,
      );
      return;
    }
    setImportPreview(preview);
  };

  const updateImportPreviewCell = (rowNo, field, value) => {
    setImportPreview((prev) => {
      if (!prev) return prev;
      const editableRows = prev.rows.map((r) => ({
        row: r.row,
        sheet: r.source_sheet || '',
        date: r.date,
        staff_name: r.staff_name,
        client: r.client,
        title: r.title,
        location: r.location,
      }));
      const nextRows = editableRows.map((r) => (r.row === rowNo ? { ...r, [field]: value } : r));
      return buildImportPreview(nextRows, prev.fileName);
    });
  };

  const confirmImportPreview = async () => {
    if (!importPreview) return;
    const validRows = importPreview.rows.filter((x) => x.status === 'valid');
    const mergedValid = mergeValidImportPreviewRows(validRows);
    const tasks = mergedValid.map((x) => x.task).filter(Boolean);
    if (tasks.length === 0) {
      alert('No valid rows to import.');
      return;
    }

    const syncImportedLocations = async () => {
      const incoming = [...new Set(tasks.map((t) => String(t.location || '').trim()).filter(Boolean))];
      if (incoming.length === 0) return { added: 0, names: [] };
      try {
        const settings = await api.settings.get();
        const existing = Array.isArray(settings?.activity_locations) && settings.activity_locations.length > 0
          ? settings.activity_locations.map((x) => String(x).trim()).filter(Boolean)
          : [...DEFAULT_ACTIVITY_SITE_LOCATIONS];
        const existingSet = new Set(existing.map((x) => x.toLowerCase()));
        const toAdd = incoming.filter((loc) => !existingSet.has(loc.toLowerCase()));
        if (toAdd.length === 0) return { added: 0, names: [] };
        const nextLocations = [...existing, ...toAdd];
        const nextMileage = settings?.mileage_from_office_km && typeof settings.mileage_from_office_km === 'object'
          ? { ...settings.mileage_from_office_km }
          : {};
        toAdd.forEach((loc) => {
          if (nextMileage[loc] === undefined || nextMileage[loc] === null || nextMileage[loc] === '') {
            nextMileage[loc] = 0;
          }
        });
        const saved = await api.settings.update({
          activity_locations: nextLocations,
          mileage_from_office_km: nextMileage,
        });
        const finalList = Array.isArray(saved?.activity_locations) && saved.activity_locations.length > 0
          ? saved.activity_locations.map((x) => String(x).trim()).filter(Boolean)
          : nextLocations;
        setActivitySites(finalList.length ? finalList : DEFAULT_ACTIVITY_SITE_LOCATIONS);
        return { added: toAdd.length, names: toAdd };
      } catch (e) {
        console.warn('import: could not sync new locations to settings', e?.message || e);
        return { added: 0, names: [], failed: true };
      }
    };

    const syncImportedClients = async () => {
      const incoming = [
        ...new Set(
          tasks
            .map((t) => String(t.import_client_name || '').trim())
            .filter((x) => x !== '' && x !== '-'),
        ),
      ];
      if (incoming.length === 0) return { added: 0, names: [] };
      try {
        const existingClients = await api.clients.list();
        const existingSet = new Set(
          (Array.isArray(existingClients) ? existingClients : [])
            .map((c) => String(c?.name || '').trim().toLowerCase())
            .filter(Boolean),
        );
        const toAdd = incoming.filter((name) => !existingSet.has(name.toLowerCase()));
        for (const name of toAdd) {
          // eslint-disable-next-line no-await-in-loop
          await api.clients.create({ name });
        }
        return { added: toAdd.length, names: toAdd };
      } catch (e) {
        console.warn('import: could not sync new clients', e?.message || e);
        return { added: 0, names: [], failed: true };
      }
    };

    setImporting(true);
    try {
      const locationSync = await syncImportedLocations();
      const clientSync = await syncImportedClients();
      await runMutation(async () => {
        for (const body of tasks) {
          const { import_client_name: _clientName, ...payload } = body;
          // sequential by design: keeps API pressure low and easy to track failures
          // eslint-disable-next-line no-await-in-loop
          await api.activities.create(payload);
        }
      });
      await loadActivities(rangeStartIso, rangeEndExclusiveIso);
      const locationMsg = locationSync.added > 0
        ? ` Added ${locationSync.added} new location(s) to Settings list.`
        : '';
      const clientMsg = clientSync.added > 0
        ? ` Added ${clientSync.added} new client(s).`
        : '';
      const mergeNote =
        importPreview.validCount > tasks.length
          ? ` Combined ${importPreview.validCount} valid rows that shared the same date, time window, title, location, and client.`
          : '';
      alert(
        `Imported ${tasks.length} ${tasks.length === 1 ? 'activity' : 'activities'}.${mergeNote}${importPreview.invalidCount ? ` Skipped ${importPreview.invalidCount} row(s).` : ''}${locationMsg}${clientMsg}`,
      );
      setImportPreview(null);
    } catch (e) {
      alert(e?.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div>
      <h1 style={{ marginBottom: '0.5rem', fontSize: 'clamp(1.25rem, 4vw, 1.75rem)' }}>Calendar & Activities</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>Log meetings, outstation work, and other activities below; they appear on the calendar and in Team workload.</p>

      {/* Activities: filter + add + list */}
      <div style={{ ...card, marginBottom: '1rem' }} className="filter-bar">
        <button type="button" onClick={openCreateForm} style={btnPrimary}>
          + Log activity
        </button>
        <label style={{ ...btnSecondary, display: 'inline-flex', alignItems: 'center', cursor: importing ? 'not-allowed' : 'pointer', opacity: importing ? 0.6 : 1 }}>
          {importing ? 'Importing…' : 'Import Excel'}
          <input
            type="file"
            accept=".xls,.xlsx,.csv"
            style={{ display: 'none' }}
            disabled={importing || mutating}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              await importReportExcel(f);
            }}
          />
        </label>
        <button type="button" onClick={() => setShowReport(true)} style={btnSecondary}>
          Generate report
        </button>
      </div>
      {showReport && (
        <div className="modal-backdrop" onClick={() => setShowReport(false)} role="presentation">
          <div
            className="modal-dialog"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="activity-report-modal-title"
          >
            <div className="modal-dialog-header">
              <h2 id="activity-report-modal-title" className="modal-dialog-title">
                Activity report (Month: {MONTH_NAMES[month - 1]} | Year: {year})
              </h2>
              <button type="button" className="modal-dialog-close" onClick={() => setShowReport(false)} aria-label="Close dialog">
                ×
              </button>
            </div>
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{ padding: '0.3rem 0.6rem', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface-hover)', fontSize: '0.82rem' }}>
                    Rows: <strong>{reportRows.length}</strong>
                  </span>
                  <span style={{ padding: '0.3rem 0.6rem', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface-hover)', fontSize: '0.82rem' }}>
                    Month: <strong>{MONTH_NAMES[month - 1]}</strong>
                  </span>
                  <span style={{ padding: '0.3rem 0.6rem', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface-hover)', fontSize: '0.82rem' }}>
                    Year: <strong>{year}</strong>
                  </span>
                </div>
              </div>
              <button type="button" style={btnPrimary} onClick={downloadReportExcel}>
                Download Excel
              </button>
              <button type="button" style={btnSecondary} onClick={() => setShowReport(false)}>
                Close
              </button>
            </div>
            <div style={{ maxHeight: '60vh', overflow: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', background: 'var(--surface-hover)' }}>
                    <th style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--surface-hover)', padding: '0.6rem 0.7rem', whiteSpace: 'nowrap' }}>Date</th>
                    <th style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--surface-hover)', padding: '0.6rem 0.7rem' }}>Staff Name</th>
                    <th style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--surface-hover)', padding: '0.6rem 0.7rem' }}>Client</th>
                    <th style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--surface-hover)', padding: '0.6rem 0.7rem' }}>Title</th>
                    <th style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--surface-hover)', padding: '0.6rem 0.7rem' }}>Location</th>
                  </tr>
                </thead>
                <tbody>
                  {reportRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: '0.9rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                        No activity for this month.
                      </td>
                    </tr>
                  ) : (
                    reportRows.map((r, idx) => (
                      <tr
                        key={`${r.date}-${r.staff_name}-${r.title}-${idx}`}
                        style={{
                          borderBottom: '1px solid var(--border)',
                          background: idx % 2 === 0 ? 'transparent' : 'var(--surface-hover)',
                        }}
                      >
                        <td style={{ padding: '0.58rem 0.7rem', whiteSpace: 'nowrap' }}>{r.date}</td>
                        <td style={{ padding: '0.58rem 0.7rem' }}>{r.staff_name}</td>
                        <td style={{ padding: '0.58rem 0.7rem' }}>{r.client}</td>
                        <td style={{ padding: '0.58rem 0.7rem' }}>{r.title}</td>
                        <td style={{ padding: '0.58rem 0.7rem' }}>{r.location}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {importPreview && (
        <div className="modal-backdrop" onClick={() => !importing && setImportPreview(null)} role="presentation">
          <div
            className="modal-dialog"
            style={{ width: 'min(1200px, 95vw)', maxWidth: '95vw' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="activity-import-preview-modal-title"
          >
            <div className="modal-dialog-header">
              <h2 id="activity-import-preview-modal-title" className="modal-dialog-title">
                Import preview ({importPreview.fileName})
              </h2>
              <button type="button" className="modal-dialog-close" onClick={() => setImportPreview(null)} aria-label="Close dialog" disabled={importing}>
                ×
              </button>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem', alignItems: 'center' }}>
              <span style={{ padding: '0.3rem 0.6rem', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface-hover)', fontSize: '0.82rem' }}>
                Valid rows: <strong>{importPreview.validCount}</strong>
              </span>
              <span style={{ padding: '0.3rem 0.6rem', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface-hover)', fontSize: '0.82rem' }}>
                Activities to create: <strong>{importPreview.activityCreateCount ?? importPreview.validCount}</strong>
              </span>
              {importPreview.validCount > (importPreview.activityCreateCount ?? importPreview.validCount) ? (
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', maxWidth: '42rem' }}>
                  Rows with the same date, title, location, and client (and same time window) are merged into one calendar activity with all staff.
                </span>
              ) : null}
              <span style={{ padding: '0.3rem 0.6rem', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface-hover)', fontSize: '0.82rem' }}>
                Skipped: <strong>{importPreview.invalidCount}</strong>
              </span>
            </div>
            <div style={{ maxHeight: '70vh', overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', background: 'var(--surface-hover)' }}>
                    <th style={{ padding: '0.55rem 0.6rem' }}>Row</th>
                    {importPreviewHasSheetColumn ? (
                      <th style={{ padding: '0.55rem 0.6rem' }}>Sheet</th>
                    ) : null}
                    <th style={{ padding: '0.55rem 0.6rem' }}>Date</th>
                    <th style={{ padding: '0.55rem 0.6rem' }}>Staff</th>
                    <th style={{ padding: '0.55rem 0.6rem' }}>Client</th>
                    <th style={{ padding: '0.55rem 0.6rem' }}>Title</th>
                    <th style={{ padding: '0.55rem 0.6rem' }}>Location</th>
                    <th style={{ padding: '0.55rem 0.6rem' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.rows.map((r, idx) => (
                    <tr key={`${r.source_sheet || ''}-${r.row}-${idx}`} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.55rem 0.6rem' }}>{r.row}</td>
                      {importPreviewHasSheetColumn ? (
                        <td style={{ padding: '0.55rem 0.6rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                          {r.source_sheet || '—'}
                        </td>
                      ) : null}
                      <td style={{ padding: '0.45rem 0.5rem' }}>
                        <input
                          type="text"
                          value={r.date || ''}
                          onChange={(e) => updateImportPreviewCell(r.row, 'date', e.target.value)}
                          style={{ ...inputStyle, margin: 0, minWidth: 120 }}
                          disabled={importing}
                        />
                      </td>
                      <td style={{ padding: '0.45rem 0.5rem' }}>
                        <input
                          type="text"
                          value={r.staff_name || ''}
                          onChange={(e) => updateImportPreviewCell(r.row, 'staff_name', e.target.value)}
                          style={{ ...inputStyle, margin: 0, minWidth: 180 }}
                          disabled={importing}
                        />
                        {r.resolved_staff ? <div style={{ marginTop: 4, color: 'var(--text-muted)', fontSize: '0.78rem' }}>{r.resolved_staff}</div> : null}
                      </td>
                      <td style={{ padding: '0.45rem 0.5rem' }}>
                        <input
                          type="text"
                          value={r.client || ''}
                          onChange={(e) => updateImportPreviewCell(r.row, 'client', e.target.value)}
                          style={{ ...inputStyle, margin: 0, minWidth: 140 }}
                          disabled={importing}
                        />
                      </td>
                      <td style={{ padding: '0.45rem 0.5rem' }}>
                        <input
                          type="text"
                          value={r.title || ''}
                          onChange={(e) => updateImportPreviewCell(r.row, 'title', e.target.value)}
                          style={{ ...inputStyle, margin: 0, minWidth: 180 }}
                          disabled={importing}
                        />
                      </td>
                      <td style={{ padding: '0.45rem 0.5rem' }}>
                        <input
                          type="text"
                          value={r.location || ''}
                          onChange={(e) => updateImportPreviewCell(r.row, 'location', e.target.value)}
                          style={{ ...inputStyle, margin: 0, minWidth: 140 }}
                          disabled={importing}
                        />
                      </td>
                      <td style={{ padding: '0.55rem 0.6rem', color: r.status === 'valid' ? 'var(--success)' : 'var(--danger)' }}>
                        {r.status === 'valid' ? 'Ready' : r.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.85rem', flexWrap: 'wrap' }}>
              <button type="button" style={btnPrimary} onClick={confirmImportPreview} disabled={importing || importPreview.validCount === 0}>
                {importing
                  ? 'Importing…'
                  : `Confirm import (${importPreview.activityCreateCount ?? importPreview.validCount} ${(importPreview.activityCreateCount ?? importPreview.validCount) === 1 ? 'activity' : 'activities'})`}
              </button>
              <button type="button" style={btnSecondary} onClick={() => setImportPreview(null)} disabled={importing}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {showForm && (
        <div className="modal-backdrop" onClick={() => { setShowForm(false); setEditingActivityId(null); }} role="presentation">
          <div
            className="modal-dialog modal-dialog--activity-log"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="activity-log-modal-title"
          >
            <div className="modal-dialog-header">
              <h2 id="activity-log-modal-title" className="modal-dialog-title">
                {editingActivityId != null ? 'Edit activity' : 'Log activity'}
              </h2>
              <button type="button" className="modal-dialog-close" onClick={() => { setShowForm(false); setEditingActivityId(null); }} aria-label="Close dialog">
                ×
              </button>
            </div>
            <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
              <label style={{ gridColumn: '1 / -1' }}>
                Person * (multi-select)
                <input
                  type="text"
                  value={personSearch}
                  onChange={(e) => setPersonSearch(e.target.value)}
                  placeholder="Search person name..."
                  style={inputStyle}
                />
                <div style={{ marginTop: '0.5rem', maxHeight: 180, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: '0.5rem', background: 'var(--bg)' }}>
                  {filteredUsers.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No person found.</div>
                  ) : (
                    filteredUsers.map((u) => (
                      <label key={u.id} style={{ display: 'block', marginBottom: '0.35rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={form.person_ids.includes(String(u.id))}
                          onChange={() => togglePerson(u.id)}
                          style={{ marginRight: 8 }}
                        />
                        {u.name}
                      </label>
                    ))
                  )}
                </div>
                <div style={{ marginTop: '0.35rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Selected: {form.person_ids.length}
                </div>
              </label>
              <label>
                Project{' '}
                <select value={form.project_id} onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value }))} style={inputStyle}>
                  <option value="">None</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Type{' '}
                <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} style={inputStyle}>
                  {ACTIVITY_TYPE_OPTIONS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ gridColumn: '1 / -1' }}>
                Title *{' '}
                <input type="text" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required style={inputStyle} />
              </label>
              <label style={{ gridColumn: '1 / -1' }}>
                Description{' '}
                <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} style={inputStyle} />
              </label>
              <ActivityLocationFields
                siteLocations={activitySites}
                preset={form.locationPreset}
                other={form.locationOther}
                onPreset={(v) => setForm((f) => ({ ...f, locationPreset: v, locationOther: v === ACTIVITY_LOCATION_OTHERS ? f.locationOther : '' }))}
                onOther={(v) => setForm((f) => ({ ...f, locationOther: v }))}
              />
              <p style={{ gridColumn: '1 / -1', margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Sites match{' '}
                {user?.role === 'admin' ? (
                  <Link to="/settings/locations">Settings → Locations</Link>
                ) : (
                  <span>Settings → Locations (admin)</span>
                )}
                . Choose <strong>Others</strong> for a one-off place.
              </p>
              <label>
                Start *{' '}
                <input type="datetime-local" value={form.start_at} onChange={(e) => setForm((f) => ({ ...f, start_at: e.target.value }))} required style={inputStyle} />
              </label>
              <label>
                End *{' '}
                <input type="datetime-local" value={form.end_at} onChange={(e) => setForm((f) => ({ ...f, end_at: e.target.value }))} required style={inputStyle} />
              </label>
              <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                <button type="submit" style={btnPrimary} disabled={mutating}>
                  {mutating ? 'Saving…' : editingActivityId != null ? 'Update activity' : 'Save activity'}
                </button>
                <button type="button" style={btnSecondary} disabled={mutating} onClick={() => { setShowForm(false); setEditingActivityId(null); }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Calendar */}
      <div style={card} className="calendar-card">
        <div className="calendar-header">
          <button type="button" onClick={prevMonth} style={btnNav} aria-label="Previous month">←</button>
          <h2 className="calendar-month-title">{MONTH_NAMES[month - 1]} {year}</h2>
          <button type="button" onClick={nextMonth} style={btnNav} aria-label="Next month">→</button>
          <button type="button" onClick={goToToday} style={btnSecondary}>Today</button>
        </div>
        {loading ? (
          <p style={{ padding: '2rem', color: 'var(--text-muted)', textAlign: 'center' }}>Loading activities…</p>
        ) : (
          <>
            <div className="calendar-scroll">
              <div className="calendar-grid">
                {DAY_NAMES.map((day, idx) => (
                  <div key={day} className="calendar-cell calendar-day-name">
                    <span className="calendar-day-name-full">{day}</span>
                    <span className="calendar-day-name-short">{DAY_NAMES_SHORT[idx]}</span>
                  </div>
                ))}
                {grid.flat().map((day, i) => (
                  <div key={i} className={`calendar-cell calendar-day ${day === null ? 'calendar-day-empty' : ''} ${day !== null && isToday(day) ? 'calendar-day-today' : ''}`}>
                    {day !== null && <span className="calendar-day-num">{day}</span>}
                    {day !== null && activitiesByDay[day]?.length > 0 && (() => {
                      const list = activitiesByDay[day];
                      const visible = list.slice(0, CALENDAR_DAY_MAX_VISIBLE);
                      const extra = list.length - CALENDAR_DAY_MAX_VISIBLE;
                      return (
                        <div className="calendar-day-activities">
                          {visible.map((a) => (
                            <CalendarActivityChip
                              key={a.id}
                              activity={a}
                              detailOpen={detailActivityId === a.id}
                              onToggleDetail={toggleActivityDetail}
                            />
                          ))}
                          {extra > 0 && (
                            <button
                              type="button"
                              className="calendar-day-see-more"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDetailActivityId(null);
                                setDayListDay(day);
                              }}
                            >
                              See more (+{extra})
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </div>
            </div>
            <div className="calendar-legend" style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
              <span className="calendar-legend-item"><span className="calendar-activity calendar-activity-meeting" style={{ display: 'inline-block', width: 12, height: 12, marginRight: 4 }} /> Meeting</span>
              <span className="calendar-legend-item"><span className="calendar-activity calendar-activity-outstation" style={{ display: 'inline-block', width: 12, height: 12, marginRight: 4 }} /> Outstation</span>
              <span className="calendar-legend-item"><span className="calendar-activity calendar-activity-other" style={{ display: 'inline-block', width: 12, height: 12, marginRight: 4 }} /> Other</span>
              <span className="calendar-legend-item"><span className="calendar-activity calendar-activity-uat" style={{ display: 'inline-block', width: 12, height: 12, marginRight: 4 }} /> UAT</span>
              <span className="calendar-legend-item"><span className="calendar-activity calendar-activity-urs" style={{ display: 'inline-block', width: 12, height: 12, marginRight: 4 }} /> URS</span>
              <span className="calendar-legend-item"><span className="calendar-activity calendar-activity-fat" style={{ display: 'inline-block', width: 12, height: 12, marginRight: 4 }} /> FAT</span>
              <span className="calendar-legend-item"><span className="calendar-activity calendar-activity-demo" style={{ display: 'inline-block', width: 12, height: 12, marginRight: 4 }} /> DEMO</span>
              <span className="calendar-legend-item"><span className="calendar-activity calendar-activity-training" style={{ display: 'inline-block', width: 12, height: 12, marginRight: 4 }} /> TRAINING</span>
              <span className="calendar-legend-item"><span className="calendar-activity calendar-activity-go-live" style={{ display: 'inline-block', width: 12, height: 12, marginRight: 4 }} /> GO-LIVE</span>
              <span className="calendar-legend-item"><span className="calendar-activity calendar-activity-tender" style={{ display: 'inline-block', width: 12, height: 12, marginRight: 4 }} /> TENDER</span>
            </div>
          </>
        )}
      </div>
      {dayListDay != null && dayListActivities.length > 0 && (
        <CalendarDayActivitiesSheet
          year={year}
          month={month}
          day={dayListDay}
          activities={dayListActivities}
          onClose={() => setDayListDay(null)}
          detailActivityId={detailActivityId}
          onToggleDetail={toggleActivityDetail}
        />
      )}
      {detailActivity && (
        <CalendarActivityDetailSheet
          activity={detailActivity}
          onClose={() => setDetailActivityId(null)}
          onEdit={openEditActivity}
          onDelete={deleteActivity}
          actionPending={mutating}
        />
      )}
    </div>
  );
}
