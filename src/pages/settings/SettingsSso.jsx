import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../api';

export default function SettingsSso() {
  const { form, setForm, reload } = useOutletContext();
  const [saving, setSaving] = useState(false);
  const [secret, setSecret] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  if (!form) return null;

  const configured = Boolean(form.azure_ad_configured);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const callbackUrl = `${origin}/api/auth/microsoft/callback`;

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg('');
    setErr('');
    try {
      const body = {
        azure_ad_client_id: form.azure_ad_client_id || '',
        azure_ad_tenant_id: form.azure_ad_tenant_id || 'common',
        azure_ad_allow_signup: form.azure_ad_allow_signup !== false,
      };
      if (secret.trim()) body.azure_ad_client_secret = secret.trim();
      const saved = await api.settings.update(body);
      setForm((f) => ({
        ...f,
        azure_ad_client_id: saved.azure_ad_client_id || '',
        azure_ad_tenant_id: saved.azure_ad_tenant_id || 'common',
        azure_ad_allow_signup: saved.azure_ad_allow_signup !== false,
        azure_ad_secret_set: Boolean(saved.azure_ad_secret_set),
        azure_ad_configured: Boolean(saved.azure_ad_configured),
      }));
      setSecret('');
      setMsg(saved.azure_ad_configured
        ? 'Microsoft sign-in saved. Use Continue with Microsoft on the login page.'
        : 'Saved. Add an Application (client) ID to enable the button.');
      await reload();
    } catch (ex) {
      setErr(ex.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="settings-panel ui-card">
      <div className="settings-panel__header">
        <div className="settings-panel__header-text">
          <h2 className="settings-panel__title">Microsoft sign-in</h2>
          <p className="settings-panel__desc">
            Let people sign in with a work or personal Microsoft account (Azure AD / Entra ID).
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
          <h3 className="settings-panel__section-title">Azure app registration</h3>
          <p className="settings-panel__section-desc">
            In Microsoft Entra admin center, register a web app, then paste the IDs here.
            Redirect URI must be exactly:
          </p>
          <code className="settings-callback-url">{callbackUrl}</code>

          <div className="form-field">
            <label className="form-field__label" htmlFor="azure-client-id">Application (client) ID</label>
            <input
              id="azure-client-id"
              className="form-field__input"
              value={form.azure_ad_client_id || ''}
              onChange={(e) => setForm((f) => ({ ...f, azure_ad_client_id: e.target.value }))}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              autoComplete="off"
            />
          </div>
          <div className="form-field">
            <label className="form-field__label" htmlFor="azure-tenant-id">Directory (tenant) ID</label>
            <input
              id="azure-tenant-id"
              className="form-field__input"
              value={form.azure_ad_tenant_id || 'common'}
              onChange={(e) => setForm((f) => ({ ...f, azure_ad_tenant_id: e.target.value }))}
              placeholder="common"
              autoComplete="off"
            />
            <p className="settings-panel__section-desc">Use <code>common</code> for any Microsoft account, or your tenant GUID for company accounts only.</p>
          </div>
          <div className="form-field">
            <label className="form-field__label" htmlFor="azure-secret">Client secret</label>
            <input
              id="azure-secret"
              type="password"
              className="form-field__input"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder={form.azure_ad_secret_set ? 'Saved — leave blank to keep' : 'Optional for public clients with PKCE'}
              autoComplete="new-password"
            />
          </div>
          <label className="form-field" style={{ display: 'flex', gap: '0.55rem', alignItems: 'flex-start' }}>
            <input
              type="checkbox"
              checked={form.azure_ad_allow_signup !== false}
              onChange={(e) => setForm((f) => ({ ...f, azure_ad_allow_signup: e.target.checked }))}
            />
            <span>
              Create a C360 user automatically when a Microsoft account is not already in Users.
              First Microsoft sign-in on an empty system becomes Administrator.
            </span>
          </label>
        </div>
      </div>

      <div className="settings-panel__footer">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save Microsoft sign-in'}
        </button>
      </div>
    </form>
  );
}
