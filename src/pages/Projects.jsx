import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useSubmitLock } from '../hooks/useSubmitLock';
import { useAuth } from '../AuthContext';
import { canCreateProject } from '../../lib/permissions.js';
import PageHeader from '../components/PageHeader';
import ProjectCreateModal from '../components/ProjectCreateModal';
import ProjectsPortfolioCharts from '../components/ProjectsPortfolioCharts';
import UiEmptyState from '../components/UiEmptyState';
import PageLoadingState from '../components/PageLoadingState';
import DataPanel from '../components/DataPanel';
import {
  PROJECT_ENGAGEMENT_TYPES,
  engagementTypeLabel,
  deliveryScopeLabel,
} from '../../lib/projectConstants.js';
import {
  enrichProjectsWithHealth,
  portfolioSummary,
  healthLabel,
  formatProjectDate,
  deadlineSummary,
  progressColor,
} from '../../lib/pmoMetrics.js';

const STATUS_FILTERS = [
  { id: 'active', label: 'Active' },
  { id: 'all', label: 'All' },
  { id: 'on-hold', label: 'On hold' },
  { id: 'completed', label: 'Completed' },
];

const HEALTH_FILTERS = [
  { id: 'all', label: 'All health' },
  { id: 'on_track', label: 'On track' },
  { id: 'at_risk', label: 'At risk' },
  { id: 'blocked', label: 'Blocked' },
];

const SORT_OPTIONS = [
  { id: 'health', label: 'Health priority' },
  { id: 'progress', label: 'Progress' },
  { id: 'due', label: 'Due date' },
  { id: 'name', label: 'Name' },
];

const HEALTH_ORDER = { blocked: 0, at_risk: 1, on_track: 2 };

function ProjectProgress({ progress, health }) {
  return (
    <div className="project-progress">
      <div className="pmo-progress-bar" aria-hidden>
        <div
          className="pmo-progress-fill"
          style={{ width: `${progress || 0}%`, background: progressColor(health) }}
        />
      </div>
      <span className="project-progress__value">{progress || 0}%</span>
    </div>
  );
}

function ProjectCard({ project: p, highlight = false }) {
  const deadline = deadlineSummary(p.end_date, p.status);

  return (
    <article
      id={`project-card-${p.id}`}
      className={`project-card ui-card project-card--${p.health || 'on_track'} ${highlight ? 'project-card--spotlight' : ''}`}
    >
      <Link to={`/projects/${p.id}`} className="project-card__cover-link" aria-hidden={!p.cover_image_url}>
        {p.cover_image_url ? (
          <div className="project-card__cover" style={{ backgroundImage: `url(${p.cover_image_url})` }}>
            <span className={`pmo-health-badge pmo-health-${p.health}`}>{healthLabel(p.health)}</span>
          </div>
        ) : (
          <div className="project-card__cover project-card__cover--placeholder">
            <span className="project-card__initial">{p.name.charAt(0).toUpperCase()}</span>
            <span className={`pmo-health-badge pmo-health-${p.health}`}>{healthLabel(p.health)}</span>
          </div>
        )}
      </Link>
      <div className="project-card__body">
        <div className="project-card__head">
          <Link to={`/projects/${p.id}`} className="project-card__title">{p.name}</Link>
          <span className={`dashboard-badge dashboard-badge-${p.status}`}>{p.status}</span>
        </div>
        {(p.engagement_type || p.classification) && (
          <span className="project-card__classification">
            {p.engagement_type ? engagementTypeLabel(p.engagement_type) : deliveryScopeLabel(p.classification)}
          </span>
        )}
        {p.description && <p className="project-card__desc">{p.description}</p>}
        <ProjectProgress progress={p.progress} health={p.health} />
        <div className="project-card__stats">
          <div className="project-card__stat">
            <span className="project-card__stat-value">{p.taskCount ?? 0}</span>
            <span className="project-card__stat-label">Tasks</span>
          </div>
          <div className={`project-card__stat ${p.overdueTasks ? 'project-card__stat--warn' : ''}`}>
            <span className="project-card__stat-value">{p.overdueTasks ?? 0}</span>
            <span className="project-card__stat-label">Overdue</span>
          </div>
          <div className="project-card__stat">
            <span className="project-card__stat-value">{p.member_count ?? 0}</span>
            <span className="project-card__stat-label">Team</span>
          </div>
        </div>
        <p className="project-card__meta">
          {p.client_name && <span className="project-card__client">{p.client_name}</span>}
          {(p.start_date || p.end_date) && (
            <span className="project-card__dates">
              {formatProjectDate(p.start_date) || '—'} → {formatProjectDate(p.end_date) || 'Open'}
            </span>
          )}
        </p>
        {deadline && (
          <span className={`project-deadline project-deadline--${deadline.tone}`}>{deadline.label}</span>
        )}
      </div>
      <div className="project-card__footer">
        <Link to={`/projects/${p.id}`} className="btn btn-primary btn-sm project-card__cta">Open workspace</Link>
        <Link to={`/gantt`} className="btn btn-secondary btn-sm">Timeline</Link>
      </div>
    </article>
  );
}

export default function Projects() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const mayCreate = canCreateProject(user);
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [healthFilter, setHealthFilter] = useState('all');
  const [engagementTypeFilter, setEngagementTypeFilter] = useState('');
  const [sortBy, setSortBy] = useState('health');
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('pmo-projects-view') || 'grid');
  const [spotlightId, setSpotlightId] = useState(null);
  const { pending: saving, run } = useSubmitLock();

  const load = () => {
    setLoading(true);
    Promise.all([api.projects.list(), api.projectTasks.list()])
      .then(([pr, tk]) => {
        setProjects(pr);
        setTasks(tk);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { api.clients.list().then(setClients).catch(console.error); }, []);

  const enriched = useMemo(() => enrichProjectsWithHealth(projects, tasks), [projects, tasks]);
  const summary = useMemo(() => portfolioSummary(enriched), [enriched]);

  const filtered = useMemo(() => {
    let list = enriched;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((p) =>
        p.name.toLowerCase().includes(q)
        || (p.client_name || '').toLowerCase().includes(q)
        || engagementTypeLabel(p.engagement_type).toLowerCase().includes(q)
        || (p.classification || '').toLowerCase().includes(q),
      );
    }
    if (statusFilter === 'active') list = list.filter((p) => p.status === 'active');
    else if (statusFilter !== 'all') list = list.filter((p) => p.status === statusFilter);
    if (healthFilter !== 'all') list = list.filter((p) => p.health === healthFilter);
    if (engagementTypeFilter) list = list.filter((p) => p.engagement_type === engagementTypeFilter);

    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'progress') return (b.progress || 0) - (a.progress || 0);
      if (sortBy === 'due') {
        if (!a.end_date && !b.end_date) return 0;
        if (!a.end_date) return 1;
        if (!b.end_date) return -1;
        return String(a.end_date).localeCompare(String(b.end_date));
      }
      const ha = HEALTH_ORDER[a.health] ?? 9;
      const hb = HEALTH_ORDER[b.health] ?? 9;
      if (ha !== hb) return ha - hb;
      return (b.overdueTasks || 0) - (a.overdueTasks || 0);
    });
    return sorted;
  }, [enriched, search, statusFilter, healthFilter, engagementTypeFilter, sortBy]);

  const handleChartDrillDown = useCallback((payload) => {
    if (payload?.clear) {
      setHealthFilter('all');
      setStatusFilter('active');
      setEngagementTypeFilter('');
      setSpotlightId(null);
      return;
    }
    if (payload.health) {
      setHealthFilter(payload.health);
      setStatusFilter('active');
    }
    if (payload.status) {
      setStatusFilter(payload.status);
    }
    if (payload.engagementType !== undefined) {
      setEngagementTypeFilter(payload.engagementType);
    }
    if (payload.projectId) {
      const pid = +payload.projectId;
      setSpotlightId(pid);
      window.setTimeout(() => {
        document.getElementById(`project-card-${pid}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        document.querySelector(`tr[data-project-id="${pid}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 80);
    }
  }, []);

  const setView = (mode) => {
    setViewMode(mode);
    localStorage.setItem('pmo-projects-view', mode);
  };

  const hasActiveFilters = Boolean(
    search.trim()
    || statusFilter !== 'active'
    || healthFilter !== 'all'
    || engagementTypeFilter,
  );

  const resetFilters = () => {
    setSearch('');
    setStatusFilter('active');
    setHealthFilter('all');
    setEngagementTypeFilter('');
    setSpotlightId(null);
  };

  const submit = async (form) => {
    if (!form.name.trim()) return;
    await run(async () => {
      try {
        const created = await api.projects.create({ ...form, client_ids: form.client_ids });
        setShowForm(false);
        load();
        navigate(`/projects/${created.id}`);
      } catch (err) {
        alert(err.message);
      }
    });
  };

  if (loading) {
    return <PageLoadingState message="Loading portfolio…" />;
  }

  return (
    <div className="page-module projects-page">
      <PageHeader
        eyebrow="Delivery"
        title="Projects"
        badge={`${summary.activeProjects} active`}
        subtitle="Portfolio health, deadlines, and team coverage — open a workspace to manage tasks and people."
        actions={mayCreate ? (
          <button type="button" className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : '+ New project'}
          </button>
        ) : null}
      />

      <section className="dashboard-stats kpi-strip projects-kpis" aria-label="Portfolio summary">
        <button type="button" className="dashboard-stat-card dashboard-stat-card--clickable" onClick={() => handleChartDrillDown({ clear: true })}>
          <span className="dashboard-stat-label">Total</span>
          <span className="dashboard-stat-value">{summary.totalProjects}</span>
          <span className="dashboard-stat-hint">All projects</span>
        </button>
        <button
          type="button"
          className="dashboard-stat-card dashboard-stat-card--clickable"
          onClick={() => handleChartDrillDown({ health: 'on_track', status: 'active' })}
        >
          <span className="dashboard-stat-label">On track</span>
          <span className="dashboard-stat-value pmo-stat-success">{summary.onTrack}</span>
          <span className="dashboard-stat-hint">Healthy delivery</span>
        </button>
        <button
          type="button"
          className="dashboard-stat-card dashboard-stat-card--clickable"
          onClick={() => handleChartDrillDown({ health: 'at_risk', status: 'active' })}
        >
          <span className="dashboard-stat-label">At risk</span>
          <span className={`dashboard-stat-value ${summary.atRisk ? 'pmo-stat-warning' : ''}`}>{summary.atRisk}</span>
          <span className="dashboard-stat-hint">Review soon</span>
        </button>
        <button
          type="button"
          className="dashboard-stat-card dashboard-stat-card--clickable"
          onClick={() => handleChartDrillDown({ health: 'blocked', status: 'active' })}
        >
          <span className="dashboard-stat-label">Blocked</span>
          <span className={`dashboard-stat-value ${summary.blocked ? 'pmo-stat-danger' : ''}`}>{summary.blocked}</span>
          <span className="dashboard-stat-hint">Stalled work</span>
        </button>
        <div className="dashboard-stat-card dashboard-stat-card--hide-sm">
          <span className="dashboard-stat-label">Avg completion</span>
          <span className="dashboard-stat-value">{summary.avgCompletion}%</span>
          <span className="dashboard-stat-hint">Active projects</span>
        </div>
      </section>

      <ProjectsPortfolioCharts
        enriched={enriched}
        summary={summary}
        onDrillDown={handleChartDrillDown}
        activeHealth={healthFilter}
        activeStatus={statusFilter}
        activeEngagement={engagementTypeFilter}
        spotlightProjectId={spotlightId}
      />

      <div className="card section-card module-filter-card helpdesk-toolbar-card projects-toolbar-card">
        <div className="module-toolbar helpdesk-toolbar helpdesk-toolbar--compact projects-toolbar--compact">
          <label className="module-toolbar__field module-toolbar__field--grow">
            <span className="module-toolbar__label">Search</span>
            <input
              type="search"
              className="form-field__input helpdesk-filter-input"
              placeholder="Project, client, engagement…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className="module-toolbar__field">
            <span className="module-toolbar__label">Status</span>
            <select
              className="form-field__input helpdesk-filter-input"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              {STATUS_FILTERS.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          </label>
          <label className="module-toolbar__field">
            <span className="module-toolbar__label">Health</span>
            <select
              className="form-field__input helpdesk-filter-input"
              value={healthFilter}
              onChange={(e) => setHealthFilter(e.target.value)}
            >
              {HEALTH_FILTERS.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          </label>
          <label className="module-toolbar__field">
            <span className="module-toolbar__label">Engagement</span>
            <select
              className="form-field__input helpdesk-filter-input"
              value={engagementTypeFilter}
              onChange={(e) => setEngagementTypeFilter(e.target.value)}
            >
              <option value="">All types</option>
              {PROJECT_ENGAGEMENT_TYPES.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </label>
          <label className="module-toolbar__field">
            <span className="module-toolbar__label">Sort</span>
            <select
              className="form-field__input helpdesk-filter-input"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </label>
          <label className="module-toolbar__field module-toolbar__field--view">
            <span className="module-toolbar__label">View</span>
            <select
              className="form-field__input helpdesk-filter-input"
              value={viewMode}
              onChange={(e) => setView(e.target.value)}
            >
              <option value="grid">Cards</option>
              <option value="table">Table</option>
            </select>
          </label>
          {hasActiveFilters && (
            <button
              type="button"
              className="btn btn-ghost btn-sm helpdesk-filter-reset"
              onClick={resetFilters}
            >
              Reset
            </button>
          )}
        </div>
        <p className="helpdesk-filter-summary projects-results" aria-live="polite">
          Showing {filtered.length} of {enriched.length} project{enriched.length === 1 ? '' : 's'}
          {hasActiveFilters ? ' (filtered)' : ''}
        </p>
      </div>

      <ProjectCreateModal
        open={showForm}
        clients={clients}
        saving={saving}
        onClose={() => setShowForm(false)}
        onSubmit={submit}
      />

      {filtered.length === 0 ? (
        <DataPanel>
          <UiEmptyState
            title="No projects match"
            description="Adjust filters or create a new project to get started."
            action={
              !showForm ? (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>
                  + New project
                </button>
              ) : null
            }
          />
        </DataPanel>
      ) : viewMode === 'table' ? (
        <div className="card section-card pmo-data-list-card pmo-data-list-card--fluid">
          <div className="table-wrap pmo-data-list-wrap pmo-data-list-wrap--sticky pmo-data-list-wrap--comfortable">
            <table className="pmo-data-list pmo-portfolio-table projects-table">
              <colgroup>
                <col className="col-primary" />
                <col className="col-health" />
                <col className="col-status" />
                <col className="col-progress" />
                <col className="col-narrow hide-mobile" />
                <col className="col-narrow hide-mobile" />
                <col className="col-narrow hide-mobile" />
                <col className="col-package hide-mobile" />
                <col className="col-dates" />
                <col className="col-actions" />
              </colgroup>
              <thead>
                <tr>
                  <th className="pmo-data-list__col-primary">Project</th>
                  <th>Health</th>
                  <th>Status</th>
                  <th>Progress</th>
                  <th className="hide-mobile">Tasks</th>
                  <th className="hide-mobile">Overdue</th>
                  <th className="hide-mobile">Team</th>
                  <th className="hide-mobile">Client</th>
                  <th>Due</th>
                  <th className="table-actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const deadline = deadlineSummary(p.end_date, p.status);
                  const isSpotlight = spotlightId === p.id;
                  return (
                    <tr key={p.id} data-project-id={p.id} className={isSpotlight ? 'projects-table-row--spotlight' : ''}>
                      <td className="pmo-data-list__primary">
                        <Link to={`/projects/${p.id}`} className="pmo-link-strong">{p.name}</Link>
                        {(p.engagement_type || p.classification) && (
                          <div className="pmo-table-muted">
                            {p.engagement_type ? engagementTypeLabel(p.engagement_type) : deliveryScopeLabel(p.classification)}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className={`pmo-health-badge pmo-health-${p.health}`}>{healthLabel(p.health)}</span>
                      </td>
                      <td><span className={`dashboard-badge dashboard-badge-${p.status}`}>{p.status}</span></td>
                      <td>
                        <div className="pmo-progress-cell">
                          <div className="pmo-progress-bar" aria-hidden>
                            <div className="pmo-progress-fill" style={{ width: `${p.progress || 0}%`, background: progressColor(p.health) }} />
                          </div>
                          <span>{p.progress || 0}%</span>
                        </div>
                      </td>
                      <td className="hide-mobile">{p.taskCount ?? 0}</td>
                      <td className={`hide-mobile ${p.overdueTasks ? 'pmo-stat-warning' : ''}`}>{p.overdueTasks ?? 0}</td>
                      <td className="hide-mobile">{p.member_count ?? 0}</td>
                      <td className="hide-mobile">{p.client_name || '—'}</td>
                      <td>
                        {deadline ? (
                          <span className={`project-deadline project-deadline--${deadline.tone}`}>{deadline.label}</span>
                        ) : (formatProjectDate(p.end_date) || '—')}
                      </td>
                      <td className="pmo-row-actions">
                        <Link to={`/projects/${p.id}`} className="btn btn-secondary btn-sm">Open</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="pmo-data-list-footer pmo-data-list-footer--scroll-hint" aria-live="polite">
            Showing {filtered.length} of {projects.length} projects
          </p>
        </div>
      ) : (
        <div className="project-grid">
          {filtered.map((p) => (
            <ProjectCard key={p.id} project={p} highlight={spotlightId === p.id} />
          ))}
        </div>
      )}
    </div>
  );
}
