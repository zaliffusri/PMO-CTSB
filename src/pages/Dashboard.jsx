import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import {
  enrichProjectsWithHealth,
  portfolioSummary,
  needsAttentionItems,
  healthLabel,
  chartHealthData,
  chartStatusData,
  chartProgressData,
  chartCapacityData,
  chartCapacityBands,
} from '../../lib/pmoMetrics.js';
import PageHeader from '../components/PageHeader';
import WorkspaceBanner from '../components/WorkspaceBanner';
import PageLoadingState from '../components/PageLoadingState';
import ChartCard from '../components/charts/ChartCard';
import DonutChart from '../components/charts/DonutChart';
import HBarChart from '../components/charts/HBarChart';
import GaugeChart from '../components/charts/GaugeChart';
import { OPEN_BACKLOG_STATUSES } from '../../lib/backlogConstants.js';

const OPEN_ISSUE_STATUSES = new Set(['open', 'in_progress', 'waiting_agency']);

const PORTFOLIO_PREVIEW = 8;

export default function Dashboard() {
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [workload, setWorkload] = useState([]);
  const [issues, setIssues] = useState([]);
  const [backlogs, setBacklogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [projectFilter, setProjectFilter] = useState('active');
  const [healthFilter, setHealthFilter] = useState('all');
  const [showAllProjects, setShowAllProjects] = useState(false);

  useEffect(() => {
    const from = new Date();
    from.setDate(from.getDate() - 7);
    const to = new Date();
    to.setDate(to.getDate() + 21);
    const fromStr = from.toISOString().slice(0, 10);
    const toStr = to.toISOString().slice(0, 10);

    Promise.all([
      api.projects.list(),
      api.projectTasks.list(),
      api.availability.workload(fromStr, toStr),
      api.issues.list(),
      api.backlogs.list(),
    ])
      .then(([pr, tk, wl, iss, bl]) => {
        setProjects(pr);
        setTasks(tk);
        setWorkload(wl?.workload || []);
        setIssues(iss);
        setBacklogs(bl);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const enriched = useMemo(() => enrichProjectsWithHealth(projects, tasks), [projects, tasks]);
  const summary = useMemo(() => portfolioSummary(enriched, workload), [enriched, workload]);
  const attention = useMemo(() => needsAttentionItems(enriched, workload), [enriched, workload]);

  const filteredProjects = useMemo(() => {
    let list = enriched;
    if (projectFilter === 'active') list = list.filter((p) => p.status === 'active');
    if (healthFilter !== 'all') list = list.filter((p) => p.health === healthFilter);
    return list;
  }, [enriched, projectFilter, healthFilter]);

  const visibleProjects = showAllProjects
    ? filteredProjects
    : filteredProjects.slice(0, PORTFOLIO_PREVIEW);

  const healthChart = useMemo(() => chartHealthData(enriched), [enriched]);
  const statusChart = useMemo(() => chartStatusData(projects), [projects]);
  const progressChart = useMemo(() => chartProgressData(enriched, 6), [enriched]);
  const capacityChart = useMemo(() => chartCapacityData(workload, 6), [workload]);
  const healthTotal = healthChart.reduce((s, d) => s + d.value, 0);

  const helpdeskStats = useMemo(() => ({
    open: issues.filter((i) => OPEN_ISSUE_STATUSES.has(i.status)).length,
    openCr: backlogs.filter((b) => b.item_type === 'cr' && OPEN_BACKLOG_STATUSES.has(b.status)).length,
    openBugs: backlogs.filter((b) => ['bug', 'defect'].includes(b.item_type) && OPEN_BACKLOG_STATUSES.has(b.status)).length,
    recurring: backlogs.filter((b) => b.item_type === 'recurring' || b.source === 'recurring').length,
  }), [issues, backlogs]);

  if (loading) {
    return <PageLoadingState message="Loading dashboard…" />;
  }

  return (
    <div className="page-module dashboard">
      <PageHeader
        eyebrow="Portfolio"
        title="Dashboard"
        subtitle="Portfolio health, project status, and resource alerts at a glance."
      />

      <WorkspaceBanner />

      <section className="dashboard-stats kpi-strip" aria-label="Portfolio KPIs">
        <Link to="/projects" className="dashboard-stat-card dashboard-stat-projects">
          <span className="dashboard-stat-label">Active projects</span>
          <span className="dashboard-stat-value">{summary.activeProjects}</span>
          <span className="dashboard-stat-hint">{summary.totalProjects} total →</span>
        </Link>
        <div className="dashboard-stat-card">
          <span className="dashboard-stat-label">On track</span>
          <span className="dashboard-stat-value pmo-stat-success">{summary.onTrack}</span>
          <span className="dashboard-stat-hint">Healthy delivery</span>
        </div>
        <div className="dashboard-stat-card">
          <span className="dashboard-stat-label">At risk</span>
          <span className={`dashboard-stat-value ${summary.atRisk ? 'pmo-stat-warning' : ''}`}>{summary.atRisk}</span>
          <span className="dashboard-stat-hint">Needs review</span>
        </div>
        <div className="dashboard-stat-card">
          <span className="dashboard-stat-label">Blocked</span>
          <span className={`dashboard-stat-value ${summary.blocked ? 'pmo-stat-danger' : ''}`}>{summary.blocked}</span>
          <span className="dashboard-stat-hint">Stalled work</span>
        </div>
        <div className="dashboard-stat-card dashboard-stat-card--hide-sm">
          <span className="dashboard-stat-label">Avg completion</span>
          <span className="dashboard-stat-value">{summary.avgCompletion}%</span>
          <span className="dashboard-stat-hint">Active projects</span>
        </div>
        <Link
          to="/team"
          className={`dashboard-stat-card dashboard-stat-overloaded ${summary.overloadedPeople ? 'has-issue' : ''}`}
        >
          <span className="dashboard-stat-label">Overloaded</span>
          <span className="dashboard-stat-value">{summary.overloadedPeople}</span>
          <span className="dashboard-stat-hint">Team capacity →</span>
        </Link>
      </section>

      <section className="dashboard-stats dashboard-stats--secondary" aria-label="Helpdesk & backlog">
        <Link to="/helpdesk" className={`dashboard-stat-card ${helpdeskStats.open ? 'has-issue' : ''}`}>
          <span className="dashboard-stat-label">Helpdesk open</span>
          <span className="dashboard-stat-value">{helpdeskStats.open}</span>
          <span className="dashboard-stat-hint">Active issues →</span>
        </Link>
        <Link to="/projects" className="dashboard-stat-card">
          <span className="dashboard-stat-label">Open CR</span>
          <span className="dashboard-stat-value pmo-stat-warning">{helpdeskStats.openCr}</span>
          <span className="dashboard-stat-hint">In backlog</span>
        </Link>
        <Link to="/projects" className="dashboard-stat-card">
          <span className="dashboard-stat-label">Open bugs</span>
          <span className="dashboard-stat-value pmo-stat-danger">{helpdeskStats.openBugs}</span>
          <span className="dashboard-stat-hint">Bug / defect</span>
        </Link>
        <Link to="/helpdesk" className="dashboard-stat-card">
          <span className="dashboard-stat-label">Recurring</span>
          <span className="dashboard-stat-value">{helpdeskStats.recurring}</span>
          <span className="dashboard-stat-hint">Recurring issues</span>
        </Link>
      </section>

      <section className="dashboard-charts" aria-label="Portfolio charts">
        <ChartCard title="Portfolio health" subtitle="Active project delivery">
          <DonutChart
            data={healthChart.length ? healthChart : [{ key: 'empty', label: 'No active', value: 1, color: 'var(--border)' }]}
            centerValue={healthTotal || summary.activeProjects}
            centerLabel="active"
          />
        </ChartCard>
        <ChartCard title="Project status" subtitle="Entire portfolio mix">
          <DonutChart
            data={statusChart.length ? statusChart : [{ key: 'empty', label: 'None', value: 1, color: 'var(--border)' }]}
            centerValue={projects.length}
            centerLabel="projects"
          />
        </ChartCard>
        <ChartCard title="Avg completion" subtitle="Across active projects">
          <div className="chart-gauge-wrap">
            <GaugeChart value={summary.avgCompletion} label="Portfolio avg" />
          </div>
        </ChartCard>
        <ChartCard title="Top progress" subtitle="Leading active projects">
          <HBarChart data={progressChart} max={100} />
        </ChartCard>
        <ChartCard title="Team allocation" subtitle="Highest utilization" className="dashboard-charts__wide">
          <HBarChart data={capacityChart} max={100} />
        </ChartCard>
      </section>

      {attention.length > 0 && (
        <section className="dashboard-section dashboard-alert">
          <div className="dashboard-section-header">
            <h2 className="dashboard-section-title">Needs attention</h2>
            <span className="dashboard-section-count">{attention.length}</span>
          </div>
          <div className="dashboard-section-body">
            <ul className="dashboard-overloaded-list">
              {attention.slice(0, 5).map((item) => (
                <li key={item.id}>
                  <Link to={item.link} className="dashboard-overloaded-link">
                    <span className={`pmo-health-badge pmo-health-${item.severity === 'high' ? 'blocked' : 'at_risk'}`}>
                      {item.type}
                    </span>
                    <strong>{item.title}</strong>
                    <span className="dashboard-overloaded-pct"> — {item.detail}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {attention.length > 5 && (
              <p className="dashboard-section-footer">
                <Link to="/projects">View all flagged items in Projects →</Link>
              </p>
            )}
          </div>
        </section>
      )}

      <section className="dashboard-section dashboard-projects">
        <div className="dashboard-section-header">
          <h2 className="dashboard-section-title">Project portfolio</h2>
          <div className="dashboard-tabs">
            <button
              type="button"
              className={projectFilter === 'active' ? 'active' : ''}
              onClick={() => { setProjectFilter('active'); setShowAllProjects(false); }}
            >
              Active
            </button>
            <button
              type="button"
              className={projectFilter === 'all' ? 'active' : ''}
              onClick={() => { setProjectFilter('all'); setShowAllProjects(false); }}
            >
              All
            </button>
          </div>
        </div>
        <div className="dashboard-section-toolbar">
          <span className="dashboard-toolbar-label">Health</span>
          <div className="pmo-filter-row">
            {['all', 'on_track', 'at_risk', 'blocked'].map((h) => (
              <button
                key={h}
                type="button"
                className={`pmo-chip-filter ${healthFilter === h ? 'active' : ''}`}
                onClick={() => { setHealthFilter(h); setShowAllProjects(false); }}
              >
                {h === 'all' ? 'All' : healthLabel(h)}
              </button>
            ))}
          </div>
        </div>
        <div className="dashboard-section-body">
          {filteredProjects.length === 0 ? (
            <p className="dashboard-empty">
              No projects match this filter. <Link to="/projects">Create one</Link>.
            </p>
          ) : (
            <>
              <div className="table-wrap pmo-data-list-wrap pmo-data-list-wrap--sticky pmo-data-list-wrap--comfortable">
                <table className="pmo-data-list pmo-portfolio-table">
                  <thead>
                    <tr>
                      <th>Project</th>
                      <th>Health</th>
                      <th>Status</th>
                      <th className="hide-mobile">Client</th>
                      <th>Progress</th>
                      <th className="hide-mobile">Team</th>
                      <th className="hide-mobile">Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleProjects.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <Link to={`/projects/${p.id}`} className="pmo-link-strong">{p.name}</Link>
                          {p.classification && (
                            <div className="pmo-table-muted">{p.classification}</div>
                          )}
                        </td>
                        <td>
                          <span className={`pmo-health-badge pmo-health-${p.health}`}>
                            {healthLabel(p.health)}
                          </span>
                        </td>
                        <td>
                          <span className={`dashboard-badge dashboard-badge-${p.status}`}>{p.status}</span>
                        </td>
                        <td className="hide-mobile">{p.client_name || '—'}</td>
                        <td>
                          <div className="pmo-progress-cell">
                            <div className="pmo-progress-bar" aria-hidden>
                              <div className="pmo-progress-fill" style={{ width: `${p.progress || 0}%` }} />
                            </div>
                            <span>{p.progress || 0}%</span>
                          </div>
                        </td>
                        <td className="hide-mobile">{p.member_count ?? 0}</td>
                        <td className="hide-mobile">{p.end_date || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredProjects.length > PORTFOLIO_PREVIEW && (
                <div className="dashboard-section-footer">
                  {!showAllProjects ? (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowAllProjects(true)}>
                      Show all {filteredProjects.length} projects
                    </button>
                  ) : (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowAllProjects(false)}>
                      Show less
                    </button>
                  )}
                  <Link to="/projects" className="btn btn-ghost btn-sm">Open projects module →</Link>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
