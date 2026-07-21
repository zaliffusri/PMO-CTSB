import { useState, useEffect, useMemo } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import NotificationBell from '../components/NotificationBell';
import NavIcon from '../components/NavIcon';
import UserAvatar from '../components/UserAvatar';
import ThemeToggle from '../components/ThemeToggle';
import { useBranding } from '../context/BrandingContext';
import { canViewFinance, isHrCalendarOnly } from '../../lib/permissions.js';
import { ROLE_LABELS } from '../constants/roles.js';
import { pageTitle } from '../navigation/pageTitles.js';

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

export default function AppShell({ children }) {
  const [navOpen, setNavOpen] = useState(false);
  const [sidebarMode, setSidebarMode] = useState(readSidebarMode);
  const [settingsSidebarPeek, setSettingsSidebarPeek] = useState(false);
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';
  const hrOnly = isHrCalendarOnly(user);
  const showFinance = canViewFinance(user);
  const isSettingsSidebar = isAdmin && (pathname.startsWith('/settings') || settingsSidebarPeek);
  const title = useMemo(() => pageTitle(pathname), [pathname]);
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
          {hrOnly ? (
            <>
              <div className="nav-section-label">Schedule</div>
              <NavItem to="/calendar" icon="calendar" label="Calendar" onNavigate={closeNav} compact={sidebarCompact} />
            </>
          ) : isSettingsSidebar ? (
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
              <NavItem to="/" end icon="dashboard" label="Dashboard" onNavigate={closeNav} compact={sidebarCompact} />
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
            {!hrOnly && <NotificationBell />}
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
