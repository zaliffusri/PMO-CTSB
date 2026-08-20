export default function HelpdeskKpis({ stats }) {
  return (
    <section className="dashboard-stats kpi-strip helpdesk-kpis" aria-label="Helpdesk summary">
      <div className="dashboard-stat-card">
        <span className="dashboard-stat-label">Open</span>
        <span className="dashboard-stat-value">{stats.open}</span>
        <span className="dashboard-stat-hint">Needs action</span>
      </div>
      <div className={`dashboard-stat-card ${stats.critical ? 'has-issue' : ''}`}>
        <span className="dashboard-stat-label">Critical</span>
        <span className="dashboard-stat-value pmo-stat-danger">{stats.critical}</span>
        <span className="dashboard-stat-hint">Highest priority</span>
      </div>
      <div className="dashboard-stat-card">
        <span className="dashboard-stat-label">1st level</span>
        <span className="dashboard-stat-value">{stats.l1}</span>
        <span className="dashboard-stat-hint">Frontline</span>
      </div>
      <div className="dashboard-stat-card">
        <span className="dashboard-stat-label">2nd level</span>
        <span className="dashboard-stat-value">{stats.l2}</span>
        <span className="dashboard-stat-hint">Escalated support</span>
      </div>
      <div className="dashboard-stat-card">
        <span className="dashboard-stat-label">Backlog</span>
        <span className="dashboard-stat-value pmo-stat-warning">{stats.backlog}</span>
        <span className="dashboard-stat-hint">Dev / data</span>
      </div>
    </section>
  );
}
