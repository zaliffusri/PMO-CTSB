import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { btnPrimary, btnSecondary, btnSecondarySm, card, inputStyle, tdStyle, thStyle } from '../styles/commonStyles';

const ROLE_LABELS = { admin: 'Admin', pmo: 'PMO', finance: 'Finance', hr: 'HR', user: 'User' };
const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'pmo', label: 'PMO' },
  { value: 'finance', label: 'Finance' },
  { value: 'hr', label: 'HR' },
  { value: 'user', label: 'User' },
];

function roleLabel(role) {
  return ROLE_LABELS[role] || role;
}

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', role: 'user' });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', role: 'user', password: '', active: true });
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const editFirstFieldRef = useRef(null);

  const load = () => api.users.list().then(setUsers).catch(console.error).finally(() => setLoading(false));

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter && u.role !== roleFilter) return false;
      if (!q) return true;
      const name = (u.name || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [users, searchQuery, roleFilter]);

  const filtersActive = Boolean(searchQuery.trim() || roleFilter);

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (editingId == null) return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setEditingId(null);
        setEditForm({ name: '', email: '', role: 'user', password: '', active: true });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editingId]);

  useEffect(() => {
    if (editingId != null) {
      editFirstFieldRef.current?.focus();
    }
  }, [editingId]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) return;
    try {
      await api.users.create({
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
      });
      setForm({ name: '', email: '', role: 'user' });
      setShowForm(false);
      load();
    } catch (err) {
      alert(err.message);
    }
  };

  const startEdit = (u) => {
    setEditingId(u.id);
    setEditForm({
      name: u.name || '',
      email: u.email || '',
      role: u.role || 'user',
      password: '',
      active: u.active !== false,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ name: '', email: '', role: 'user', password: '', active: true });
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    if (!editForm.name.trim() || !editForm.email.trim()) return;
    try {
      const body = {
        name: editForm.name.trim(),
        email: editForm.email.trim(),
        role: editForm.role,
        active: editForm.active,
      };
      if (editForm.password.trim()) body.password = editForm.password;
      await api.users.update(editingId, body);
      cancelEdit();
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
          <h1>System Users</h1>
          <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0' }}>Admin can create and edit user accounts for this system.</p>
        </div>
        <button type="button" onClick={() => setShowForm(!showForm)} style={btnPrimary}>
          {showForm ? 'Cancel' : '+ Create user'}
        </button>
      </div>

      {showForm && (
        <div style={{ ...card, marginBottom: '1rem' }}>
          <h3 style={{ margin: '0 0 1rem' }}>Create user</h3>
          <form onSubmit={submit} style={{ display: 'grid', gap: '0.75rem', maxWidth: 420 }}>
            <label>
              Name <span style={{ color: 'var(--danger)' }}>*</span>
              <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required style={inputStyle} />
            </label>
            <label>
              Email <span style={{ color: 'var(--danger)' }}>*</span>
              <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required style={inputStyle} />
            </label>
            <label>
              Role
              <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} style={inputStyle}>
                {ROLE_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              New users get default password: <code>P@ssw0rd</code>
            </p>
            <button type="submit" style={btnPrimary}>Create</button>
          </form>
        </div>
      )}

      {editingId != null && (
        <div className="modal-backdrop" onClick={cancelEdit} role="presentation">
          <div
            className="modal-dialog"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-user-modal-title"
          >
            <div className="modal-dialog-header">
              <h2 id="edit-user-modal-title" className="modal-dialog-title">
                Edit user
                {editForm.email ? (
                  <span style={{ display: 'block', fontWeight: 400, fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    {editForm.email}
                  </span>
                ) : null}
              </h2>
              <button type="button" className="modal-dialog-close" onClick={cancelEdit} aria-label="Close dialog">
                ×
              </button>
            </div>
            <form onSubmit={saveEdit} style={{ display: 'grid', gap: '0.75rem' }}>
              <label>
                Name <span style={{ color: 'var(--danger)' }}>*</span>
                <input
                  ref={editFirstFieldRef}
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  required
                  style={inputStyle}
                />
              </label>
              <label>
                Email <span style={{ color: 'var(--danger)' }}>*</span>
                <input type="email" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} required style={inputStyle} />
              </label>
              <label>
                Role
                <select value={editForm.role} onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))} style={inputStyle}>
                  {ROLE_OPTIONS.map(({ value, label }) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                New password (optional)
                <input
                  type="password"
                  minLength={6}
                  value={editForm.password}
                  onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="Leave blank to keep current"
                  style={inputStyle}
                />
              </label>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                <button type="submit" style={btnPrimary}>Save</button>
                <button type="button" style={btnSecondarySm} onClick={cancelEdit}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div style={card}>
        {users.length > 0 && (
          <div
            className="filter-bar"
            style={{
              marginBottom: '1rem',
              paddingBottom: '1rem',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <label style={{ flex: '1 1 200px', minWidth: 0, maxWidth: '320px' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Search</span>
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Name or email…"
                aria-label="Search users by name or email"
                style={{ ...inputStyle, marginTop: 0 }}
              />
            </label>
            <label style={{ flex: '0 1 160px', minWidth: '140px' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Role</span>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                aria-label="Filter by role"
                style={{ ...inputStyle, marginTop: 0 }}
              >
                <option value="">All roles</option>
                {ROLE_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {filtersActive && (
              <button
                type="button"
                style={{ ...btnSecondary, alignSelf: 'flex-end', whiteSpace: 'nowrap' }}
                onClick={() => {
                  setSearchQuery('');
                  setRoleFilter('');
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {!users.length ? (
          <p style={{ color: 'var(--text-muted)' }}>No users found.</p>
        ) : !filteredUsers.length ? (
          <p style={{ color: 'var(--text-muted)' }}>
            No users match your search or role filter.
            {filtersActive && (
              <>
                {' '}
                <button type="button" style={{ ...btnSecondarySm, verticalAlign: 'baseline' }} onClick={() => { setSearchQuery(''); setRoleFilter(''); }}>
                  Clear filters
                </button>
              </>
            )}
          </p>
        ) : (
          <>
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Showing {filteredUsers.length} of {users.length} user{users.length !== 1 ? 's' : ''}
              {filtersActive ? ' (filtered)' : ''}
            </p>
            <div className="table-wrap">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                    <th style={thStyle}>Name</th>
                    <th style={thStyle}>Email</th>
                    <th style={thStyle}>Role</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>Created</th>
                    <th style={thStyle}></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u) => (
                    <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={tdStyle}>{u.name}</td>
                      <td style={tdStyle}>{u.email}</td>
                      <td style={tdStyle}>{roleLabel(u.role)}</td>
                      <td style={tdStyle}>
                        {u.active === false ? (
                          <span style={{ color: 'var(--danger)', fontWeight: 600 }}>Inactive</span>
                        ) : (
                          <span style={{ color: 'var(--success, #2e7d32)' }}>Active</span>
                        )}
                      </td>
                      <td style={tdStyle}>{new Date(u.created_at).toLocaleString()}</td>
                      <td style={tdStyle}>
                        <button type="button" style={btnSecondarySm} onClick={() => startEdit(u)}>
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
