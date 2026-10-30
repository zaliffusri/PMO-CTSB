import { useEffect, useState } from 'react';
import { useAuth } from '../AuthContext';
import { api } from '../api';
import { useBranding } from '../context/BrandingContext';
import { useSubmitLock } from '../hooks/useSubmitLock';
import PartnerLogos from '../components/PartnerLogos';
import SystemLogo from '../components/SystemLogo';
import { useLocale } from '../context/LocaleContext';

const DEMO_HINT = import.meta.env.DEV;
const DEMO_EMAIL = 'admin@pmo.local';
const DEMO_PASSWORD = 'admin123';
const DEFAULT_AUTH_HERO = '/brand/auth-hero-pm.jpg';

export default function AuthScreen() {
  const { login } = useAuth();
  const { branding } = useBranding();
  const { t } = useLocale();
  const [form, setForm] = useState({
    email: DEMO_HINT ? DEMO_EMAIL : '',
    password: DEMO_HINT ? DEMO_PASSWORD : '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const { pending: busy, run } = useSubmitLock();
  const [error, setError] = useState('');
  const [ssoReady, setSsoReady] = useState(false);
  const heroImage = branding.org_banner_url || DEFAULT_AUTH_HERO;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('sso_error');
    if (fromUrl) {
      sessionStorage.setItem('pmo-sso-error', fromUrl);
      params.delete('sso_error');
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`;
      window.history.replaceState({}, '', next);
    }
    const ssoError = fromUrl || sessionStorage.getItem('pmo-sso-error');
    if (!ssoError) return;
    const key = `auth.sso.${ssoError}`;
    const mapped = t(key);
    setError(mapped === key ? t('auth.sso.failed') : mapped);
  }, [t]);

  useEffect(() => {
    api.auth.microsoftStatus()
      .then((s) => setSsoReady(Boolean(s?.configured)))
      .catch(() => setSsoReady(false));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    sessionStorage.removeItem('pmo-sso-error');
    await run(async () => {
      try {
        await login(form.email, form.password);
      } catch (err) {
        setError(err.message || t('auth.failed'));
      }
    });
  };

  return (
    <div className="auth-page">
      <div className="auth-page__grid">
        <aside className="auth-hero auth-hero--photo" aria-hidden="true">
          <img
            src={heroImage}
            alt=""
            className="auth-hero-photo"
            draggable={false}
          />
          <div className="auth-hero-overlay" />
          <div className="auth-hero-brand-mark">
            <span className="auth-hero-ring auth-hero-ring--outer" />
            <span className="auth-hero-ring auth-hero-ring--inner" />
            <span className="auth-hero-glow-pulse" />
            <SystemLogo size="hero" className="auth-hero-logo" />
          </div>
        </aside>

        <form onSubmit={submit} className="auth-card">
          <div className="auth-card-brand">
            <SystemLogo size="card" className="auth-card-logo" />
            <div>
              <h1>{t('auth.signIn')}</h1>
              <p>{branding.org_tagline}</p>
            </div>
          </div>

          {error && <div className="auth-error" role="alert">{error}</div>}

          <div className="auth-fields">
            <label>
              {t('common.email')}
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                required
                className="auth-input"
                placeholder="you@company.com"
                autoComplete="email"
              />
            </label>
            <label>
              {t('common.password')}
              <div className="auth-password-wrap">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  required
                  className="auth-input auth-input-password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? t('common.hidePassword') : t('common.showPassword')}
                  className="auth-eye-btn"
                >
                  {showPassword ? (
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </label>
          </div>

          <button type="submit" className="auth-submit-btn" disabled={busy}>
            {busy ? t('action.signingIn') : t('action.signIn')}
          </button>

          <div className="auth-sso">
            <span className="auth-sso__or">{t('action.or')}</span>
            <button
              type="button"
              className="auth-sso-btn"
              disabled={!ssoReady}
              title={ssoReady ? t('action.microsoft') : t('auth.sso.not_configured')}
              onClick={() => {
                if (!ssoReady) return;
                window.location.assign('/api/auth/microsoft');
              }}
            >
              {t('action.microsoft')}
            </button>
          </div>

          <div className="auth-partners">
            <p className="auth-partners__label">{t('common.operatedBy')}</p>
            <PartnerLogos variant="auth" />
          </div>
        </form>
      </div>
    </div>
  );
}
