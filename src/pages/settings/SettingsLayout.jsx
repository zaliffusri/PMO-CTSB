import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { api } from '../../api';
import { mapApiToForm } from './settingsStyles';
import PageHeader from '../../components/PageHeader';

const SETTINGS_TABS = [
  { to: '/settings/branding', label: 'Branding' },
  { to: '/settings/appearance', label: 'Appearance' },
  { to: '/settings/locations', label: 'Locations' },
  { to: '/settings/email', label: 'Email' },
];

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
    return (
      <div className="page-module settings-page">
        <PageHeader
          title="System settings"
          subtitle="Configure branding, appearance, locations, and workspace preferences."
        />
        <div className="settings-loading ui-card">Loading settings…</div>
      </div>
    );
  }

  if (err && !form) {
    return (
      <div className="page-module settings-page">
        <PageHeader
          title="System settings"
          subtitle="Configure branding, appearance, locations, and workspace preferences."
        />
        <div className="settings-error ui-card">
          <p>{err}</p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={async () => {
              setLoading(true);
              await reload();
              setLoading(false);
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-module settings-page">
      <PageHeader
        title="System settings"
        subtitle="Configure branding, appearance, locations, and workspace preferences."
      />

      <nav className="settings-subnav module-tabs" aria-label="Settings sections">
        {SETTINGS_TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) => `module-tab ${isActive ? 'active' : ''}`}
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <div className="settings-main">
        <Outlet context={{ form, setForm, reload }} />
      </div>
    </div>
  );
}
