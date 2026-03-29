import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

export default function Dashboard() {
  const [projects, setProjects] = useState([]);
  const [workload, setWorkload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [projectFilter, setProjectFilter] = useState('active'); // 'active' | 'all'
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    Promise.all([api.projects.list(), api.availability.workload(today, today)])
      .then(([p, w]) => {
        setProjects(p);
        setWorkload(w);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [today]);

  if (loading) {
    return (
      <div className="dashboard">
        <div className="dashboard-loading">Loading dashboard…</div>
      </div>
    );
  }

  const activeCount = projects.filter(p => p.status === 'active').length;
  const overloadedList = workload?.workload?.filter(w => w.isOverloaded) ?? [];
  const availableCount = workload?.workload?.filter(w => w.availability > 20)?.length ?? 0;
  const overloadedCount = overloadedList.length;
  const filteredProjects = projectFilter === 'active'
    ? projects.filter(p => p.status === 'active')
    : projects;

  const quickActions = [
    { to: '/projects', label: 'Projects', desc: 'Create & manage' },
    { to: '/clients', label: 'Clients', desc: 'Client list' },
    { to: '/team', label: 'Team & Workload', desc: 'Capacity & assignments' },
    { to: '/calendar', label: 'Calendar', desc: 'Activities & schedule' },
    { to: '/gantt', label: 'Gantt', desc: 'Timeline view' },
  ];

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Dashboard</h1>
          <p className="dashboard-subtitle">
            Overview of projects and team capacity. Use the cards below to jump to each area.
          </p>
        </div>
      </header>

      <section className="dashboard-stats" aria-label="Key metrics">
        <Link to="/projects" className="dashboard-stat-card dashboard-stat-projects">
          <span className="dashboard-stat-label">Active projects</span>
          <span className="dashboard-stat-value">{activeCount}</span>
          <span className="dashboard-stat-hint">View all →</span>
        </Link>
        <Link to="/team" className="dashboard-stat-card dashboard-stat-available">
          <span className="dashboard-stat-label">Team with capacity</span>
          <span className="dashboard-stat-value">{availableCount}</span>
          <span className="dashboard-stat-hint">Check workload →</span>
        </Link>
        <Link to="/team" className={`dashboard-stat-card dashboard-stat-overloaded ${overloadedCount > 0 ? 'has-issue' : ''}`}>
          <span className="dashboard-stat-label">Overloaded</span>
          <span className="dashboard-stat-value">{overloadedCount}</span>
          <span className="dashboard-stat-hint">{overloadedCount ? 'Review →' : 'None'}</span>
        </Link>
      </section>

      <div className="dashboard-grid">
        <section className="dashboard-section dashboard-projects">
          <div className="dashboard-section-header">
            <h2 className="dashboard-section-title">Projects</h2>
            <div className="dashboard-tabs">
              <button
                type="button"
                className={projectFilter === 'active' ? 'active' : ''}
                onClick={() => setProjectFilter('active')}
              >
                Active
              </button>
              <button
                type="button"
                className={projectFilter === 'all' ? 'active' : ''}
                onClick={() => setProjectFilter('all')}
              >
                All
              </button>
            </div>
          </div>
          <div className="dashboard-section-body">
            {filteredProjects.length === 0 ? (
              <p className="dashboard-empty">No {projectFilter === 'active' ? 'active ' : ''}projects. <Link to="/projects">Create one</Link>.</p>
            ) : (
              <ul className="dashboard-project-list">
                {filteredProjects.map(p => (
                  <li key={p.id}>
                    <Link to={`/projects/${p.id}`} className="dashboard-project-item">
                      <span className="dashboard-project-name">{p.name}</span>
                      <span className="dashboard-project-meta">
                        <span className={`dashboard-badge dashboard-badge-${p.status}`}>{p.status}</span>
                        {p.member_count} members
                        {p.client_name && <span> · {p.client_name}</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <aside className="dashboard-sidebar">
          {overloadedCount > 0 && (
            <section className="dashboard-section dashboard-alert">
              <h2 className="dashboard-section-title">Needs attention</h2>
              <div className="dashboard-section-body">
                <p className="dashboard-alert-text">{overloadedCount} team member{overloadedCount !== 1 ? 's' : ''} over 100% allocation.</p>
                <ul className="dashboard-overloaded-list">
                  {overloadedList.slice(0, 5).map(w => (
                    <li key={w.id}>
                      <Link to={`/team?check=${w.id}`} className="dashboard-overloaded-link">{w.name}</Link>
                      <span className="dashboard-overloaded-pct">{w.totalAllocation}%</span>
                    </li>
                  ))}
                </ul>
                <Link to="/team" className="dashboard-alert-cta">Review in Team & Workload →</Link>
              </div>
            </section>
          )}

          <section className="dashboard-section dashboard-actions">
            <h2 className="dashboard-section-title">Quick actions</h2>
            <div className="dashboard-section-body">
              <div className="dashboard-action-grid">
                {quickActions.map(({ to, label, desc }) => (
                  <Link key={to} to={to} className="dashboard-action-card">
                    <span className="dashboard-action-label">{label}</span>
                    <span className="dashboard-action-desc">{desc}</span>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
