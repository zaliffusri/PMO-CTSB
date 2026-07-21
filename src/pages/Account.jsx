import { useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { useSubmitLock } from '../hooks/useSubmitLock';
import PageHeader from '../components/PageHeader';
import { resizeImageToDataUrl, IMAGE_PRESETS } from '../lib/imageResize';

const AVATAR_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';

const ROLE_LABELS = {
  admin: 'Administrator',
  pmo: 'PMO Officer',
  finance: 'Finance',
  hr: 'Human Resources',
  user: 'Team Member',
};

const ROLE_DESCRIPTIONS = {
  admin: 'Full system access — manage users, projects, settings, and audit history.',
  pmo: 'Manage projects, clients, assignments, and team scheduling.',
  finance: 'View projects and activities for financial reporting.',
  hr: 'View team calendar and schedules only.',
  user: 'Log activities and view your assignments and schedule.',
};

const ROLE_COLORS = {
  admin: '#dc2626',
  pmo: '#2563eb',
  finance: '#16a34a',
  hr: '#9333ea',
  user: '#64748b',
};

const STRENGTH_BUCKETS = [
  { label: 'Very weak', color: 'var(--danger)' },
  { label: 'Weak', color: 'var(--danger)' },
  { label: 'Fair', color: 'var(--warning)' },
  { label: 'Good', color: 'var(--accent)' },
  { label: 'Strong', color: 'var(--success)' },
  { label: 'Very strong', color: 'var(--success)' },
];

function getInitials(name, email) {
  const source = (name || email || '').trim();
  if (!source) return '?';
  const parts = source.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDate(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return '—';
  }
}

function passwordStrength(pw) {
  if (!pw) return { score: 0, label: '', color: 'var(--border)' };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return { score, ...STRENGTH_BUCKETS[Math.min(score, 5)] };
}

function tint(varName, pct = 15) {
  return `color-mix(in srgb, ${varName} ${pct}%, transparent)`;
}

function MessagePopup({ open, kind, message, onClose }) {
  if (!open) return null;
  const isError = kind === 'error';
  const color = isError ? 'var(--danger)' : 'var(--success)';
  const title = isError ? 'Something went wrong' : 'Success';
  const icon = isError ? '!' : '✓';
  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="modal-dialog"
        style={{ width: 'min(420px, 92vw)', maxWidth: '92vw' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-message-title"
      >
        <div className="modal-dialog-header">
          <h2 id="account-message-title" className="modal-dialog-title">
            {title}
          </h2>
          <button type="button" className="modal-dialog-close" onClick={onClose} aria-label="Close dialog">
            ×
          </button>
        </div>
        <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'flex-start', padding: '0.25rem 0 0.25rem' }}>
          <span
            aria-hidden
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: tint(color, 18),
              color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.1rem',
              fontWeight: 700,
              flexShrink: 0,
              border: `1px solid ${tint(color, 35)}`,
            }}
          >
            {icon}
          </span>
          <p style={{ margin: 0, lineHeight: 1.5, color: 'var(--text)', fontSize: '0.95rem' }}>
            {message}
          </p>
        </div>
      </div>
    </div>
  );
}

function PasswordField({ label, value, onChange, show, onToggleShow, autoComplete, children }) {
  return (
    <div className="form-field">
      <label className="form-field__label">{label}</label>
      <div className="password-field-wrap">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          className="form-field__input ui-input"
          autoComplete={autoComplete}
        />
        <button
          type="button"
          onClick={onToggleShow}
          tabIndex={-1}
          aria-label={show ? 'Hide password' : 'Show password'}
          className="password-field-toggle"
        >
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
      {children}
    </div>
  );
}

export default function Account() {
  const { user, updateUser } = useAuth();
  const [form, setForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [showPw, setShowPw] = useState({ current: false, next: false, confirm: false });
  const { pending: saving, run } = useSubmitLock();
  const [popup, setPopup] = useState({ open: false, kind: 'success', message: '' });
  const [copied, setCopied] = useState(false);

  const fileInputRef = useRef(null);
  const [avatarBusy, setAvatarBusy] = useState(false);

  const showSuccess = (message) => setPopup({ open: true, kind: 'success', message });
  const showError = (message) => setPopup({ open: true, kind: 'error', message });
  const closePopup = () => setPopup((p) => ({ ...p, open: false }));

  const role = user?.role || 'user';
  const roleColor = ROLE_COLORS[role] || ROLE_COLORS.user;
  const initials = useMemo(() => getInitials(user?.name, user?.email), [user?.name, user?.email]);
  const strength = useMemo(() => passwordStrength(form.new_password), [form.new_password]);

  const memberSinceDays = useMemo(() => {
    if (!user?.created_at) return null;
    const diff = Date.now() - new Date(user.created_at).getTime();
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
  }, [user?.created_at]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.current_password || !form.new_password || !form.confirm_password) {
      showError('Please fill in all password fields.');
      return;
    }
    if (form.new_password.length < 6) {
      showError('New password must be at least 6 characters.');
      return;
    }
    if (form.new_password !== form.confirm_password) {
      showError('New password and confirmation do not match.');
      return;
    }
    if (form.new_password === form.current_password) {
      showError('New password must be different from your current password.');
      return;
    }
    await run(async () => {
      try {
        await api.auth.changePassword({
          current_password: form.current_password,
          new_password: form.new_password,
        });
        showSuccess('Password updated successfully. Please use your new password on next sign-in.');
        setForm({ current_password: '', new_password: '', confirm_password: '' });
      } catch (e2) {
        showError(e2.message || 'Failed to change password.');
      }
    });
  };

  const copyEmail = async () => {
    if (!user?.email) return;
    try {
      await navigator.clipboard.writeText(user.email);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be unavailable; silently ignore.
    }
  };

  const handleAvatarFile = async (file) => {
    if (!file) return;
    setAvatarBusy(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file, IMAGE_PRESETS.avatar);
      const res = await api.auth.uploadAvatar(dataUrl);
      updateUser({ avatar_url: res?.user?.avatar_url ?? dataUrl });
      showSuccess('Profile picture updated.');
    } catch (e) {
      showError(e.message || 'Failed to update profile picture.');
    } finally {
      setAvatarBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const removeAvatar = async () => {
    if (!user?.avatar_url) return;
    if (!window.confirm('Remove your profile picture?')) return;
    setAvatarBusy(true);
    try {
      await api.auth.deleteAvatar();
      updateUser({ avatar_url: null });
      showSuccess('Profile picture removed.');
    } catch (e) {
      showError(e.message || 'Failed to remove profile picture.');
    } finally {
      setAvatarBusy(false);
    }
  };

  if (!user) return null;

  const statusColor = user.active ? 'var(--success)' : 'var(--danger)';

  return (
    <div className="page-module account-page">
      <PageHeader
        title="My account"
        subtitle="Manage your profile, role, and account security."
      />

      <div
        className="ui-card account-profile-card"
        style={{
          border: `2px solid ${tint(roleColor, 35)}`,
          boxShadow: `0 4px 14px ${roleColor}33`,
        }}
      >
        <div
          className="account-avatar-shell"
          style={{
            border: `2px solid ${tint(roleColor, 35)}`,
            boxShadow: `0 4px 14px ${roleColor}33`,
          }}
          role="group"
          aria-label={`${user.name || user.email || 'Your'} profile picture`}
        >
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: user.avatar_url
                ? 'var(--surface)'
                : `linear-gradient(135deg, ${roleColor}, ${roleColor}cc)`,
              color: 'white',
              fontSize: '1.85rem',
              fontWeight: 700,
            }}
          >
            {user.avatar_url ? (
              <img
                src={user.avatar_url}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            ) : (
              <span aria-hidden>{initials}</span>
            )}
          </div>
          <div className="account-avatar-overlay">
            <button
              type="button"
              onClick={openFilePicker}
              disabled={avatarBusy}
              title={user.avatar_url ? 'Change profile picture' : 'Add profile picture'}
              style={{
                padding: '0.28rem 0.55rem',
                fontSize: '0.72rem',
                fontWeight: 600,
                border: 'none',
                borderRadius: 6,
                cursor: avatarBusy ? 'wait' : 'pointer',
                background: 'rgba(255, 255, 255, 0.22)',
                color: '#fff',
                whiteSpace: 'nowrap',
              }}
            >
              {user.avatar_url ? 'Change' : 'Add photo'}
            </button>
            {user.avatar_url && (
              <button
                type="button"
                onClick={removeAvatar}
                disabled={avatarBusy}
                title="Remove profile picture"
                style={{
                  padding: '0.28rem 0.55rem',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: 6,
                  cursor: avatarBusy ? 'wait' : 'pointer',
                  background: 'rgba(239, 68, 68, 0.4)',
                  color: '#fecaca',
                  whiteSpace: 'nowrap',
                }}
              >
                Remove
              </button>
            )}
          </div>
          {avatarBusy && (
            <div className="account-avatar-busy" aria-live="polite">
              Saving…
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept={AVATAR_ACCEPT}
            onChange={(e) => handleAvatarFile(e.target.files?.[0])}
            style={{ display: 'none' }}
          />
        </div>
        <div style={{ flex: '1 1 280px', minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              gap: '0.5rem',
              alignItems: 'center',
              flexWrap: 'wrap',
              marginBottom: '0.4rem',
            }}
          >
            <h2 style={{ margin: 0, fontSize: '1.35rem', lineHeight: 1.2 }}>
              {user.name || 'Unnamed user'}
            </h2>
            <span
              style={{
                padding: '0.2rem 0.65rem',
                borderRadius: 999,
                background: tint(roleColor, 18),
                color: roleColor,
                fontWeight: 600,
                fontSize: '0.75rem',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                border: `1px solid ${tint(roleColor, 35)}`,
              }}
            >
              {ROLE_LABELS[role] || role}
            </span>
            <span
              style={{
                padding: '0.2rem 0.65rem',
                borderRadius: 999,
                background: tint(statusColor, 15),
                color: statusColor,
                fontWeight: 600,
                fontSize: '0.78rem',
                border: `1px solid ${tint(statusColor, 30)}`,
              }}
            >
              ● {user.active ? 'Active' : 'Inactive'}
            </span>
          </div>
          <div
            style={{
              color: 'var(--text-muted)',
              fontSize: '0.9rem',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.35rem 1rem',
            }}
          >
            <span>{user.email}</span>
            <span aria-hidden>·</span>
            <span>Member since {formatDate(user.created_at)}</span>
            {memberSinceDays != null && (
              <>
                <span aria-hidden>·</span>
                <span>
                  {memberSinceDays} day{memberSinceDays === 1 ? '' : 's'}
                </span>
              </>
            )}
          </div>
        </div>
        <button type="button" className="btn btn-secondary" onClick={copyEmail}>
          {copied ? '✓ Copied' : 'Copy email'}
        </button>
      </div>

      <div className="account-sections-grid">
        <section className="ui-card account-section-card">
          <h3 style={{ marginTop: 0, marginBottom: '0.3rem' }}>Account information</h3>
          <p style={{ color: 'var(--text-muted)', marginTop: 0, marginBottom: '1rem', fontSize: '0.88rem' }}>
            Profile details linked to your account. To change name, email, or role, please contact an administrator.
          </p>
          <dl className="account-dl">
            <dt>Full name</dt>
            <dd>{user.name || '—'}</dd>

            <dt>Email address</dt>
            <dd>{user.email}</dd>

            <dt>Role</dt>
            <dd style={{ margin: 0 }}>
              <div style={{ fontWeight: 500 }}>{ROLE_LABELS[role] || role}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.2rem', lineHeight: 1.5 }}>
                {ROLE_DESCRIPTIONS[role] || 'Standard access.'}
              </div>
            </dd>

            <dt>Status</dt>
            <dd style={{ margin: 0 }}>
              <span style={{ color: statusColor, fontWeight: 500 }}>
                {user.active ? 'Active' : 'Inactive'}
              </span>
              {!user.active && (
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginLeft: '0.4rem' }}>
                  — contact an administrator
                </span>
              )}
            </dd>

            <dt>Member since</dt>
            <dd>{formatDate(user.created_at)}</dd>
          </dl>
        </section>

        <section className="ui-card account-section-card">
          <h3 style={{ marginTop: 0, marginBottom: '0.3rem' }}>Change password</h3>
          <p style={{ color: 'var(--text-muted)', marginTop: 0, marginBottom: '1rem', fontSize: '0.88rem' }}>
            Update your password regularly. Use at least 8 characters with a mix of letters, numbers, and symbols.
          </p>

          <form onSubmit={submit} className="form-stack">
            <PasswordField
              label="Current password"
              value={form.current_password}
              onChange={(e) => setForm((f) => ({ ...f, current_password: e.target.value }))}
              show={showPw.current}
              onToggleShow={() => setShowPw((s) => ({ ...s, current: !s.current }))}
              autoComplete="current-password"
            />

            <PasswordField
              label="New password"
              value={form.new_password}
              onChange={(e) => setForm((f) => ({ ...f, new_password: e.target.value }))}
              show={showPw.next}
              onToggleShow={() => setShowPw((s) => ({ ...s, next: !s.next }))}
              autoComplete="new-password"
            >
              {form.new_password && (
                <div style={{ marginTop: '0.45rem' }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        style={{
                          flex: 1,
                          height: 4,
                          borderRadius: 2,
                          background: i < strength.score ? strength.color : 'var(--border)',
                          transition: 'background 0.2s',
                        }}
                      />
                    ))}
                  </div>
                  <div style={{ marginTop: '0.3rem', fontSize: '0.8rem', color: strength.color, fontWeight: 500 }}>
                    {strength.label}
                  </div>
                </div>
              )}
            </PasswordField>

            <PasswordField
              label="Confirm new password"
              value={form.confirm_password}
              onChange={(e) => setForm((f) => ({ ...f, confirm_password: e.target.value }))}
              show={showPw.confirm}
              onToggleShow={() => setShowPw((s) => ({ ...s, confirm: !s.confirm }))}
              autoComplete="new-password"
            >
              {form.confirm_password && form.new_password && form.confirm_password !== form.new_password && (
                <div style={{ marginTop: '0.3rem', fontSize: '0.8rem', color: 'var(--danger)' }}>
                  Passwords do not match
                </div>
              )}
            </PasswordField>

            <div>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Updating…' : 'Update password'}
              </button>
            </div>
          </form>
        </section>
      </div>

      <section className="ui-card account-section-card" style={{ marginTop: '1rem' }}>
        <h3 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Security best practices</h3>
        <ul
          style={{
            margin: 0,
            paddingLeft: '1.2rem',
            color: 'var(--text-muted)',
            fontSize: '0.92rem',
            lineHeight: 1.7,
          }}
        >
          <li>Use a unique password for this system — do not reuse passwords from personal or other work accounts.</li>
          <li>Combine uppercase, lowercase, numbers, and symbols. Length matters more than complexity — aim for 12+ characters.</li>
          <li>Change your password immediately if you suspect it was compromised, and notify an administrator.</li>
          <li>Never share your credentials. Administrators will never ask for your password.</li>
          <li>Always sign out when using shared or public devices.</li>
        </ul>
      </section>

      <MessagePopup
        open={popup.open}
        kind={popup.kind}
        message={popup.message}
        onClose={closePopup}
      />
    </div>
  );
}
