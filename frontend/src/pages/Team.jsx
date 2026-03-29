import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';

const card = { background: 'var(--surface)', borderRadius: 'var(--radius)', padding: '1.25rem', border: '1px solid var(--border)' };
const inputStyle = { display: 'block', width: '100%', padding: '0.5rem 0.75rem', marginTop: '0.25rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' };
const btnPrimary = { padding: '0.5rem 1rem', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 8, fontWeight: 600 };
const btnSecondary = { padding: '0.5rem 1rem', background: 'var(--surface-hover)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8 };
const thStyle = { padding: '0.6rem 0.5rem 0.6rem 0', color: 'var(--text-muted)', fontWeight: 600 };
const tdStyle = { padding: '0.6rem 0.5rem 0.6rem 0' };

export default function Team() {
  const [searchParams, setSearchParams] = useSearchParams();
  const checkPersonId = searchParams.get('check');
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', role: '' });
  const [selected, setSelected] = useState(null);
  const [personDetail, setPersonDetail] = useState(null);
  // Workload section
  const [workload, setWorkload] = useState(null);
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [checkId, setCheckId] = useState(checkPersonId ? +checkPersonId : '');
  const [checkResult, setCheckResult] = useState(null);

  const load = () => api.people.list().then(setPeople).catch(console.error).finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!selected) {
      setPersonDetail(null);
      return;
    }
    api.people.get(selected).then(setPersonDetail).catch(console.error);
  }, [selected]);

  useEffect(() => {
    api.availability.workload(from, to).then(setWorkload).catch(console.error);
  }, [from, to]);

  useEffect(() => {
    if (!checkPersonId) return;
    setCheckId(+checkPersonId);
    api.availability.check(+checkPersonId, from, to).then(setCheckResult).catch(console.error);
  }, [checkPersonId, from, to]);

  const runCheck = () => {
    if (!checkId) return;
    setSearchParams({ check: checkId });
    api.availability.check(checkId, from, to).then(setCheckResult).catch(console.error);
  };
  const clearCheck = () => {
    setSearchParams({});
    setCheckResult(null);
    setCheckId('');
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    try {
      await api.people.create(form);
      setForm({ name: '', email: '', role: '' });
      setShowForm(false);
      load();
    } catch (err) {
      alert(err.message);
    }
  };

  const showCheck = (personId) => {
    setCheckId(personId);
    setSearchParams({ check: personId });
    api.availability.check(personId, from, to).then(setCheckResult).catch(console.error);
  };

  if (loading) return <div style={{ padding: '2rem' }}>Loading...</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Team & Workload</h1>
          <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0' }}>Manage people and see who has capacity. Log activities in Calendar.</p>
        </div>
        <button type="button" onClick={() => setShowForm(!showForm)} style={btnPrimary}>
          {showForm ? 'Cancel' : '+ Add person'}
        </button>
      </div>

      {showForm && (
        <div style={{ ...card, marginBottom: '1rem' }}>
          <h3 style={{ margin: '0 0 1rem' }}>Add team member</h3>
          <form onSubmit={submit} style={{ display: 'grid', gap: '0.75rem', maxWidth: 400 }}>
            <label>Name <span style={{ color: 'var(--danger)' }}>*</span>
              <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required style={inputStyle} />
            </label>
            <label>Email
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={inputStyle} />
            </label>
            <label>Role
              <input type="text" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} placeholder="e.g. Developer, Analyst" style={inputStyle} />
            </label>
            <button type="submit" style={btnPrimary}>Add</button>
          </form>
        </div>
      )}

      <div className="team-grid">
        <div style={card}>
          <h2 style={{ margin: '0 0 1rem', fontSize: '1.1rem' }}>Team members</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {people.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelected(p.id)}
                style={{
                  padding: '0.75rem', textAlign: 'left', background: selected === p.id ? 'var(--surface-hover)' : 'transparent',
                  border: 'none', borderRadius: 8, color: 'var(--text)', cursor: 'pointer',
                  borderLeft: selected === p.id ? '3px solid var(--accent)' : '3px solid transparent',
                }}
              >
                <div style={{ fontWeight: 600 }}>{p.name}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{p.role || '–'} · {p.project_count} project(s)</div>
              </button>
            ))}
          </div>
        </div>
        <div style={card}>
          {!personDetail ? (
            <p style={{ color: 'var(--text-muted)' }}>Select a person to see their projects and activities.</p>
          ) : (
            <>
              <div style={{ marginBottom: '1rem' }}>
                <h3 style={{ margin: 0 }}>{personDetail.name}</h3>
                <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>{personDetail.email} · {personDetail.role || '–'}</p>
                <button type="button" onClick={() => showCheck(personDetail.id)} style={{ ...btnSecondary, marginTop: '0.5rem', fontSize: '0.9rem' }}>Check availability</button>
              </div>
              <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem' }}>Projects</h4>
              {!personDetail.projects?.length ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Not assigned to any project.</p>
              ) : (
                <ul style={{ margin: '0 0 1rem', paddingLeft: '1.25rem' }}>
                  {personDetail.projects.map(pr => (
                    <li key={pr.id}><Link to={`/projects/${pr.project_id}`}>{pr.project_name}</Link> – {pr.role_in_project || '–'} ({pr.allocation_percent}%)</li>
                  ))}
                </ul>
              )}
              <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem' }}>Recent activities</h4>
              {!personDetail.activities?.length ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No activities logged.</p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.9rem' }}>
                  {personDetail.activities.slice(0, 10).map(a => (
                    <li key={a.id}><span style={{ color: 'var(--text-muted)' }}>[{a.type}]</span> {a.title}{a.project_name && ` (${a.project_name})`} · {new Date(a.start_at).toLocaleString()}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>

      {/* Workload & availability */}
      <div style={{ ...card, marginTop: '1.5rem' }} className="filter-bar">
        <h2 style={{ margin: '0 0 1rem', fontSize: '1.1rem' }}>Workload & availability</h2>
        <label>From <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inputStyle} /></label>
        <label>To <input type="date" value={to} onChange={e => setTo(e.target.value)} style={inputStyle} /></label>
        <label>
          Check person
          <select value={checkId || ''} onChange={e => setCheckId(e.target.value ? +e.target.value : '')} style={inputStyle}>
            <option value="">Select...</option>
            {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <button type="button" onClick={runCheck} style={btnPrimary}>Check</button>
        {checkResult && <button type="button" onClick={clearCheck} style={btnSecondary}>Clear</button>}
      </div>

      {checkResult && (
        <div style={{ ...card, marginTop: '0.5rem', borderColor: checkResult.isOverloaded ? 'var(--warning)' : 'var(--border)' }}>
          <h3 style={{ margin: '0 0 0.5rem' }}>Availability: {checkResult.person.name}</h3>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Total allocation: <strong style={{ color: checkResult.isOverloaded ? 'var(--warning)' : 'var(--text)' }}>{checkResult.totalAllocation}%</strong>
            {' · '}Available: <strong style={{ color: 'var(--success)' }}>{checkResult.availabilityPercent}%</strong>
            {checkResult.isOverloaded && ' · Overloaded – consider reducing allocation or choosing someone else.'}
          </p>
          <div style={{ marginTop: '1rem' }}><strong>Current projects:</strong>
            <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.25rem' }}>
              {checkResult.currentProjects.map(pr => <li key={pr.id}>{pr.project_name} – {pr.allocation_percent}%</li>)}
            </ul>
          </div>
          {checkResult.activitiesInRange?.length > 0 && (
            <div style={{ marginTop: '1rem' }}><strong>Activities in period:</strong>
              <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.25rem', fontSize: '0.9rem' }}>
                {checkResult.activitiesInRange.map(a => <li key={a.id}>[{a.type}] {a.title} – {new Date(a.start_at).toLocaleString()} to {new Date(a.end_at).toLocaleTimeString()}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      <div style={{ ...card, marginTop: '1rem' }}>
        <h2 style={{ margin: '0 0 1rem', fontSize: '1.1rem' }}>Workload summary (all team)</h2>
        {!workload?.workload?.length ? (
          <p style={{ color: 'var(--text-muted)' }}>No team members.</p>
        ) : (
          <div className="table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Role</th>
                  <th style={thStyle}>Projects</th>
                  <th style={thStyle}>Allocation</th>
                  <th style={thStyle}>Availability</th>
                  <th style={thStyle}>Activities (period)</th>
                </tr>
              </thead>
              <tbody>
                {workload.workload.map(w => (
                  <tr key={w.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={tdStyle}>
                      <button type="button" onClick={() => { setCheckId(w.id); setSearchParams({ check: w.id }); api.availability.check(w.id, from, to).then(setCheckResult); }}
                        style={{ background: 'none', border: 'none', color: 'var(--accent)', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}>
                        {w.name}
                      </button>
                    </td>
                    <td style={tdStyle}>{w.role || '–'}</td>
                    <td style={tdStyle}>{w.projects.map(p => `${p.name} (${p.allocation}%)`).join(', ') || '–'}</td>
                    <td style={{ ...tdStyle, color: w.isOverloaded ? 'var(--warning)' : undefined }}>{w.totalAllocation}%</td>
                    <td style={{ ...tdStyle, color: w.availability > 20 ? 'var(--success)' : 'var(--text-muted)' }}>{w.availability}%</td>
                    <td style={tdStyle}>{w.activities.length} ({w.activityHours.toFixed(1)}h)</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
