import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../api';
import { btnPrimary, btnSecondary, card, inputStyle, labelMuted } from './settingsStyles';

const OFFICE365 = {
  smtp_service: 'office365',
  smtp_host: 'smtp.office365.com',
  smtp_port: 587,
  smtp_secure: false,
};

export default function SettingsEmail() {
  const { form, setForm, reload } = useOutletContext();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [pass, setPass] = useState('');
  const [testTo, setTestTo] = useState('');

  if (!form) return null;

  const service = form.smtp_service || 'gmail';
  const configured = Boolean(form.smtp_configured);
  const isOffice365 = service === 'office365' || service === 'outlook' || service === 'microsoft365';
  const isGmail = service === 'gmail';
  const showCustomHost = !isGmail && !isOffice365;

  const onProviderChange = (value) => {
    if (value === 'office365') {
      setForm((f) => ({ ...f, ...OFFICE365 }));
      return;
    }
    if (value === 'gmail') {
      setForm((f) => ({
        ...f,
        smtp_service: 'gmail',
        smtp_host: '',
        smtp_port: 587,
        smtp_secure: false,
      }));
      return;
    }
    setForm((f) => ({ ...f, smtp_service: '' }));
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg('');
    setErr('');
    try {
      const nextService = form.smtp_service || 'gmail';
      const body = {
        smtp_service: nextService,
        smtp_host: nextService === 'office365' || nextService === 'outlook'
          ? 'smtp.office365.com'
          : (form.smtp_host || ''),
        smtp_port: nextService === 'office365' || nextService === 'outlook'
          ? 587
          : (Number(form.smtp_port) || 587),
        smtp_secure: nextService === 'office365' || nextService === 'outlook'
          ? false
          : Boolean(form.smtp_secure),
        smtp_user: form.smtp_user || '',
        smtp_from: form.smtp_from || form.smtp_user || '',
      };
      if (pass.trim()) body.smtp_pass = pass.trim();
      const saved = await api.settings.update(body);
      setForm((f) => ({
        ...f,
        smtp_service: saved.smtp_service || '',
        smtp_host: saved.smtp_host || '',
        smtp_port: saved.smtp_port || 587,
        smtp_secure: Boolean(saved.smtp_secure),
        smtp_user: saved.smtp_user || '',
        smtp_from: saved.smtp_from || '',
        smtp_pass_set: Boolean(saved.smtp_pass_set),
        smtp_configured: Boolean(saved.smtp_configured),
      }));
      setPass('');
      const svc = String(saved.smtp_service || '').toLowerCase();
      setMsg(saved.smtp_configured
        ? (svc === 'office365' || svc === 'outlook'
          ? 'Microsoft 365 email saved. Teams/Outlook should accept calendar invites and cancellations.'
          : 'Email settings saved. Calendar assign notifications are enabled.')
        : 'Saved, but SMTP is still incomplete — check user, from, and password.');
      await reload();
    } catch (ex) {
      setErr(ex.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    setMsg('');
    setErr('');
    try {
      const r = await api.settings.testEmail({ to: testTo.trim() || undefined });
      setMsg(`Test email sent to ${r.to}. Check inbox (and Spam).`);
    } catch (ex) {
      setErr(ex.message || 'Test email failed');
    } finally {
      setTesting(false);
    }
  };

  return (
    <form onSubmit={save} style={card}>
      <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Email notifications (SMTP)</h2>
      <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
        For <strong>Teams calendar invite + cancel</strong>, use <strong>Microsoft 365</strong> with your work email
        (not Gmail). Status:{' '}
        <strong style={{ color: configured ? 'var(--success, #0a7)' : 'var(--danger)' }}>
          {configured ? 'Enabled' : 'Not configured'}
        </strong>
        {form.smtp_pass_set ? ' · password saved' : ''}
      </p>

      {msg && <p style={{ color: 'var(--success, #0a7)' }}>{msg}</p>}
      {err && <p style={{ color: 'var(--danger)' }}>{err}</p>}

      <label style={{ display: 'block', marginBottom: '0.75rem' }}>
        Provider
        <select
          value={isOffice365 ? 'office365' : service}
          onChange={(e) => onProviderChange(e.target.value)}
          style={{ ...inputStyle, display: 'block', width: '100%', marginTop: '0.35rem' }}
        >
          <option value="office365">Microsoft 365 / Outlook (recommended for Teams)</option>
          <option value="gmail">Gmail (App Password)</option>
          <option value="">Custom SMTP host</option>
        </select>
      </label>

      {isOffice365 && (
        <p style={{ ...labelMuted, marginTop: 0, marginBottom: '0.85rem' }}>
          Use the same work email you use for Teams (e.g. name@company.com). Host is set to smtp.office365.com automatically.
          If send fails, ask IT to enable <strong>SMTP AUTH</strong> for that mailbox.
        </p>
      )}

      <label style={{ display: 'block', marginBottom: '0.75rem' }}>
        SMTP user (login email)
        <input
          type="email"
          value={form.smtp_user || ''}
          onChange={(e) => setForm((f) => ({ ...f, smtp_user: e.target.value }))}
          placeholder={isOffice365 ? 'you@yourcompany.com' : 'you@gmail.com'}
          style={{ ...inputStyle, display: 'block', width: '100%', marginTop: '0.35rem' }}
          autoComplete="off"
        />
      </label>

      <label style={{ display: 'block', marginBottom: '0.75rem' }}>
        From address (sender)
        <input
          type="email"
          value={form.smtp_from || ''}
          onChange={(e) => setForm((f) => ({ ...f, smtp_from: e.target.value }))}
          placeholder="Same as SMTP user"
          style={{ ...inputStyle, display: 'block', width: '100%', marginTop: '0.35rem' }}
          autoComplete="off"
        />
        <span style={labelMuted}>Must match your Microsoft 365 mailbox for Teams calendar cancel to work well.</span>
      </label>

      <label style={{ display: 'block', marginBottom: '0.75rem' }}>
        {isOffice365 ? 'Microsoft 365 password' : 'App password / SMTP password'}
        <input
          type="password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          placeholder={
            form.smtp_pass_set
              ? 'Leave blank to keep current password'
              : (isOffice365 ? 'Work account password (or app password if MFA)' : '16-character Gmail App Password')
          }
          style={{ ...inputStyle, display: 'block', width: '100%', marginTop: '0.35rem' }}
          autoComplete="new-password"
        />
        <span style={labelMuted}>
          {isGmail
            ? 'Gmail: Google Account → Security → 2-Step Verification → App passwords.'
            : isOffice365
              ? 'If your account has MFA, create an app password or ask IT for SMTP AUTH access.'
              : 'Use the password for your SMTP account.'}
        </span>
      </label>

      {showCustomHost && (
        <>
          <label style={{ display: 'block', marginBottom: '0.75rem' }}>
            SMTP host
            <input
              type="text"
              value={form.smtp_host || ''}
              onChange={(e) => setForm((f) => ({ ...f, smtp_host: e.target.value }))}
              placeholder="smtp.example.com"
              style={{ ...inputStyle, display: 'block', width: '100%', marginTop: '0.35rem' }}
            />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <label>
              Port
              <input
                type="number"
                value={form.smtp_port || 587}
                onChange={(e) => setForm((f) => ({ ...f, smtp_port: e.target.value }))}
                style={{ ...inputStyle, display: 'block', width: '100%', marginTop: '0.35rem' }}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.5rem' }}>
              <input
                type="checkbox"
                checked={Boolean(form.smtp_secure)}
                onChange={(e) => setForm((f) => ({ ...f, smtp_secure: e.target.checked }))}
              />
              Use TLS/SSL (secure)
            </label>
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
        <button type="submit" className="btn btn-primary" style={btnPrimary} disabled={saving}>
          {saving ? 'Saving…' : 'Save email settings'}
        </button>
      </div>

      <hr style={{ margin: '1.5rem 0', border: 0, borderTop: '1px solid var(--border)' }} />

      <h3 style={{ fontSize: '1rem', marginTop: 0 }}>Send test email</h3>
      <label style={{ display: 'block', marginBottom: '0.75rem' }}>
        Recipient
        <input
          type="email"
          value={testTo}
          onChange={(e) => setTestTo(e.target.value)}
          placeholder="Leave blank to use your login email"
          style={{ ...inputStyle, display: 'block', width: '100%', marginTop: '0.35rem' }}
        />
      </label>
      <button
        type="button"
        className="btn btn-secondary"
        style={btnSecondary}
        onClick={sendTest}
        disabled={testing || !configured}
      >
        {testing ? 'Sending…' : 'Send test email'}
      </button>
    </form>
  );
}
