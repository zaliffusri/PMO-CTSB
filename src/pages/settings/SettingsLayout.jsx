import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { api } from '../../api';
import { mapApiToForm, btnSecondary } from './settingsStyles';
import PageHeader from '../../components/PageHeader';

export default function SettingsLayout() {
  const { pathname } = useLocation();
  const wideSettings = pathname === '/settings/locations';
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
    <div className={`page-module settings-page${wideSettings ? ' settings-page--wide' : ''}`}>
      <PageHeader
        title="System settings"
        subtitle="Configure branding, locations, and workspace preferences."
      />

      <nav className="settings-subnav module-tabs" aria-label="Settings sections">
        <NavLink to="/settings/branding" className={({ isActive }) => `module-tab ${isActive ? 'active' : ''}`}>
          Branding
        </NavLink>
        <NavLink to="/settings/locations" className={({ isActive }) => `module-tab ${isActive ? 'active' : ''}`}>
          Locations
        </NavLink>
      </nav>

      <div className={`settings-main${wideSettings ? ' settings-main--wide' : ''}`}>
        <Outlet context={{ form, setForm, reload }} />
      </div>
    </div>
  );
}
