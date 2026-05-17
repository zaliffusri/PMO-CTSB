import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { btnPrimary, btnSecondary, btnSecondarySm, card, inputStyle } from '../styles/commonStyles';
import { useSubmitLock } from '../hooks/useSubmitLock';

function clientMatchesSearch(client, q) {
  if (!q) return true;
  const haystack = [
    client.name,
    client.contact_name,
    client.email,
    client.phone,
    ...(client.projects || []).map((p) => p.name),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [form, setForm] = useState({ name: '', contact_name: '', email: '', phone: '' });
  const { pending: saving, run } = useSubmitLock();

  const load = () => api.clients.list().then(setClients).catch(console.error).finally(() => setLoading(false));

  const filteredClients = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return clients.filter((c) => clientMatchesSearch(c, q));
  }, [clients, searchQuery]);

  const searchActive = Boolean(searchQuery.trim());

  useEffect(() => {
    load();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    await run(async () => {
      try {
        await api.clients.create(form);
        setForm({ name: '', contact_name: '', email: '', phone: '' });
        setShowForm(false);
        load();
      } catch (err) {
        alert(err.message);
      }
    });
  };

  const remove = async (id, name) => {
    if (!confirm(`Remove client "${name}"? Projects will be unlinked.`)) return;
    await run(async () => {
      try {
        await api.clients.delete(id);
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
          <h1>Clients</h1>
          <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0' }}>Manage clients. Link projects to clients when creating or editing a project.</p>
        </div>
        <button type="button" onClick={() => setShowForm(!showForm)} style={btnPrimary}>
          {showForm ? 'Cancel' : '+ Add client'}
        </button>
      </div>

      {showForm && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-dialog"
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
                <button type="submit" style={btnPrimary} disabled={saving}>{saving ? 'Adding…' : 'Add client'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {clients.length > 0 && (
        <div
          className="filter-bar"
          style={{ ...card, marginBottom: '0.75rem', padding: '1rem' }}
        >
          <label style={{ flex: '1 1 240px', minWidth: 0, maxWidth: '400px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Search</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Name, contact, email, phone, or project…"
              aria-label="Search clients"
              style={{ ...inputStyle, marginTop: 0 }}
            />
          </label>
          {searchActive && (
            <button
              type="button"
              style={{ ...btnSecondary, alignSelf: 'flex-end', whiteSpace: 'nowrap' }}
              onClick={() => setSearchQuery('')}
            >
              Clear search
            </button>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {clients.length === 0 && !showForm ? (
          <div style={card}>
            <p style={{ color: 'var(--text-muted)' }}>No clients yet. Add a client to link to projects.</p>
          </div>
        ) : !filteredClients.length ? (
          <div style={card}>
            <p style={{ color: 'var(--text-muted)' }}>
              No clients match your search.
              {searchActive && (
                <>
                  {' '}
                  <button type="button" style={{ ...btnSecondarySm, verticalAlign: 'baseline' }} onClick={() => setSearchQuery('')}>
                    Clear search
                  </button>
                </>
              )}
            </p>
          </div>
        ) : (
          <>
            {searchActive && (
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Showing {filteredClients.length} of {clients.length} client{clients.length !== 1 ? 's' : ''}
              </p>
            )}
            {filteredClients.map((c) => (
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
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  {(c.projects?.length ?? 0) > 0 &&
                    c.projects.map((p) => (
                      <Link key={p.id} to={`/projects/${p.id}`} style={btnSecondary}>
                        {c.projects.length === 1 ? 'View project' : p.name}
                      </Link>
                    ))}
                  <button type="button" onClick={() => remove(c.id, c.name)} style={{ ...btnSecondary, color: 'var(--danger)' }} disabled={saving}>Remove</button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
