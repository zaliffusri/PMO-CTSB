import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../api';

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
    <form onSubmit={save} className="settings-panel ui-card">
      <div className="settings-panel__header">
        <div className="settings-panel__header-text">
          <h2 className="settings-panel__title">Email notifications</h2>
          <p className="settings-panel__desc">
            SMTP used for activity invites and cancellation emails (Outlook / Teams / Google).
            {form.smtp_pass_set ? ' A password is already saved on the server.' : ''}
          </p>
        </div>
        <span className={`settings-status ${configured ? 'settings-status--ok' : 'settings-status--off'}`}>
          {configured ? 'Enabled' : 'Not configured'}
        </span>
      </div>

      <div className="settings-panel__body">
        {err && <p className="settings-alert settings-alert--error" role="alert">{err}</p>}
        {msg && <p className="settings-alert settings-alert--ok" role="status">{msg}</p>}

        <div className="settings-panel__section">
          <h3 className="settings-panel__section-title">Connection</h3>
          <p className="settings-panel__section-desc">Choose a provider and mailbox used to send calendar emails.</p>

          <div className="form-field">
            <label className="form-field__label" htmlFor="smtp-provider">Provider</label>
            <select
              id="smtp-provider"
              className="form-field__input ui-input"
              value={isOffice365 ? 'office365' : service}
              onChange={(e) => onProviderChange(e.target.value)}
            >
              <option value="office365">Microsoft 365 / Outlook</option>
              <option value="gmail">Gmail (App Password)</option>
              <option value="">Custom SMTP host</option>
            </select>
            {isOffice365 && (
              <span className="form-field__hint">
                Use your work email. Host is set to smtp.office365.com. If send fails, ask IT to enable SMTP AUTH.
              </span>
            )}
          </div>

          <div className="settings-grid-2">
            <div className="form-field">
              <label className="form-field__label" htmlFor="smtp-user">SMTP user</label>
              <input
                id="smtp-user"
                type="email"
                className="form-field__input ui-input"
                value={form.smtp_user || ''}
                onChange={(e) => setForm((f) => ({ ...f, smtp_user: e.target.value }))}
                placeholder={isOffice365 ? 'you@yourcompany.com' : 'you@gmail.com'}
                autoComplete="off"
              />
            </div>

            <div className="form-field">
              <label className="form-field__label" htmlFor="smtp-from">From address</label>
              <input
                id="smtp-from"
                type="email"
                className="form-field__input ui-input"
                value={form.smtp_from || ''}
                onChange={(e) => setForm((f) => ({ ...f, smtp_from: e.target.value }))}
                placeholder="Same as SMTP user"
                autoComplete="off"
              />
              <span className="form-field__hint">Usually the same as your SMTP username.</span>
            </div>
          </div>

          <div className="form-field">
            <label className="form-field__label" htmlFor="smtp-pass">
              {isOffice365 ? 'Microsoft 365 password' : 'App password / SMTP password'}
            </label>
            <input
              id="smtp-pass"
              type="password"
              className="form-field__input ui-input"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder={
                form.smtp_pass_set
                  ? 'Leave blank to keep current password'
                  : (isOffice365 ? 'Work account password (or app password if MFA)' : '16-character Gmail App Password')
              }
              autoComplete="new-password"
            />
            <span className="form-field__hint">
              {isGmail
                ? 'Use an App Password from the same Gmail as SMTP user (Google Account → Security → App passwords).'
                : isOffice365
                  ? 'If MFA is on, create an app password or ask IT for SMTP AUTH access.'
                  : 'Use the password for your SMTP account.'}
            </span>
          </div>

          {showCustomHost && (
            <>
              <div className="form-field">
                <label className="form-field__label" htmlFor="smtp-host">SMTP host</label>
                <input
                  id="smtp-host"
                  type="text"
                  className="form-field__input ui-input"
                  value={form.smtp_host || ''}
                  onChange={(e) => setForm((f) => ({ ...f, smtp_host: e.target.value }))}
                  placeholder="smtp.example.com"
                />
              </div>
              <div className="settings-grid-2">
                <div className="form-field">
                  <label className="form-field__label" htmlFor="smtp-port">Port</label>
                  <input
                    id="smtp-port"
                    type="number"
                    className="form-field__input ui-input"
                    value={form.smtp_port || 587}
                    onChange={(e) => setForm((f) => ({ ...f, smtp_port: e.target.value }))}
                  />
                </div>
                <label className="settings-check">
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
        </div>

        <div className="settings-panel__section">
          <h3 className="settings-panel__section-title">Send test email</h3>
          <p className="settings-panel__section-desc">Verify delivery after saving your connection details.</p>

          <div className="form-field">
            <label className="form-field__label" htmlFor="smtp-test-to">Recipient</label>
            <input
              id="smtp-test-to"
              type="email"
              className="form-field__input ui-input"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="Leave blank to use your login email"
            />
          </div>
        </div>
      </div>

      <div className="settings-panel__footer settings-panel__footer--split">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={sendTest}
          disabled={testing || !configured}
        >
          {testing ? 'Sending…' : 'Send test email'}
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save email settings'}
        </button>
      </div>
    </form>
  );
}
