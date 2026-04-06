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

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Maps API type to CSS suffix (legacy `task` → outstation). */
function activityCssClass(type) {
  if (type === 'task') return 'outstation';
  if (type === 'meeting' || type === 'outstation' || type === 'other') return type;
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
  const timeStr = new Date(a.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const rangeLabel = formatActivityTimeRange(a);
  const label = `${activityTypeLabel(a.type)}: ${a.title}. ${a.location ? `${a.location}. ` : ''}${a.person_name ?? ''}. ${rangeLabel}`;

  const handleClick = (e) => {
    e.stopPropagation();
    if (shouldUseMobileActivityDetail()) onToggleDetail(a.id);
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
        <span className="calendar-activity-time">{timeStr}</span>
        <span className="calendar-activity-person">{a.person_name}</span>
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

function CalendarActivityDetailSheet({ activity: a, onClose }) {
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
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
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
  const { user } = useAuth();
  const [detailActivityId, setDetailActivityId] = useState(null);
  const nonAdminUsers = useMemo(() => users.filter((u) => u.role !== 'admin'), [users]);

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

  useEffect(() => {
    if (detailActivityId == null) return;
    if (!activities.some((x) => x.id === detailActivityId)) setDetailActivityId(null);
  }, [activities, detailActivityId]);

  const activitiesByDay = useMemo(() => {
    const byDay = {};
    for (let d = 1; d <= 31; d++) byDay[d] = [];
    activities.forEach(a => {
      for (let d = 1; d <= 31; d++) {
        if (isActivityOnDate(a, year, month, d)) byDay[d].push(a);
      }
    });
    for (let d = 1; d <= 31; d++) {
      byDay[d].sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
    }
    return byDay;
  }, [activities, year, month]);

  useEffect(() => {
    setDayListDay(null);
  }, [year, month]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.person_ids?.length || !form.title || !form.start_at || !form.end_at) return;
    const location = composeLocation(form.locationPreset, form.locationOther);
    if (!location) {
      alert('Please select a location or enter a custom one under Others.');
      return;
    }
    try {
      await Promise.all(
        form.person_ids.map((pid) =>
          api.activities.create({
            person_id: +pid,
            project_id: form.project_id || undefined,
            type: form.type,
            title: form.title,
            description: form.description || undefined,
            location,
            start_at: form.start_at,
            end_at: form.end_at,
          }),
        ),
      );
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

  const detailActivity = detailActivityId != null ? activities.find((x) => x.id === detailActivityId) : null;
  const dayListActivities = dayListDay != null ? (activitiesByDay[dayListDay] ?? []) : [];

  return (
    <div>
      <h1 style={{ marginBottom: '0.5rem', fontSize: 'clamp(1.25rem, 4vw, 1.75rem)' }}>Calendar & Activities</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>Log meetings, outstation work, and other activities below; they appear on the calendar and in Team workload.</p>

      {/* Activities: filter + add + list */}
      <div style={{ ...card, marginBottom: '1rem' }} className="filter-bar">
        <label>From <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inputStyle} /></label>
        <label>To <input type="date" value={to} onChange={e => setTo(e.target.value)} style={inputStyle} /></label>
        <button type="button" onClick={() => setShowForm(true)} style={btnPrimary}>
          + Log activity
        </button>
      </div>
      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)} role="presentation">
          <div
            className="modal-dialog modal-dialog--activity-log"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="activity-log-modal-title"
          >
            <div className="modal-dialog-header">
              <h2 id="activity-log-modal-title" className="modal-dialog-title">
                Log activity
              </h2>
              <button type="button" className="modal-dialog-close" onClick={() => setShowForm(false)} aria-label="Close dialog">
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
                  Save activity
                </button>
                <button type="button" style={btnSecondary} onClick={() => setShowForm(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <ActivityList
        from={from}
        to={to}
        card={card}
        users={nonAdminUsers}
        projects={projects}
        activitySites={activitySites}
      />

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
        <CalendarActivityDetailSheet activity={detailActivity} onClose={() => setDetailActivityId(null)} />
      )}
    </div>
  );
}

function ActivityList({ from, to, card, users, projects, activitySites = DEFAULT_ACTIVITY_SITE_LOCATIONS }) {
  const [list, setList] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({
    person_id: '',
    project_id: '',
    type: 'meeting',
    title: '',
    description: '',
    locationPreset: '',
    locationOther: '',
    start_at: '',
    end_at: '',
  });

  useEffect(() => { api.activities.list({ from, to }).then(setList).catch(console.error); }, [from, to]);

  const reload = () => api.activities.list({ from, to }).then(setList).catch(console.error);

  const startEdit = (a) => {
    const { preset, custom } = resolveLocationForForm(a.location, activitySites);
    setEditingId(a.id);
    setEditForm({
      person_id: String(a.person_id ?? ''),
      project_id: a.project_id != null ? String(a.project_id) : '',
      type: a.type === 'task' ? 'outstation' : (ACTIVITY_TYPE_OPTIONS.some((x) => x.value === a.type) ? a.type : 'meeting'),
      title: a.title || '',
      description: a.description || '',
      locationPreset: preset || (activitySites[0] || ''),
      locationOther: custom,
      start_at: a.start_at ? String(a.start_at).slice(0, 16) : '',
      end_at: a.end_at ? String(a.end_at).slice(0, 16) : '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({
      person_id: '',
      project_id: '',
      type: 'meeting',
      title: '',
      description: '',
      locationPreset: '',
      locationOther: '',
      start_at: '',
      end_at: '',
    });
  };

  const saveEdit = async (id) => {
    if (!editForm.person_id || !editForm.title || !editForm.start_at || !editForm.end_at) return;
    const location = composeLocation(editForm.locationPreset, editForm.locationOther);
    if (!location) {
      alert('Please select a location or enter a custom one under Others.');
      return;
    }
    try {
      await api.activities.update(id, {
        person_id: +editForm.person_id,
        project_id: editForm.project_id ? +editForm.project_id : null,
        type: editForm.type,
        title: editForm.title,
        description: editForm.description || null,
        location,
        start_at: editForm.start_at,
        end_at: editForm.end_at,
      });
      cancelEdit();
      reload();
    } catch (err) {
      alert(err.message);
    }
  };

  const removeActivity = async (id) => {
    if (!confirm('Delete this activity log?')) return;
    try {
      await api.activities.delete(id);
      if (editingId === id) cancelEdit();
      reload();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div style={{ ...card, marginBottom: '1rem' }}>
      <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>Activities in selected period</h3>
      {list.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>No activities in this period.</p> : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {list.map(a => (
            <li key={a.id} style={{ padding: '0.65rem 0', borderBottom: '1px solid var(--border)' }}>
              {editingId === a.id ? (
                <div style={{ display: 'grid', gap: '0.6rem', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
                  <label>Person
                    <select value={editForm.person_id} onChange={e => setEditForm(f => ({ ...f, person_id: e.target.value }))} style={inputStyle}>
                      <option value="">Select...</option>
                      {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </label>
                  <label>Project
                    <select value={editForm.project_id} onChange={e => setEditForm(f => ({ ...f, project_id: e.target.value }))} style={inputStyle}>
                      <option value="">None</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </label>
                  <label>Type
                    <select value={editForm.type} onChange={e => setEditForm(f => ({ ...f, type: e.target.value }))} style={inputStyle}>
                      {ACTIVITY_TYPE_OPTIONS.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ gridColumn: '1 / -1' }}>Title
                    <input type="text" value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} style={inputStyle} />
                  </label>
                  <label style={{ gridColumn: '1 / -1' }}>Description
                    <textarea rows={2} value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} style={inputStyle} />
                  </label>
                  <ActivityLocationFields
                    siteLocations={activitySites}
                    preset={editForm.locationPreset}
                    other={editForm.locationOther}
                    onPreset={(v) => setEditForm((f) => ({ ...f, locationPreset: v, locationOther: v === ACTIVITY_LOCATION_OTHERS ? f.locationOther : '' }))}
                    onOther={(v) => setEditForm((f) => ({ ...f, locationOther: v }))}
                  />
                  <label>Start
                    <input type="datetime-local" value={editForm.start_at} onChange={e => setEditForm(f => ({ ...f, start_at: e.target.value }))} style={inputStyle} />
                  </label>
                  <label>End
                    <input type="datetime-local" value={editForm.end_at} onChange={e => setEditForm(f => ({ ...f, end_at: e.target.value }))} style={inputStyle} />
                  </label>
                  <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '0.5rem' }}>
                    <button type="button" style={btnPrimary} onClick={() => saveEdit(a.id)}>Save</button>
                    <button type="button" style={btnSecondary} onClick={cancelEdit}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div>
                    <span><strong>{a.person_name}</strong> · [{activityTypeLabel(a.type)}] {a.title}{a.location ? ` · ${a.location}` : ''} {a.project_name && `(${a.project_name})`}</span>
                    {a.description && <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.2rem' }}>{a.description}</div>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.35rem' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{new Date(a.start_at).toLocaleString()} – {new Date(a.end_at).toLocaleTimeString()}</span>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button type="button" style={{ ...btnSecondary, padding: '0.25rem 0.55rem', fontSize: '0.85rem' }} onClick={() => startEdit(a)}>Edit</button>
                      <button type="button" style={{ ...btnSecondary, padding: '0.25rem 0.55rem', fontSize: '0.85rem', color: 'var(--danger)' }} onClick={() => removeActivity(a.id)}>Delete</button>
                    </div>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
