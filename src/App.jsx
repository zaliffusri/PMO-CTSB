import { useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from './ThemeContext';
import { useAuth } from './AuthContext';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import Clients from './pages/Clients';
import Team from './pages/Team';
import Calendar from './pages/Calendar';
import Gantt from './pages/Gantt';
import Users from './pages/Users';
import Account from './pages/Account';
import History from './pages/History';
import SettingsLayout from './pages/settings/SettingsLayout';
import SettingsGeneral from './pages/settings/SettingsGeneral';
import SettingsLocations from './pages/settings/SettingsLocations';

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const nextIsLight = theme === 'dark';
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={nextIsLight ? 'Switch to light mode' : 'Switch to dark mode'}
      title={nextIsLight ? 'Light mode' : 'Dark mode'}
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}

function Layout({ children }) {
  const [navOpen, setNavOpen] = useState(false);
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';
  const isSettingsSidebar = isAdmin && pathname.startsWith('/settings');

  return (
    <div className="app-layout">
      <header className="app-header">
        <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>PMO CTSB</span>
        <div className="app-header-actions">
          {user && (
            <button type="button" className="logout-btn" onClick={logout} title="Logout">
              Logout
            </button>
          )}
          <ThemeToggle />
          <button
            type="button"
            className="app-nav-toggle"
            onClick={() => setNavOpen(!navOpen)}
            aria-label="Toggle menu"
          >
            {navOpen ? '✕' : '☰'}
          </button>
        </div>
      </header>
      <nav className={`app-nav ${navOpen ? '' : 'closed'}`}>
        <div className="nav-brand-row">
          <div className="nav-brand">PMO CTSB</div>
          {user && (
            <button type="button" className="logout-btn" onClick={logout} title="Logout">
              Logout
            </button>
          )}
          <ThemeToggle />
        </div>
        {user && (
          <div style={{ padding: '0.5rem 0.75rem 0.8rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            Signed in as {user.name || user.email}
          </div>
        )}
        {isSettingsSidebar ? (
          <>
            <button
              type="button"
              className="nav-link nav-back-link"
              onClick={() => {
                navigate('/');
                setNavOpen(false);
              }}
            >
              ← Main menu
            </button>
            <div className="nav-sublayer-title">Settings</div>
            <NavLink
              to="/settings/locations"
              className={({ isActive }) => `nav-link nav-sublink ${isActive ? 'active' : ''}`}
              onClick={() => setNavOpen(false)}
            >
              Locations
            </NavLink>
          </>
        ) : (
          <>
            <NavLink to="/" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} end onClick={() => setNavOpen(false)}>
              Dashboard
            </NavLink>
            <NavLink to="/projects" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={() => setNavOpen(false)}>
              Projects
            </NavLink>
            <NavLink to="/clients" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={() => setNavOpen(false)}>
              Clients
            </NavLink>
            <NavLink to="/team" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={() => setNavOpen(false)}>
              Team
            </NavLink>
            {isAdmin && (
              <NavLink to="/users" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={() => setNavOpen(false)}>
                Users
              </NavLink>
            )}
            {isAdmin && (
              <NavLink
                to="/history"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={() => setNavOpen(false)}
              >
                History
              </NavLink>
            )}
            {isAdmin && (
              <NavLink
                to="/settings"
                className={() => `nav-link ${pathname.startsWith('/settings') ? 'active' : ''}`}
                onClick={() => setNavOpen(false)}
              >
                Settings
              </NavLink>
            )}
            <NavLink to="/calendar" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={() => setNavOpen(false)}>
              Calendar & Activities
            </NavLink>
            <NavLink to="/gantt" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={() => setNavOpen(false)}>
              Gantt
            </NavLink>
            <NavLink to="/account" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={() => setNavOpen(false)}>
              My Account
            </NavLink>
          </>
        )}
      </nav>
      <main className="app-main">{children}</main>
    </div>
  );
}

function AuthScreen() {
  const { login } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(form.email, form.password);
    } catch (err) {
      setError(err.message || 'Authentication failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-hero" aria-hidden="true">
        <div className="auth-hero-badge">Technology-Driven PMO</div>
        <h2>Manage Projects with Smart Insights</h2>
        <p>Track workload, plan resources, and coordinate teams from one secure platform.</p>
      </div>
      <form onSubmit={submit} className="auth-card">
        <h1>PMO CTSB</h1>
        {error && (
          <div className="auth-error">{error}</div>
        )}
        <div className="auth-fields">
          <label>
            Email
            <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required className="auth-input" />
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
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}
                className="auth-eye-btn"
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </label>
        </div>
        <button type="submit" className="auth-submit-btn" disabled={busy}>
          {busy ? 'Please wait...' : 'Login'}
        </button>
      </form>
    </div>
  );
}

export default function App() {
  const { isAuthenticated, checking, user } = useAuth();
  if (checking) return null;
  if (!isAuthenticated) return <AuthScreen />;

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/team" element={<Team />} />
          <Route path="/users" element={user?.role === 'admin' ? <Users /> : <Dashboard />} />
          <Route path="/history" element={user?.role === 'admin' ? <History /> : <Dashboard />} />
          <Route
            path="/settings"
            element={user?.role === 'admin' ? <SettingsLayout /> : <Dashboard />}
          >
            <Route index element={<SettingsGeneral />} />
            <Route path="general" element={<Navigate to="/settings" replace />} />
            <Route path="locations" element={<SettingsLocations />} />
          </Route>
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/gantt" element={<Gantt />} />
          <Route path="/account" element={<Account />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
