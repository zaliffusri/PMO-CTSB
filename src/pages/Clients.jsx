import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { btnPrimary, btnSecondary, card, inputStyle } from '../styles/commonStyles';

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', contact_name: '', email: '', phone: '' });

  const load = () => api.clients.list().then(setClients).catch(console.error).finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    try {
      await api.clients.create(form);
      setForm({ name: '', contact_name: '', email: '', phone: '' });
      setShowForm(false);
      load();
    } catch (err) {
      alert(err.message);
    }
  };

  const remove = async (id, name) => {
    if (!confirm(`Remove client "${name}"? Projects will be unlinked.`)) return;
    try {
      await api.clients.delete(id);
      load();
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading) return <div style={{ padding: '2rem' }}>Loading...</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Clients</h1>
          <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0' }}>Manage clients. Link projects to clients when creating or editing a project.</p>
        </div>
        <button type="button" onClick={() => setShowForm(!showForm)} style={btnPrimary}>
          {showForm ? 'Cancel' : '+ Add client'}
        </button>
      </div>

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)} role="presentation">
          <div
            className="modal-dialog"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="client-create-modal-title"
          >
            <div className="modal-dialog-header">
              <h2 id="client-create-modal-title" className="modal-dialog-title">
                New client
              </h2>
              <button type="button" className="modal-dialog-close" onClick={() => setShowForm(false)} aria-label="Close dialog">
                ×
              </button>
            </div>
            <form onSubmit={submit} style={{ display: 'grid', gap: '0.75rem' }}>
              <label>Name <span style={{ color: 'var(--danger)' }}>*</span>
                <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required style={inputStyle} placeholder="Company or organisation" />
              </label>
              <label>Contact person
                <input type="text" value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} style={inputStyle} />
              </label>
              <label>Email
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={inputStyle} />
              </label>
              <label>Phone
                <input type="text" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} style={inputStyle} />
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="submit" style={btnPrimary}>Add client</button>
                <button type="button" onClick={() => setShowForm(false)} style={btnSecondary}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {clients.length === 0 && !showForm ? (
          <div style={card}>
            <p style={{ color: 'var(--text-muted)' }}>No clients yet. Add a client to link to projects.</p>
          </div>
        ) : (
          clients.map(c => (
            <div key={c.id} style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '1.05rem' }}>{c.name}</div>
                {(c.contact_name || c.email || c.phone) && (
                  <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    {c.contact_name && <span>{c.contact_name}</span>}
                    {c.email && <span>{c.contact_name ? ' · ' : ''}{c.email}</span>}
                    {c.phone && <span>{c.contact_name || c.email ? ' · ' : ''}{c.phone}</span>}
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <Link to="/projects" style={btnSecondary}>View projects</Link>
                <button type="button" onClick={() => remove(c.id, c.name)} style={{ ...btnSecondary, color: 'var(--danger)' }}>Remove</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
