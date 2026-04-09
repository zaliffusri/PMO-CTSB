import { useState, useEffect, useLayoutEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { btnPrimary, btnSecondary, card, inputStyle } from '../styles/commonStyles';
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
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10), firstDayOfWeek: first.getDay(), daysInMonth: last.getDate() };
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
  const start = new Date(activity.start_at);
  const end = new Date(activity.end_at);
  const d = new Date(year, month - 1, day);
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  return (start >= dayStart && start < dayEnd) || (end > dayStart && end <= dayEnd) || (start <= dayStart && end >= dayEnd);
}

/** Same instant can come back from the API/DB as different strings (Z vs +00:00, ms vs none). */
function activityGroupTimeMs(value) {
  const n = new Date(value).getTime();
  return Number.isFinite(n) ? n : String(value ?? '');
}

/**
 * One "Log activity" with several people creates one DB row per person. For the calendar,
 * merge those rows into a single chip with all assignee names grouped together.
 *
 * Group key uses normalized time (ms), trimmed text, and lowercased type so Postgres/Supabase
 * round-trips do not split one logical event into multiple chips.
 */
function groupActivitiesForCalendar(activities) {
  const map = new Map();
  for (const a of activities) {
    const projectKey = a.project_id != null && a.project_id !== '' ? String(a.project_id) : '';
    const desc = String(a.description ?? '').trim();
    const title = String(a.title ?? '').trim();
    const loc = String(a.location ?? '').trim();
    const type = String(a.type ?? '').toLowerCase();
    const key = `${activityGroupTimeMs(a.start_at)}|${activityGroupTimeMs(a.end_at)}|${type}|${title}|${loc}|${projectKey}|${desc}`;
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

function formatActivityTimeRange(a) {
  const t = { hour: '2-digit', minute: '2-digit' };
  return `${new Date(a.start_at).toLocaleTimeString([], t)} – ${new Date(a.end_at).toLocaleTimeString([], t)}`;
}

function shouldUseMobileActivityDetail() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 767px)').matches || window.matchMedia('(hover: none)').matches;
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

function CalendarActivityDetailSheet({ activity: a, onClose, onEdit, onDelete }) {
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
        <button type="button" style={{ ...btnPrimary, width: '100%', marginTop: '0.5rem' }} onClick={() => onEdit?.(a)}>
          Edit activity
        </button>
        <button
          type="button"
          style={{ ...btnSecondary, width: '100%', marginTop: '0.5rem', color: 'var(--danger)' }}
          onClick={() => onDelete?.(a)}
        >
          Delete activity
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
  const nonAdminUsers = useMemo(
    () => users.filter((u) => u.role !== 'admin' && u.active !== false),
    [users],
  );

  /** Day of month (1–31) when the "all activities for this day" sheet is open. */
  const [dayListDay, setDayListDay] = useState(null);

  const { from: monthFrom, to: monthTo } = useMemo(() => getMonthRange(year, month), [year, month]);
  const grid = useMemo(() => getCalendarGrid(year, month), [year, month]);

  const loadActivities = (f, t) => api.activities.list({ from: f, to: t }).then(setActivities).catch(console.error);
  useEffect(() => {
    setLoading(true);
    loadActivities(monthFrom, monthTo).finally(() => setLoading(false));
  }, [monthFrom, monthTo]);

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
    try {
      if (editingActivityId != null) {
        await api.activities.update(editingActivityId, {
          person_ids: form.person_ids.map((pid) => +pid),
          project_id: form.project_id || null,
          type: form.type,
          title: form.title,
          description: form.description || null,
          location,
          start_at: form.start_at,
          end_at: form.end_at,
        });
      } else {
        await api.activities.create({
          person_ids: form.person_ids.map((pid) => +pid),
          project_id: form.project_id || undefined,
          type: form.type,
          title: form.title,
          description: form.description || undefined,
          location,
          start_at: form.start_at,
          end_at: form.end_at,
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
      loadActivities(monthFrom, monthTo);
    } catch (err) {
      alert(err.message);
    }
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
      start_at: a.start_at ? String(a.start_at).slice(0, 16) : '',
      end_at: a.end_at ? String(a.end_at).slice(0, 16) : '',
    });
    setPersonSearch('');
    setEditingActivityId(a.id);
    setDetailActivityId(null);
    setDayListDay(null);
    setShowForm(true);
  };

  const deleteActivity = async (a) => {
    if (!a?.id) return;
    if (!confirm(`Delete activity "${a.title}"?`)) return;
    try {
      await api.activities.delete(a.id);
      setDetailActivityId(null);
      setDayListDay(null);
      if (editingActivityId === a.id) {
        setShowForm(false);
        setEditingActivityId(null);
      }
      loadActivities(monthFrom, monthTo);
    } catch (err) {
      alert(err.message);
    }
  };

  const detailActivity = detailActivityId != null ? groupedCalendarActivities.find((x) => x.id === detailActivityId) : null;
  const dayListActivities = dayListDay != null ? (activitiesByDay[dayListDay] ?? []) : [];

  return (
    <div>
      <h1 style={{ marginBottom: '0.5rem', fontSize: 'clamp(1.25rem, 4vw, 1.75rem)' }}>Calendar & Activities</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>Log meetings, outstation work, and other activities below; they appear on the calendar and in Team workload.</p>

      {/* Activities: filter + add + list */}
      <div style={{ ...card, marginBottom: '1rem' }} className="filter-bar">
        <button type="button" onClick={openCreateForm} style={btnPrimary}>
          + Log activity
        </button>
      </div>
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
                <button type="submit" style={btnPrimary}>
                  {editingActivityId != null ? 'Update activity' : 'Save activity'}
                </button>
                <button type="button" style={btnSecondary} onClick={() => { setShowForm(false); setEditingActivityId(null); }}>
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
        />
      )}
    </div>
  );
}
