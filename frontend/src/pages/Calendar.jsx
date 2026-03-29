import { useState, useEffect, useMemo } from 'react';
import { api } from '../api';

const card = { background: 'var(--surface)', borderRadius: 'var(--radius)', padding: '1.25rem', border: '1px solid var(--border)' };
const inputStyle = { display: 'block', width: '100%', padding: '0.5rem 0.75rem', marginTop: '0.25rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' };
const btnPrimary = { padding: '0.5rem 1rem', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 8, fontWeight: 600 };
const btnNav = { padding: '0.5rem 0.75rem', background: 'var(--surface-hover)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', cursor: 'pointer', fontSize: '1rem' };
const btnSecondary = { padding: '0.5rem 1rem', background: 'var(--surface-hover)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8 };

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

export default function Calendar() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [people, setPeople] = useState([]);
  const [projects, setProjects] = useState([]);
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    person_id: '', project_id: '', type: 'meeting', title: '', description: '', start_at: '', end_at: '',
  });

  const { from: monthFrom, to: monthTo } = useMemo(() => getMonthRange(year, month), [year, month]);
  const grid = useMemo(() => getCalendarGrid(year, month), [year, month]);

  const loadActivities = (f, t) => api.activities.list({ from: f, to: t }).then(setActivities).catch(console.error);
  useEffect(() => {
    setLoading(true);
    loadActivities(monthFrom, monthTo).finally(() => setLoading(false));
  }, [monthFrom, monthTo]);

  useEffect(() => {
    Promise.all([api.people.list(), api.projects.list()]).then(([p, pr]) => { setPeople(p); setProjects(pr); }).catch(console.error);
  }, []);

  const activitiesByDay = useMemo(() => {
    const byDay = {};
    for (let d = 1; d <= 31; d++) byDay[d] = [];
    activities.forEach(a => {
      for (let d = 1; d <= 31; d++) {
        if (isActivityOnDate(a, year, month, d)) byDay[d].push(a);
      }
    });
    return byDay;
  }, [activities, year, month]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.person_id || !form.title || !form.start_at || !form.end_at) return;
    try {
      await api.activities.create({ ...form, project_id: form.project_id || undefined });
      setForm({ person_id: '', project_id: '', type: 'meeting', title: '', description: '', start_at: '', end_at: '' });
      setShowForm(false);
      loadActivities(monthFrom, monthTo);
    } catch (err) {
      alert(err.message);
    }
  };

  const prevMonth = () => { if (month === 1) { setMonth(12); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 12) { setMonth(1); setYear(y => y + 1); } else setMonth(m => m + 1); };
  const goToToday = () => { const d = new Date(); setYear(d.getFullYear()); setMonth(d.getMonth() + 1); };
  const isToday = (d) => d !== null && year === today.getFullYear() && month === today.getMonth() + 1 && d === today.getDate();

  return (
    <div>
      <h1 style={{ marginBottom: '0.5rem', fontSize: 'clamp(1.25rem, 4vw, 1.75rem)' }}>Calendar & Activities</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>Log meetings and tasks below; they appear on the calendar and in Team workload.</p>

      {/* Activities: filter + add + list */}
      <div style={{ ...card, marginBottom: '1rem' }} className="filter-bar">
        <label>From <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inputStyle} /></label>
        <label>To <input type="date" value={to} onChange={e => setTo(e.target.value)} style={inputStyle} /></label>
        <button type="button" onClick={() => setShowForm(!showForm)} style={btnPrimary}>
          {showForm ? 'Cancel' : '+ Log activity'}
        </button>
      </div>
      {showForm && (
        <div style={{ ...card, marginBottom: '1rem' }}>
          <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
            <label>Person * <select value={form.person_id} onChange={e => setForm(f => ({ ...f, person_id: e.target.value }))} required style={inputStyle}>
              <option value="">Select...</option>
              {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></label>
            <label>Project <select value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))} style={inputStyle}>
              <option value="">None</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></label>
            <label>Type <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={inputStyle}>
              <option value="meeting">Meeting</option>
              <option value="task">Task</option>
              <option value="other">Other</option>
            </select></label>
            <label style={{ gridColumn: '1 / -1' }}>Title * <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required style={inputStyle} /></label>
            <label style={{ gridColumn: '1 / -1' }}>Description <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} style={inputStyle} /></label>
            <label>Start * <input type="datetime-local" value={form.start_at} onChange={e => setForm(f => ({ ...f, start_at: e.target.value }))} required style={inputStyle} /></label>
            <label>End * <input type="datetime-local" value={form.end_at} onChange={e => setForm(f => ({ ...f, end_at: e.target.value }))} required style={inputStyle} /></label>
            <div style={{ gridColumn: '1 / -1' }}><button type="submit" style={btnPrimary}>Save activity</button></div>
          </form>
        </div>
      )}
      <ActivityList from={from} to={to} card={card} />

      {/* Calendar */}
      <div style={card}>
        <div className="calendar-header">
          <button type="button" onClick={prevMonth} style={btnNav} aria-label="Previous month">←</button>
          <h2 style={{ margin: 0, fontSize: '1.25rem', minWidth: '180px', textAlign: 'center' }}>{MONTH_NAMES[month - 1]} {year}</h2>
          <button type="button" onClick={nextMonth} style={btnNav} aria-label="Next month">→</button>
          <button type="button" onClick={goToToday} style={btnSecondary}>Today</button>
        </div>
        {loading ? (
          <p style={{ padding: '2rem', color: 'var(--text-muted)', textAlign: 'center' }}>Loading activities…</p>
        ) : (
          <>
            <div className="calendar-grid">
              {DAY_NAMES.map(day => <div key={day} className="calendar-cell calendar-day-name">{day}</div>)}
              {grid.flat().map((day, i) => (
                <div key={i} className={`calendar-cell calendar-day ${day === null ? 'calendar-day-empty' : ''} ${day !== null && isToday(day) ? 'calendar-day-today' : ''}`}>
                  {day !== null && <span className="calendar-day-num">{day}</span>}
                  {day !== null && activitiesByDay[day]?.length > 0 && (
                    <div className="calendar-day-activities">
                      {activitiesByDay[day].map(a => (
                        <div key={a.id} className={`calendar-activity calendar-activity-${a.type}`}
                          title={`${a.person_name} · ${a.title}${a.project_name ? ` (${a.project_name})` : ''} · ${new Date(a.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${new Date(a.end_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}>
                          <span className="calendar-activity-time">{new Date(a.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          <span className="calendar-activity-person">{a.person_name}</span>
                          <span className="calendar-activity-title">{a.title}</span>
                          {a.project_name && <span className="calendar-activity-project">{a.project_name}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="calendar-legend" style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
              <span className="calendar-legend-item"><span className="calendar-activity calendar-activity-meeting" style={{ display: 'inline-block', width: 12, height: 12, marginRight: 4 }} /> Meeting</span>
              <span className="calendar-legend-item"><span className="calendar-activity calendar-activity-task" style={{ display: 'inline-block', width: 12, height: 12, marginRight: 4 }} /> Task</span>
              <span className="calendar-legend-item"><span className="calendar-activity calendar-activity-other" style={{ display: 'inline-block', width: 12, height: 12, marginRight: 4 }} /> Other</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ActivityList({ from, to, card }) {
  const [list, setList] = useState([]);
  useEffect(() => { api.activities.list({ from, to }).then(setList).catch(console.error); }, [from, to]);
  return (
    <div style={{ ...card, marginBottom: '1rem' }}>
      <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>Activities in selected period</h3>
      {list.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>No activities in this period.</p> : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {list.map(a => (
            <li key={a.id} style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
              <span><strong>{a.person_name}</strong> · [{a.type}] {a.title} {a.project_name && `(${a.project_name})`}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{new Date(a.start_at).toLocaleString()} – {new Date(a.end_at).toLocaleTimeString()}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
