import { useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { useTheme } from './ThemeContext';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import Clients from './pages/Clients';
import Team from './pages/Team';
import Calendar from './pages/Calendar';
import Gantt from './pages/Gantt';

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

  return (
    <div className="app-layout">
      <header className="app-header">
        <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>PMO CTSB</span>
        <div className="app-header-actions">
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
          <ThemeToggle />
        </div>
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
        <NavLink to="/calendar" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={() => setNavOpen(false)}>
          Calendar & Activities
        </NavLink>
        <NavLink to="/gantt" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={() => setNavOpen(false)}>
          Gantt
        </NavLink>
      </nav>
      <main className="app-main">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/team" element={<Team />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/gantt" element={<Gantt />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
