import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { api } from '../../api';
import { mapApiToForm } from './settingsStyles';
import PageHeader from '../../components/PageHeader';
import { useLocale } from '../../context/LocaleContext';

const SETTINGS_TABS = [
  { to: '/settings/branding', key: 'nav.branding' },
  { to: '/settings/locations', key: 'nav.locations' },
  { to: '/settings/modules', key: 'nav.modules' },
  { to: '/settings/email', key: 'nav.email' },
  { to: '/settings/microsoft', key: 'nav.microsoft' },
];

export default function SettingsLayout() {
  const { t } = useLocale();
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
          title={t('settings.title')}
        />
        <div className="settings-loading ui-card">{t('settings.loading')}</div>
      </div>
    );
  }

  if (err && !form) {
    return (
      <div className="page-module settings-page">
        <PageHeader
          title={t('settings.title')}
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
            {t('action.retry')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-module settings-page">
      <PageHeader
        title={t('settings.title')}
      />

      <nav className="settings-subnav module-tabs" aria-label={t('settings.sections')}>
        {SETTINGS_TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) => `module-tab ${isActive ? 'active' : ''}`}
          >
            {t(tab.key)}
          </NavLink>
        ))}
      </nav>

      <div className="settings-main">
        <Outlet context={{ form, setForm, reload }} />
      </div>
    </div>
  );
}
