import { useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { btnPrimary, btnSecondary, btnSecondarySm, card, inputStyle } from '../styles/commonStyles';
import { useSubmitLock } from '../hooks/useSubmitLock';

const AVATAR_MAX_DIM = 256;
const AVATAR_QUALITY = 0.85;
const AVATAR_INPUT_MAX_BYTES = 5 * 1024 * 1024;
const AVATAR_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';

async function resizeImageToDataUrl(file) {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please select an image file (PNG, JPG, WebP, or GIF).');
  }
  if (file.size > AVATAR_INPUT_MAX_BYTES) {
    throw new Error('Image is too large. Please choose a file under 5 MB.');
  }
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.readAsDataURL(file);
  });
  const img = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Selected file is not a valid image.'));
    image.src = dataUrl;
  });
  const { width: w, height: h } = img;
  const size = Math.min(w, h);
  const sx = Math.max(0, Math.floor((w - size) / 2));
  const sy = Math.max(0, Math.floor((h - size) / 2));
  const target = Math.min(AVATAR_MAX_DIM, size);
  const canvas = document.createElement('canvas');
  canvas.width = target;
  canvas.height = target;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Browser does not support image processing.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, size, size, 0, 0, target, target);
  return canvas.toDataURL('image/jpeg', AVATAR_QUALITY);
}

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
  hr: 'Manage team members and view activity logs.',
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
    <label>
      {label}
      <div style={{ position: 'relative' }}>
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          style={{ ...inputStyle, paddingRight: '3.25rem' }}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          onClick={onToggleShow}
          tabIndex={-1}
          aria-label={show ? 'Hide password' : 'Show password'}
          style={{
            position: 'absolute',
            right: 8,
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: '0.25rem 0.5rem',
            fontSize: '0.85rem',
            fontWeight: 500,
          }}
        >
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
      {children}
    </label>
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
      const dataUrl = await resizeImageToDataUrl(file);
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
  const labelStyle = { color: 'var(--text-muted)', fontSize: '0.85rem' };
  const valueStyle = { margin: 0, fontWeight: 500 };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>My Account</h1>
          <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0' }}>
            Manage your profile and account security.
          </p>
        </div>
      </div>

      <div
        style={{
          ...card,
          padding: '1.5rem',
          marginBottom: '1rem',
          display: 'flex',
          gap: '1.25rem',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={openFilePicker}
            disabled={avatarBusy}
            title={user.avatar_url ? 'Change profile picture' : 'Add profile picture'}
            aria-label={user.avatar_url ? 'Change profile picture' : 'Add profile picture'}
            style={{
              width: 88,
              height: 88,
              borderRadius: '50%',
              padding: 0,
              border: `2px solid ${tint(roleColor, 35)}`,
              background: user.avatar_url
                ? 'var(--surface)'
                : `linear-gradient(135deg, ${roleColor}, ${roleColor}cc)`,
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.85rem',
              fontWeight: 700,
              flexShrink: 0,
              cursor: avatarBusy ? 'wait' : 'pointer',
              overflow: 'hidden',
              boxShadow: `0 4px 14px ${roleColor}33`,
              position: 'relative',
            }}
          >
            {user.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={`${user.name || 'User'} profile picture`}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            ) : (
              <span>{initials}</span>
            )}
            {avatarBusy && (
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(0,0,0,0.45)',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  borderRadius: '50%',
                }}
              >
                Saving…
              </span>
            )}
          </button>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button type="button" onClick={openFilePicker} style={btnSecondarySm} disabled={avatarBusy}>
              {user.avatar_url ? 'Change' : 'Upload'}
            </button>
            {user.avatar_url && (
              <button
                type="button"
                onClick={removeAvatar}
                style={{ ...btnSecondarySm, color: 'var(--danger)' }}
                disabled={avatarBusy}
              >
                Remove
              </button>
            )}
          </div>
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
        <button type="button" onClick={copyEmail} style={btnSecondary}>
          {copied ? '✓ Copied' : 'Copy email'}
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '1rem',
        }}
      >
        <section style={card}>
          <h3 style={{ marginTop: 0, marginBottom: '0.3rem' }}>Account information</h3>
          <p style={{ color: 'var(--text-muted)', marginTop: 0, marginBottom: '1rem', fontSize: '0.88rem' }}>
            Profile details linked to your account. To change name, email, or role, please contact an administrator.
          </p>
          <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.7rem 1.25rem', margin: 0 }}>
            <dt style={labelStyle}>Full name</dt>
            <dd style={valueStyle}>{user.name || '—'}</dd>

            <dt style={labelStyle}>Email address</dt>
            <dd style={valueStyle}>{user.email}</dd>

            <dt style={labelStyle}>Role</dt>
            <dd style={{ margin: 0 }}>
              <div style={{ fontWeight: 500 }}>{ROLE_LABELS[role] || role}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.2rem', lineHeight: 1.5 }}>
                {ROLE_DESCRIPTIONS[role] || 'Standard access.'}
              </div>
            </dd>

            <dt style={labelStyle}>User ID</dt>
            <dd
              style={{
                margin: 0,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: '0.85rem',
                color: 'var(--text-muted)',
              }}
            >
              #{user.id}
            </dd>

            <dt style={labelStyle}>Status</dt>
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

            <dt style={labelStyle}>Member since</dt>
            <dd style={valueStyle}>{formatDate(user.created_at)}</dd>
          </dl>
        </section>

        <section style={card}>
          <h3 style={{ marginTop: 0, marginBottom: '0.3rem' }}>Change password</h3>
          <p style={{ color: 'var(--text-muted)', marginTop: 0, marginBottom: '1rem', fontSize: '0.88rem' }}>
            Update your password regularly. Use at least 8 characters with a mix of letters, numbers, and symbols.
          </p>

          <form onSubmit={submit} style={{ display: 'grid', gap: '0.85rem' }}>
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
              <button type="submit" style={btnPrimary} disabled={saving}>
                {saving ? 'Updating…' : 'Update password'}
              </button>
            </div>
          </form>
        </section>
      </div>

      <section style={{ ...card, marginTop: '1rem' }}>
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
