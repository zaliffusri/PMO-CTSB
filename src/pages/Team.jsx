import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { btnPrimary, card, inputStyle, tdStyle, thStyle } from '../styles/commonStyles';
import { useSubmitLock } from '../hooks/useSubmitLock';

export default function Team() {
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', role: '' });
  const [selected, setSelected] = useState(null);
  const [personDetail, setPersonDetail] = useState(null);
  const [workload, setWorkload] = useState(null);
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const { pending: saving, run } = useSubmitLock();

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

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    await run(async () => {
      try {
        await api.people.create(form);
        setForm({ name: '', email: '', role: '' });
        setShowForm(false);
        load();
      } catch (err) {
        alert(err.message);
      }
    });
  };

  if (loading) return <div style={{ padding: '2rem' }}>Loading...</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Team</h1>
          <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0' }}>Manage people and see their projects and activities. Log activities in Calendar.</p>
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
            <button type="submit" style={btnPrimary} disabled={saving}>{saving ? 'Adding…' : 'Add'}</button>
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
              </div>
              <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem' }}>Projects</h4>
              {!personDetail.projects?.length ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Not assigned to any project.</p>
              ) : (
                <ul style={{ margin: '0 0 1rem', paddingLeft: '1.25rem' }}>
                  {personDetail.projects.map(pr => (
                    <li key={pr.id}><Link to={`/projects/${pr.project_id}`}>{pr.project_name}</Link> – {pr.role_in_project || '–'}</li>
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

      <div style={{ ...card, marginTop: '1.5rem' }} className="filter-bar">
        <div style={{ width: '100%' }}>
          <h2 style={{ margin: '0 0 0.35rem', fontSize: '1.1rem' }}>Workload summary (all team)</h2>
          <p style={{ margin: '0 0 1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Active projects only. <strong>Projects</strong> is how many they are assigned to. <strong>Tasks</strong> are all tasks on those projects (status: new, ongoing, or done).{' '}
            <strong>Not done</strong> = new + ongoing.
          </p>
        </div>
        <label>From <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inputStyle} /></label>
        <label>To <input type="date" value={to} onChange={e => setTo(e.target.value)} style={inputStyle} /></label>
      </div>

      <div style={{ ...card, marginTop: '1rem' }}>
        {!workload?.workload?.length ? (
          <p style={{ color: 'var(--text-muted)' }}>No team members.</p>
        ) : (
          <div className="table-wrap">
            <table className="team-workload-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Role</th>
                  <th style={thStyle}>Projects</th>
                  <th style={thStyle} title="Tasks not started">New</th>
                  <th style={thStyle} title="Tasks in progress">Ongoing</th>
                  <th style={thStyle} title="Tasks completed">Done</th>
                  <th style={thStyle} title="New + ongoing">Not done</th>
                  <th style={thStyle}>Activities (period)</th>
                </tr>
              </thead>
              <tbody>
                {workload.workload.map((w) => {
                  const ts = w.taskSummary || { new: 0, ongoing: 0, done: 0, notDone: 0 };
                  const nProj = w.projectCount ?? w.projects?.length ?? 0;
                  return (
                    <tr key={w.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={tdStyle}>{w.name}</td>
                      <td style={tdStyle}>{w.role || '–'}</td>
                      <td style={tdStyle}>{nProj}</td>
                      <td style={tdStyle}>{ts.new}</td>
                      <td style={tdStyle}>{ts.ongoing}</td>
                      <td style={tdStyle}>{ts.done}</td>
                      <td style={tdStyle}>{ts.notDone ?? ts.new + ts.ongoing}</td>
                      <td style={tdStyle}>{w.activities.length} ({w.activityHours.toFixed(1)}h)</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
