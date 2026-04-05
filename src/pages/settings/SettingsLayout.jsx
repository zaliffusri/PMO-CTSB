import { useCallback, useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { api } from '../../api';
import { mapApiToForm, btnSecondary } from './settingsStyles';

export default function SettingsLayout() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [form, setForm] = useState(null);

  const reload = useCallback(async () => {
    try {
      const s = await api.settings.get();
      setForm(mapApiToForm(s));
      setErr('');
    } catch (e) {
      setErr(e.message || 'Failed to load settings');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await reload();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  if (loading) {
    return <div style={{ padding: '2rem' }}>Loading settings…</div>;
  }

  if (err && !form) {
    return (
      <div style={{ padding: '2rem' }}>
        <p style={{ color: 'var(--danger)' }}>{err}</p>
        <button
          type="button"
          style={btnSecondary}
          onClick={async () => {
            setLoading(true);
            await reload();
            setLoading(false);
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <div className="page-header">
        <div>
          <h1>System settings</h1>
          <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0' }}>
            Configure the application. Use the sections below to add more options over time.
          </p>
        </div>
      </div>

      <div className="settings-main">
        <Outlet context={{ form, setForm, reload }} />
      </div>
    </div>
  );
}
