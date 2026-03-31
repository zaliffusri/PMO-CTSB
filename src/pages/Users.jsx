import { useEffect, useState } from 'react';
import { api } from '../api';

const card = { background: 'var(--surface)', borderRadius: 'var(--radius)', padding: '1.25rem', border: '1px solid var(--border)' };
const inputStyle = { display: 'block', width: '100%', padding: '0.5rem 0.75rem', marginTop: '0.25rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' };
const btnPrimary = { padding: '0.5rem 1rem', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 8, fontWeight: 600 };
const thStyle = { padding: '0.6rem 0.5rem 0.6rem 0', color: 'var(--text-muted)', fontWeight: 600 };
const tdStyle = { padding: '0.6rem 0.5rem 0.6rem 0' };
const btnSecondary = { padding: '0.35rem 0.65rem', background: 'var(--surface-hover)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, fontSize: '0.85rem' };

const ROLE_LABELS = { admin: 'Admin', pmo: 'PMO', finance: 'Finance', user: 'User' };
function roleLabel(role) {
  return ROLE_LABELS[role] || role;
}

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', role: 'user' });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', role: 'user', password: '' });

  const load = () => api.users.list().then(setUsers).catch(console.error).finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

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
    setEditForm({ name: u.name || '', email: u.email || '', role: u.role || 'user', password: '' });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ name: '', email: '', role: 'user', password: '' });
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    if (!editForm.name.trim() || !editForm.email.trim()) return;
    try {
      const body = {
        name: editForm.name.trim(),
        email: editForm.email.trim(),
        role: editForm.role,
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
                <option value="admin">Admin</option>
                <option value="pmo">PMO</option>
                <option value="finance">Finance</option>
                <option value="user">User</option>
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
        <div style={{ ...card, marginBottom: '1rem' }}>
          <h3 style={{ margin: '0 0 1rem' }}>Edit user{editForm.email ? ` (${editForm.email})` : ''}</h3>
          <form onSubmit={saveEdit} style={{ display: 'grid', gap: '0.75rem', maxWidth: 420 }}>
            <label>
              Name <span style={{ color: 'var(--danger)' }}>*</span>
              <input type="text" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} required style={inputStyle} />
            </label>
            <label>
              Email <span style={{ color: 'var(--danger)' }}>*</span>
              <input type="email" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} required style={inputStyle} />
            </label>
            <label>
              Role
              <select value={editForm.role} onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))} style={inputStyle}>
                <option value="admin">Admin</option>
                <option value="pmo">PMO</option>
                <option value="finance">Finance</option>
                <option value="user">User</option>
              </select>
            </label>
            <label>
              New password (optional)
              <input type="password" minLength={6} value={editForm.password} onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))} placeholder="Leave blank to keep current" style={inputStyle} />
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button type="submit" style={btnPrimary}>Save</button>
              <button type="button" style={btnSecondary} onClick={cancelEdit}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div style={card}>
        {!users.length ? (
          <p style={{ color: 'var(--text-muted)' }}>No users found.</p>
        ) : (
          <div className="table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Email</th>
                  <th style={thStyle}>Role</th>
                  <th style={thStyle}>Created</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={tdStyle}>{u.name}</td>
                    <td style={tdStyle}>{u.email}</td>
                    <td style={tdStyle}>{roleLabel(u.role)}</td>
                    <td style={tdStyle}>{new Date(u.created_at).toLocaleString()}</td>
                    <td style={tdStyle}>
                      <button type="button" style={btnSecondary} onClick={() => startEdit(u)}>
                        {editingId === u.id ? 'Editing…' : 'Edit'}
                      </button>
                    </td>
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
