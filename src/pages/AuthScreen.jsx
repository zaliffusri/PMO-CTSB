import { useState } from 'react';
import { useAuth } from '../AuthContext';
import { useBranding } from '../context/BrandingContext';
import { useSubmitLock } from '../hooks/useSubmitLock';

const DEMO_HINT = import.meta.env.DEV;

export default function AuthScreen() {
  const { login } = useAuth();
  const { branding } = useBranding();
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const { pending: busy, run } = useSubmitLock();
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    await run(async () => {
      try {
        await login(form.email, form.password);
      } catch (err) {
        setError(err.message || 'Authentication failed');
      }
    });
  };

  return (
    <div className="auth-page">
      <header className="auth-topbar">
        <div className="auth-topbar__brand">
          {branding.org_logo_url ? (
            <img src={branding.org_logo_url} alt="" className="auth-topbar__logo" />
          ) : (
            <span className="app-logo-mark">P</span>
          )}
          <span>{branding.org_display_name}</span>
        </div>
      </header>

      <div className="auth-page__grid">
        <aside
          className={`auth-hero ${branding.org_banner_url ? 'auth-hero--photo' : ''}`}
          style={branding.org_banner_url ? { backgroundImage: `url(${branding.org_banner_url})` } : undefined}
          aria-hidden="true"
        >
          <div className="auth-hero-overlay" />
          <div className="auth-hero-content">
            {branding.org_logo_url && (
              <img src={branding.org_logo_url} alt="" className="auth-hero-logo" />
            )}
            <div className="auth-hero-badge">Technology-driven PMO</div>
            <h2>{branding.org_display_name}</h2>
            <p>{branding.org_tagline || 'Plan, deliver, and report with confidence'}</p>
            <ul className="auth-hero-list">
              <li>Command center with health KPIs</li>
              <li>Team allocation &amp; availability</li>
              <li>Client, project &amp; activity tracking</li>
            </ul>
          </div>
        </aside>

        <form onSubmit={submit} className="auth-card">
          <div className="auth-card-brand">
            {branding.org_logo_url ? (
              <img src={branding.org_logo_url} alt="" className="auth-card-logo" />
            ) : (
              <span className="app-logo-mark app-logo-mark--lg">P</span>
            )}
            <div>
              <h1>Sign in</h1>
              <p>{branding.org_display_name} workspace</p>
            </div>
          </div>

          {error && <div className="auth-error" role="alert">{error}</div>}

          <div className="auth-fields">
            <label>
              Email
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
              Password
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
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
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
            {busy ? 'Signing in…' : 'Sign in'}
          </button>

          {DEMO_HINT && (
            <div className="auth-demo-hint">
              <strong>Demo:</strong> admin@pmo.local / admin123
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
