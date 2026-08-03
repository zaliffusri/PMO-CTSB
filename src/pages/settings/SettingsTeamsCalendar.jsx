import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../api';
import { btnPrimary, btnSecondary, card, inputStyle, labelMuted } from './settingsStyles';

export default function SettingsTeamsCalendar() {
  const { form, setForm, reload } = useOutletContext();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [secret, setSecret] = useState('');

  if (!form) return null;

  const configured = Boolean(form.ms_graph_configured);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg('');
    setErr('');
    try {
      const body = {
        ms_graph_tenant_id: form.ms_graph_tenant_id || '',
        ms_graph_client_id: form.ms_graph_client_id || '',
      };
      if (secret.trim()) body.ms_graph_client_secret = secret.trim();
      const saved = await api.settings.update(body);
      setForm((f) => ({
        ...f,
        ms_graph_tenant_id: saved.ms_graph_tenant_id || '',
        ms_graph_client_id: saved.ms_graph_client_id || '',
        ms_graph_secret_set: Boolean(saved.ms_graph_secret_set),
        ms_graph_configured: Boolean(saved.ms_graph_configured),
      }));
      setSecret('');
      setMsg(saved.ms_graph_configured
        ? 'Teams calendar sync saved. New activities will sync to Outlook / Teams; cancel will remove or mark them Canceled.'
        : 'Saved, but Graph is still incomplete — need Tenant ID, Client ID, and Client secret.');
      await reload();
    } catch (ex) {
      setErr(ex.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const testConn = async () => {
    setTesting(true);
    setMsg('');
    setErr('');
    try {
      await api.settings.testMsGraph();
      setMsg('Microsoft Graph connection OK — token received. Calendar sync is ready.');
    } catch (ex) {
      setErr(ex.message || 'Microsoft Graph test failed');
    } finally {
      setTesting(false);
    }
  };

  return (
    <form onSubmit={save} style={card}>
      <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Teams / Outlook calendar sync</h2>
      <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
        Prefer the simple path first: <strong>Settings → Email → Microsoft 365 / Outlook</strong> with your work email.
        Use this Graph page only if email cancel still does not update Teams.
        Status:{' '}
        <strong style={{ color: configured ? 'var(--success, #0a7)' : 'var(--danger)' }}>
          {configured ? 'Enabled' : 'Not configured (optional)'}
        </strong>
        {form.ms_graph_secret_set ? ' · secret saved' : ''}
      </p>

      {msg && <p style={{ color: 'var(--success, #0a7)' }}>{msg}</p>}
      {err && <p style={{ color: 'var(--danger)' }}>{err}</p>}

      <div style={{
        background: 'var(--surface-2, #f8fafc)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '0.85rem 1rem',
        marginBottom: '1rem',
        fontSize: '0.9rem',
        lineHeight: 1.55,
      }}
      >
        <strong>One-time Azure setup (Microsoft 365 admin)</strong>
        <ol style={{ margin: '0.5rem 0 0', paddingLeft: '1.2rem' }}>
          <li>
            Open{' '}
            <a href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank" rel="noreferrer">
              Azure Portal → App registrations
            </a>
            {' '}→ <strong>New registration</strong>
          </li>
          <li>Name: <code>PMO-CTSB Calendar</code> · Accounts: <em>This organizational directory only</em> → Register</li>
          <li>Copy <strong>Application (client) ID</strong> and <strong>Directory (tenant) ID</strong> into the fields below</li>
          <li>
            Certificates &amp; secrets → <strong>New client secret</strong> → copy the <em>Value</em> once into Client secret below
          </li>
          <li>
            API permissions → Add → Microsoft Graph → <strong>Application permissions</strong> →
            {' '}<code>Calendars.ReadWrite</code> → Add → <strong>Grant admin consent</strong>
          </li>
          <li>Save here, then click <strong>Test Microsoft Graph</strong></li>
        </ol>
      </div>

      <label style={{ display: 'block', marginBottom: '0.75rem' }}>
        Directory (tenant) ID
        <input
          type="text"
          value={form.ms_graph_tenant_id || ''}
          onChange={(e) => setForm((f) => ({ ...f, ms_graph_tenant_id: e.target.value }))}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          style={{ ...inputStyle, display: 'block', width: '100%', marginTop: '0.35rem' }}
          autoComplete="off"
        />
      </label>

      <label style={{ display: 'block', marginBottom: '0.75rem' }}>
        Application (client) ID
        <input
          type="text"
          value={form.ms_graph_client_id || ''}
          onChange={(e) => setForm((f) => ({ ...f, ms_graph_client_id: e.target.value }))}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          style={{ ...inputStyle, display: 'block', width: '100%', marginTop: '0.35rem' }}
          autoComplete="off"
        />
      </label>

      <label style={{ display: 'block', marginBottom: '0.75rem' }}>
        Client secret
        <input
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder={form.ms_graph_secret_set ? 'Leave blank to keep current secret' : 'Paste secret Value from Azure'}
          style={{ ...inputStyle, display: 'block', width: '100%', marginTop: '0.35rem' }}
          autoComplete="new-password"
        />
        <span style={labelMuted}>
          Assignees must be users in the same Microsoft 365 tenant (work email on their PMO account).
        </span>
      </label>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
        <button type="submit" className="btn btn-primary" style={btnPrimary} disabled={saving}>
          {saving ? 'Saving…' : 'Save Teams calendar settings'}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          style={btnSecondary}
          onClick={testConn}
          disabled={testing || !configured}
        >
          {testing ? 'Testing…' : 'Test Microsoft Graph'}
        </button>
      </div>
    </form>
  );
}
