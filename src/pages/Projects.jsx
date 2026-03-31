import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { btnPrimary, btnSecondary, card, inputStyle } from '../styles/commonStyles';

export default function Projects() {
  const [projects, setProjects] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filterTag, setFilterTag] = useState('');
  const [form, setForm] = useState({ name: '', description: '', status: 'active', start_date: '', end_date: '', client_id: '', tags: [] });
  const [tagInput, setTagInput] = useState('');

  const load = () => api.projects.list(filterTag ? { tag: filterTag } : {}).then(setProjects).catch(console.error).finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, [filterTag]);

  useEffect(() => {
    api.projects.tagsList().then(setAllTags).catch(console.error);
    api.clients.list().then(setClients).catch(console.error);
  }, []);

  const addFormTag = (tag) => {
    const t = typeof tag === 'string' ? tag.trim() : tag;
    if (!t || form.tags.includes(t)) return;
    setForm(f => ({ ...f, tags: [...f.tags, t] }));
    if (typeof tag === 'string') setTagInput('');
  };

  const removeFormTag = (t) => setForm(f => ({ ...f, tags: f.tags.filter(x => x !== t) }));

  const formTagsAvailable = (allTags || []).filter(t => !(form.tags || []).includes(t));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    try {
      await api.projects.create({ ...form, client_id: form.client_id || undefined, tags: form.tags });
      setForm({ name: '', description: '', status: 'active', start_date: '', end_date: '', client_id: '', tags: [] });
      setTagInput('');
      setShowForm(false);
      load();
      api.projects.tagsList().then(setAllTags).catch(console.error);
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading) return <div style={{ padding: '2rem' }}>Loading...</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Projects</h1>
          <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0' }}>Create and manage projects. Use tags to group projects.</p>
        </div>
        <button type="button" onClick={() => setShowForm(!showForm)} style={btnPrimary}>
          {showForm ? 'Cancel' : '+ New project'}
        </button>
      </div>

      {allTags.length > 0 && (
        <div style={{ ...card, marginBottom: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginRight: '0.25rem' }}>Group by tag:</span>
          <button type="button" onClick={() => setFilterTag('')} style={{ ...btnTag, ...(filterTag === '' ? btnTagActive : {}) }}>All</button>
          {allTags.map(t => (
            <button key={t} type="button" onClick={() => setFilterTag(t)} style={{ ...btnTag, ...(filterTag === t ? btnTagActive : {}) }}>{t}</button>
          ))}
        </div>
      )}

      {showForm && (
        <div style={{ ...card, marginBottom: '1rem' }}>
          <h3 style={{ margin: '0 0 1rem' }}>New project</h3>
          <form onSubmit={submit} style={{ display: 'grid', gap: '0.75rem', maxWidth: 400 }}>
            <label>
              Name <span style={{ color: 'var(--danger)' }}>*</span>
              <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required style={inputStyle} />
            </label>
            <label>
              Description
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} style={inputStyle} />
            </label>
            <label>
              Tags (to group projects)
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.25rem' }}>
                {(form.tags || []).map(t => (
                  <span key={t} style={tagChip}>
                    {t} <button type="button" onClick={() => removeFormTag(t)} aria-label="Remove" style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: '0 0 0 4px', fontSize: '1rem' }}>×</button>
                  </span>
                ))}
                <input type="text" value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addFormTag(tagInput); } }} placeholder="Or type new tag, press Enter" style={{ ...inputStyle, width: 'auto', minWidth: 160, margin: 0 }} />
              </div>
              {formTagsAvailable.length > 0 && (
                <div style={{ marginTop: '0.5rem' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Choose existing: </span>
                  {formTagsAvailable.map(t => (
                    <button key={t} type="button" onClick={() => addFormTag(t)} style={tagChipButton}>{t}</button>
                  ))}
                </div>
              )}
            </label>
            <label>
              Client
              <select value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))} style={inputStyle}>
                <option value="">No client</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label>
              Status
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={inputStyle}>
                <option value="active">Active</option>
                <option value="on-hold">On hold</option>
                <option value="completed">Completed</option>
              </select>
            </label>
            <div className="form-row form-row-2">
              <label>
                Start date
                <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} style={inputStyle} />
              </label>
              <label>
                End date
                <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} style={inputStyle} />
              </label>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" style={btnPrimary}>Create</button>
              <button type="button" onClick={() => setShowForm(false)} style={btnSecondary}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {projects.length === 0 && !showForm ? (
          <div style={card}>
            <p style={{ color: 'var(--text-muted)' }}>No projects. Click &quot;+ New project&quot; to create one.</p>
          </div>
        ) : (
          projects.map(p => (
            <div key={p.id} style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <Link to={`/projects/${p.id}`} style={{ fontWeight: 600, fontSize: '1.05rem', color: 'inherit' }}>{p.name}</Link>
                {(p.tags || []).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.35rem' }}>
                    {(p.tags || []).map(t => (
                      <span key={t} style={tagChip} onClick={e => { e.preventDefault(); setFilterTag(t); }} title="Filter by this tag">{t}</span>
                    ))}
                  </div>
                )}
                {p.description && <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>{p.description}</p>}
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {p.client_name && <span>{p.client_name} · </span>}{p.member_count} members · {p.status} {p.start_date && `· ${p.start_date} – ${p.end_date || '–'}`}
                </p>
              </div>
              <Link to={`/projects/${p.id}`} style={btnSecondary}>View & assign team</Link>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const btnTag = { padding: '0.35rem 0.65rem', background: 'var(--surface-hover)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-muted)', fontSize: '0.85rem', cursor: 'pointer' };
const btnTagActive = { background: 'var(--accent)', color: 'white', borderColor: 'var(--accent)' };
const tagChip = { display: 'inline-flex', alignItems: 'center', padding: '0.2rem 0.5rem', background: 'var(--surface-hover)', borderRadius: 6, fontSize: '0.8rem', color: 'var(--text-muted)' };
const tagChipButton = { display: 'inline-flex', alignItems: 'center', padding: '0.25rem 0.5rem', margin: '0 0.25rem 0.25rem 0', background: 'var(--surface-hover)', border: '1px solid var(--border)', borderRadius: 6, fontSize: '0.8rem', color: 'var(--accent)', cursor: 'pointer' };
