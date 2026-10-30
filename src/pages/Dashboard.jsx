import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import {
  enrichProjectsWithHealth,
  portfolioSummary,
  needsAttentionItems,
  healthLabel,
} from '../../lib/pmoMetrics.js';
import PageHeader from '../components/PageHeader';
import WorkspaceBanner from '../components/WorkspaceBanner';
import PageLoadingState from '../components/PageLoadingState';
import { OPEN_BACKLOG_STATUSES } from '../../lib/backlogConstants.js';
import { useLocale } from '../context/LocaleContext';
import DashboardWeekFeed from '../components/DashboardWeekFeed';

const OPEN_ISSUE_STATUSES = new Set(['open', 'in_progress', 'waiting_agency']);

const PORTFOLIO_PREVIEW = 8;

export default function Dashboard() {
  const { t } = useLocale();
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

  const helpdeskStats = useMemo(() => ({
    open: issues.filter((i) => OPEN_ISSUE_STATUSES.has(i.status)).length,
    openCr: backlogs.filter((b) => b.item_type === 'cr' && OPEN_BACKLOG_STATUSES.has(b.status)).length,
    openBugs: backlogs.filter((b) => ['bug', 'defect'].includes(b.item_type) && OPEN_BACKLOG_STATUSES.has(b.status)).length,
    recurring: backlogs.filter((b) => b.item_type === 'recurring' || b.source === 'recurring').length,
  }), [issues, backlogs]);

  if (loading) {
    return <PageLoadingState message={t('chrome.loading')} />;
  }

  return (
    <div className="page-module dashboard">
      <PageHeader
        eyebrow={t('eyebrow.portfolio')}
        title={t('page.dashboard')}
      />

      <WorkspaceBanner />

      <section className="dashboard-stats kpi-strip" aria-label={t('dash.kpis')}>
        <Link to="/projects" className="dashboard-stat-card dashboard-stat-projects">
          <span className="dashboard-stat-label">{t('dash.activeProjects')}</span>
          <span className="dashboard-stat-value">{summary.activeProjects}</span>
          <span className="dashboard-stat-hint">{t('common.total', { n: summary.totalProjects })}</span>
        </Link>
        <div className="dashboard-stat-card">
          <span className="dashboard-stat-label">{t('dash.onTrack')}</span>
          <span className="dashboard-stat-value pmo-stat-success">{summary.onTrack}</span>
        </div>
        <div className="dashboard-stat-card">
          <span className="dashboard-stat-label">{t('dash.atRisk')}</span>
          <span className={`dashboard-stat-value ${summary.atRisk ? 'pmo-stat-warning' : ''}`}>{summary.atRisk}</span>
        </div>
        <div className="dashboard-stat-card">
          <span className="dashboard-stat-label">{t('dash.blocked')}</span>
          <span className={`dashboard-stat-value ${summary.blocked ? 'pmo-stat-danger' : ''}`}>{summary.blocked}</span>
        </div>
        <div className="dashboard-stat-card dashboard-stat-card--hide-sm">
          <span className="dashboard-stat-label">{t('dash.avgCompletion')}</span>
          <span className="dashboard-stat-value">{summary.avgCompletion}%</span>
        </div>
      </section>

      <section className="dashboard-stats dashboard-stats--secondary" aria-label={t('dash.helpdeskBacklog')}>
        <Link to="/helpdesk" className={`dashboard-stat-card ${helpdeskStats.open ? 'has-issue' : ''}`}>
          <span className="dashboard-stat-label">{t('dash.helpdeskOpen')}</span>
          <span className="dashboard-stat-value">{helpdeskStats.open}</span>
        </Link>
        <Link to="/projects" className="dashboard-stat-card">
          <span className="dashboard-stat-label">{t('dash.openCr')}</span>
          <span className="dashboard-stat-value pmo-stat-warning">{helpdeskStats.openCr}</span>
        </Link>
        <Link to="/projects" className="dashboard-stat-card">
          <span className="dashboard-stat-label">{t('dash.openBugs')}</span>
          <span className="dashboard-stat-value pmo-stat-danger">{helpdeskStats.openBugs}</span>
        </Link>
        <Link to="/helpdesk" className="dashboard-stat-card">
          <span className="dashboard-stat-label">{t('dash.recurring')}</span>
          <span className="dashboard-stat-value">{helpdeskStats.recurring}</span>
        </Link>
      </section>

      <DashboardWeekFeed />

      {attention.length > 0 && (
        <section className="dashboard-section dashboard-alert">
          <div className="dashboard-section-header">
            <h2 className="dashboard-section-title">{t('dash.needsAttention')}</h2>
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
                <Link to="/projects">{t('dash.viewAllFlagged')}</Link>
              </p>
            )}
          </div>
        </section>
      )}

      <section className="dashboard-section dashboard-projects">
        <div className="dashboard-section-header">
          <h2 className="dashboard-section-title">{t('dash.portfolio')}</h2>
          <Link to="/projects" className="btn btn-ghost btn-sm">{t('dash.seePortfolio')}</Link>
          <div className="dashboard-tabs">
            <button
              type="button"
              className={projectFilter === 'active' ? 'active' : ''}
              onClick={() => { setProjectFilter('active'); setShowAllProjects(false); }}
            >
              {t('status.active')}
            </button>
            <button
              type="button"
              className={projectFilter === 'all' ? 'active' : ''}
              onClick={() => { setProjectFilter('all'); setShowAllProjects(false); }}
            >
              {t('common.all')}
            </button>
          </div>
        </div>
        <div className="dashboard-section-toolbar">
          <span className="dashboard-toolbar-label">{t('common.health')}</span>
          <div className="pmo-filter-row">
            {['all', 'on_track', 'at_risk', 'blocked'].map((h) => (
              <button
                key={h}
                type="button"
                className={`pmo-chip-filter ${healthFilter === h ? 'active' : ''}`}
                onClick={() => { setHealthFilter(h); setShowAllProjects(false); }}
              >
                {h === 'all' ? t('common.all') : t(`health.${h}`)}
              </button>
            ))}
          </div>
        </div>
        <div className="dashboard-section-body">
          {filteredProjects.length === 0 ? (
            <p className="dashboard-empty">
              {t('dash.noMatch')} <Link to="/projects">{t('dash.createOne')}</Link>.
            </p>
          ) : (
            <>
              <div className="table-wrap pmo-data-list-wrap pmo-data-list-wrap--sticky pmo-data-list-wrap--comfortable">
                <table className="pmo-data-list pmo-portfolio-table">
                  <thead>
                    <tr>
                      <th>{t('common.project')}</th>
                      <th>{t('common.health')}</th>
                      <th>{t('common.status')}</th>
                      <th className="hide-mobile">{t('common.client')}</th>
                      <th>{t('common.progress')}</th>
                      <th className="hide-mobile">{t('common.teamCol')}</th>
                      <th className="hide-mobile">{t('common.due')}</th>
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
                            {t(`health.${p.health}`) || healthLabel(p.health)}
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
                      {t('dash.showAllProjects', { n: filteredProjects.length })}
                    </button>
                  ) : (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowAllProjects(false)}>
                      {t('dash.showLess')}
                    </button>
                  )}
                  <Link to="/projects" className="btn btn-ghost btn-sm">{t('dash.openProjects')}</Link>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
