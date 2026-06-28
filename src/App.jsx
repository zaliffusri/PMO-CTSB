import { useState, useEffect, useMemo } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import Clients from './pages/Clients';
import Team from './pages/Team';
import Calendar from './pages/Calendar';
import Gantt from './pages/Gantt';
import Issues from './pages/Issues';
import MyWork from './pages/MyWork';
import Finance from './pages/Finance';
import Reports from './pages/Reports';
import NotificationBell from './components/NotificationBell';
import Users from './pages/Users';
import Account from './pages/Account';
import History from './pages/History';
import SettingsLayout from './pages/settings/SettingsLayout';
import SettingsLocations from './pages/settings/SettingsLocations';
import SettingsBranding from './pages/settings/SettingsBranding';
import NavIcon from './components/NavIcon';
import UserAvatar from './components/UserAvatar';
import ThemeToggle from './components/ThemeToggle';
import AuthScreen from './pages/AuthScreen';
import { useBranding } from './context/BrandingContext';
import { canViewFinance } from '../lib/permissions.js';

const ROLE_LABELS = { admin: 'Administrator', pmo: 'PMO Officer', finance: 'Finance', hr: 'HR', user: 'User' };

function pageTitle(pathname) {
  if (pathname === '/') return 'PMO Command Center';
  if (pathname === '/projects') return 'Projects';
  if (pathname.startsWith('/projects/')) return 'Project workspace';
  if (pathname === '/clients') return 'Clients';
  if (pathname === '/team') return 'Team & capacity';
  if (pathname === '/calendar') return 'Calendar & activities';
  if (pathname === '/reports') return 'Reports';
  if (pathname === '/gantt') return 'Gantt timeline';
  if (pathname === '/helpdesk') return 'Helpdesk';
  if (pathname === '/my-work') return 'My work';
  if (pathname === '/finance') return 'Finance & payment';
  if (pathname === '/users') return 'System users';
  if (pathname === '/history') return 'Audit history';
  if (pathname.startsWith('/settings')) return 'Settings';
  if (pathname === '/account') return 'My account';
  return 'PMO CTSB';
}

const SIDEBAR_STORAGE_KEY = 'pmo-sidebar-mode';
const SIDEBAR_MODES = ['expanded', 'collapsed', 'hidden'];

function readSidebarMode() {
  if (typeof window === 'undefined') return 'expanded';
  const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
  return SIDEBAR_MODES.includes(stored) ? stored : 'expanded';
}

function SidebarIcon({ children }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      {children}
    </svg>
  );
}

function NavItem({ to, end, icon, label, onNavigate, compact }) {
  return (
    <NavLink
      to={to}
      end={end}
      title={compact ? label : undefined}
      className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
      onClick={onNavigate}
    >
      <NavIcon name={icon} />
      <span className="nav-link-label">{label}</span>
    </NavLink>
  );
}

function Layout({ children }) {
  const [navOpen, setNavOpen] = useState(false);
  const [sidebarMode, setSidebarMode] = useState(readSidebarMode);
  const [settingsSidebarPeek, setSettingsSidebarPeek] = useState(false);
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';
  const showFinance = canViewFinance(user);
  const isSettingsSidebar = isAdmin && (pathname.startsWith('/settings') || settingsSidebarPeek);
  const title = useMemo(() => pageTitle(pathname), [pathname]);
  const initials = (user?.name || user?.email || '?').trim().slice(0, 2).toUpperCase();
  const { branding } = useBranding();
  const sidebarCompact = sidebarMode === 'collapsed';
  const sidebarHidden = sidebarMode === 'hidden';
  const closeNav = () => setNavOpen(false);

  useEffect(() => {
    if (pathname.startsWith('/settings')) setSettingsSidebarPeek(false);
  }, [pathname]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarMode);
    document.documentElement.setAttribute('data-sidebar', sidebarMode);
  }, [sidebarMode]);

  const openSidebar = () => {
    setSidebarMode('expanded');
    setNavOpen(true);
  };

  const collapseSidebar = () => {
    setSidebarMode((mode) => (mode === 'collapsed' ? 'expanded' : 'collapsed'));
  };

  const hideSidebar = () => {
    setSidebarMode('hidden');
    setNavOpen(false);
  };

  return (
    <div className={`app-layout sidebar-${sidebarMode}`}>
      <header className="app-header">
        <div className="app-header-brand">
          {branding.org_logo_url ? (
            <img src={branding.org_logo_url} alt="" className="app-brand-logo app-brand-logo--sm" />
          ) : (
            <span className="app-logo-mark">P</span>
          )}
          <span>{branding.org_display_name}</span>
        </div>
        <div className="app-header-actions">
          {user && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={logout}>
              Logout
            </button>
          )}
          <ThemeToggle />
          <button type="button" className="app-nav-toggle" onClick={() => setNavOpen(!navOpen)} aria-label="Toggle menu">
            {navOpen ? '✕' : '☰'}
          </button>
        </div>
      </header>

      {navOpen && (
        <button
          type="button"
          className="nav-mobile-backdrop"
          aria-label="Close menu"
          onClick={closeNav}
        />
      )}

      <aside className={`app-nav ${navOpen ? 'open' : 'closed'} ${sidebarCompact ? 'sidebar-compact' : ''}`}>
        <div className="nav-brand-row">
          <div className="nav-brand">
            {branding.org_logo_url ? (
              <img src={branding.org_logo_url} alt="" className="app-brand-logo" />
            ) : (
              <span className="app-logo-mark">P</span>
            )}
            <div className="nav-brand-text">
              <div className="nav-brand-title">{branding.org_display_name}</div>
              <div className="nav-brand-sub">{branding.org_tagline || 'Project office'}</div>
            </div>
          </div>
          <div className="nav-brand-actions">
            <button
              type="button"
              className="sidebar-ctrl-btn sidebar-ctrl-desktop"
              onClick={collapseSidebar}
              aria-label={sidebarCompact ? 'Expand sidebar' : 'Collapse sidebar'}
              title={sidebarCompact ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <SidebarIcon>
                {sidebarCompact ? (
                  <path d="M9 18l6-6-6-6" />
                ) : (
                  <path d="M15 18l-6-6 6-6" />
                )}
              </SidebarIcon>
            </button>
            <button
              type="button"
              className="sidebar-ctrl-btn sidebar-ctrl-desktop"
              onClick={hideSidebar}
              aria-label="Hide sidebar"
              title="Hide sidebar"
            >
              <SidebarIcon>
                <path d="M18 6L6 18M6 6l12 12" />
              </SidebarIcon>
            </button>
            <ThemeToggle className="nav-theme-desktop" />
            <button
              type="button"
              className="sidebar-ctrl-btn sidebar-ctrl-mobile"
              onClick={closeNav}
              aria-label="Close menu"
            >
              <SidebarIcon>
                <path d="M18 6L6 18M6 6l12 12" />
              </SidebarIcon>
            </button>
          </div>
        </div>

        <div className="nav-scroll">
          {isSettingsSidebar ? (
            <>
              <button
                type="button"
                className="nav-link nav-back-link"
                title={sidebarCompact ? 'Main menu' : undefined}
                onClick={() => {
                  setSettingsSidebarPeek(false);
                  if (pathname.startsWith('/settings')) navigate('/');
                  closeNav();
                }}
              >
                <span className="nav-back-icon" aria-hidden>←</span>
                <span className="nav-link-label">Main menu</span>
              </button>
              <div className="nav-section-label">Settings</div>
              <NavLink
                to="/settings/branding"
                className={({ isActive }) => `nav-link nav-sublink ${isActive ? 'active' : ''}`}
                onClick={closeNav}
              >
                <NavIcon name="settings" />
                <span className="nav-link-label">Branding</span>
              </NavLink>
              <NavLink
                to="/settings/locations"
                title={sidebarCompact ? 'Locations' : undefined}
                className={({ isActive }) => `nav-link nav-sublink ${isActive ? 'active' : ''}`}
                onClick={closeNav}
              >
                <NavIcon name="settings" />
                <span className="nav-link-label">Locations</span>
              </NavLink>
            </>
          ) : (
            <>
              <div className="nav-section-label">Overview</div>
              <NavItem to="/" end icon="dashboard" label="Command Center" onNavigate={closeNav} compact={sidebarCompact} />
              <NavItem to="/reports" icon="reports" label="Reports" onNavigate={closeNav} compact={sidebarCompact} />
              {showFinance && (
                <NavItem to="/finance" icon="finance" label="Finance" onNavigate={closeNav} compact={sidebarCompact} />
              )}

              <div className="nav-section-label">Delivery</div>
              <NavItem to="/projects" icon="projects" label="Projects" onNavigate={closeNav} compact={sidebarCompact} />
              <NavItem to="/helpdesk" icon="helpdesk" label="Helpdesk" onNavigate={closeNav} compact={sidebarCompact} />
              <NavItem to="/my-work" icon="mywork" label="My work" onNavigate={closeNav} compact={sidebarCompact} />
              <NavItem to="/clients" icon="clients" label="Clients" onNavigate={closeNav} compact={sidebarCompact} />
              <NavItem to="/calendar" icon="calendar" label="Calendar" onNavigate={closeNav} compact={sidebarCompact} />
              <NavItem to="/gantt" icon="gantt" label="Gantt" onNavigate={closeNav} compact={sidebarCompact} />

              <div className="nav-section-label">People</div>
              <NavItem to="/team" icon="team" label="Team & capacity" onNavigate={closeNav} compact={sidebarCompact} />

              {isAdmin && (
                <>
                  <div className="nav-section-label">Administration</div>
                  <NavItem to="/users" icon="users" label="Users" onNavigate={closeNav} compact={sidebarCompact} />
                  <NavItem to="/history" icon="history" label="History" onNavigate={closeNav} compact={sidebarCompact} />
                  <button
                    type="button"
                    className={`nav-link${settingsSidebarPeek ? ' active' : ''}`}
                    title={sidebarCompact ? 'Settings' : undefined}
                    onClick={() => {
                      setSettingsSidebarPeek(true);
                      closeNav();
                    }}
                  >
                    <NavIcon name="settings" />
                    <span className="nav-link-label">Settings</span>
                  </button>
                </>
              )}
            </>
          )}
        </div>

        {user && (
          <div className="nav-footer">
            <NavLink to="/account" className="nav-user-card" title={sidebarCompact ? 'My account' : undefined} onClick={closeNav}>
              <UserAvatar name={user.name} email={user.email} src={user.avatar_url} size="md" />
              <div className="nav-user-meta">
                <div className="nav-user-name">{user.name || user.email}</div>
                <div className="nav-user-role">{ROLE_LABELS[user.role] || user.role}</div>
              </div>
            </NavLink>
            <button type="button" className="btn btn-ghost btn-sm nav-logout" onClick={logout}>
              <span className="nav-link-label">Sign out</span>
            </button>
          </div>
        )}
      </aside>

      <div className="app-shell">
        <header className="app-topbar">
          <div className="app-topbar-start">
            {sidebarHidden && (
              <button
                type="button"
                className="sidebar-ctrl-btn sidebar-open-btn"
                onClick={openSidebar}
                aria-label="Show sidebar"
                title="Show sidebar"
              >
                <SidebarIcon>
                  <path d="M3 6h18M3 12h18M3 18h18" />
                </SidebarIcon>
              </button>
            )}
            <div>
              <p className="app-topbar-eyebrow">Workspace</p>
              <h1 className="app-topbar-title">{title}</h1>
            </div>
          </div>
          <div className="app-topbar-actions">
            <NotificationBell />
            <ThemeToggle />
            {user && (
              <NavLink to="/account" className="app-topbar-user">
                <UserAvatar name={user.name} email={user.email} src={user.avatar_url} size="sm" />
                <span className="app-topbar-user-name">{user.name?.split(' ')[0] || 'Account'}</span>
              </NavLink>
            )}
          </div>
        </header>
        <main className="app-main">
          <div className="app-content">{children}</div>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const { isAuthenticated, checking, user } = useAuth();

  useEffect(() => {
    const onAuthScreen = !checking && !isAuthenticated;
    document.documentElement.classList.toggle('auth-route', onAuthScreen);
    document.body.classList.toggle('auth-route', onAuthScreen);
  }, [checking, isAuthenticated]);

  if (checking) {
    return (
      <div className="app-boot">
        <div className="app-boot-card">
          <span className="app-logo-mark app-logo-mark--lg">P</span>
          <p>Loading workspace…</p>
        </div>
      </div>
    );
  }
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
          <Route path="/settings" element={user?.role === 'admin' ? <SettingsLayout /> : <Dashboard />}>
            <Route index element={<Navigate to="/settings/locations" replace />} />
            <Route path="general" element={<Navigate to="/settings/locations" replace />} />
            <Route path="locations" element={<SettingsLocations />} />
            <Route path="branding" element={<SettingsBranding />} />
          </Route>
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/gantt" element={<Gantt />} />
          <Route path="/helpdesk" element={<Issues />} />
          <Route path="/my-work" element={<MyWork />} />
          <Route path="/finance" element={canViewFinance(user) ? <Finance /> : <Dashboard />} />
          <Route path="/account" element={<Account />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
