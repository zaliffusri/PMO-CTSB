import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { btnPrimary, card, inputStyle } from '../styles/commonStyles';

const ROLE_LABELS = { admin: 'Admin', pmo: 'PMO', finance: 'Finance', hr: 'HR', user: 'User' };

export default function Account() {
  const { user } = useAuth();
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setMsg('');
    setErr('');
    if (!form.current_password || !form.new_password || !form.confirm_password) {
      setErr('Please fill all password fields.');
      return;
    }
    if (form.new_password !== form.confirm_password) {
      setErr('New password and confirmation do not match.');
      return;
    }
    try {
      setSaving(true);
      await api.auth.changePassword({
        current_password: form.current_password,
        new_password: form.new_password,
      });
      setMsg('Password changed successfully.');
      setForm({ current_password: '', new_password: '', confirm_password: '' });
    } catch (e2) {
      setErr(e2.message || 'Failed to change password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>My Account</h1>
          <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0' }}>
            Signed in as <strong>{user?.name || user?.email}</strong> ({ROLE_LABELS[user?.role] ?? user?.role})
          </p>
        </div>
      </div>

      <div style={{ ...card, maxWidth: 520 }}>
        <h3 style={{ marginTop: 0 }}>Change password</h3>
        <p style={{ color: 'var(--text-muted)', marginTop: 0, fontSize: '0.9rem' }}>
          If your account was created by admin, your default password may be <code>P@ssw0rd</code>.
        </p>
        {msg && <div style={{ color: 'var(--success)', marginBottom: '0.5rem' }}>{msg}</div>}
        {err && <div style={{ color: 'var(--danger)', marginBottom: '0.5rem' }}>{err}</div>}
        <form onSubmit={submit} style={{ display: 'grid', gap: '0.75rem' }}>
          <label>
            Current password
            <input type="password" value={form.current_password} onChange={(e) => setForm((f) => ({ ...f, current_password: e.target.value }))} style={inputStyle} />
          </label>
          <label>
            New password
            <input type="password" minLength={6} value={form.new_password} onChange={(e) => setForm((f) => ({ ...f, new_password: e.target.value }))} style={inputStyle} />
          </label>
          <label>
            Confirm new password
            <input type="password" minLength={6} value={form.confirm_password} onChange={(e) => setForm((f) => ({ ...f, confirm_password: e.target.value }))} style={inputStyle} />
          </label>
          <div>
            <button type="submit" style={btnPrimary} disabled={saving}>{saving ? 'Saving...' : 'Update password'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
