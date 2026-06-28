import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import PageHeader from '../components/PageHeader';
import UiEmptyState from '../components/UiEmptyState';

const TASK_STATUS = {
  new: { label: 'New', className: 'gantt-status--new' },
  ongoing: { label: 'In progress', className: 'gantt-status--ongoing' },
  done: { label: 'Done', className: 'gantt-status--done' },
};

const DATE_PRESETS = [
  { id: '6m', label: '6 months', months: 6 },
  { id: '1y', label: '1 year', months: 12 },
  { id: '2y', label: '2 years', months: 24 },
];

const VIEW_MODES = [
  { id: 'both', label: 'Planned + actual' },
  { id: 'planning', label: 'Planned only' },
  { id: 'actual', label: 'Actual only' },
];

const ZOOM_OPTIONS = [
  { id: 'compact', label: 'Compact', width: 56 },
  { id: 'standard', label: 'Standard', width: 80 },
  { id: 'wide', label: 'Wide', width: 104 },
];

const STATUS_FILTERS = [
  { id: 'all', label: 'All statuses' },
  { id: 'new', label: 'New' },
  { id: 'ongoing', label: 'In progress' },
  { id: 'done', label: 'Done' },
];

function parseDate(str) {
  if (!str) return null;
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toDateInput(d) {
  return d.toISOString().slice(0, 10);
}

function presetRange(months) {
  const mid = new Date();
  const from = new Date(mid.getFullYear(), mid.getMonth() - Math.floor(months / 2), 1);
  const to = new Date(mid.getFullYear(), mid.getMonth() + Math.ceil(months / 2), 0);
  return { from: toDateInput(from), to: toDateInput(to) };
}

function getMonthLabels(rangeStart, rangeEnd) {
  const labels = [];
  const start = new Date(rangeStart);
  const end = new Date(rangeEnd);
  const current = new Date(start.getFullYear(), start.getMonth(), 1);
  while (current <= end) {
    labels.push({
      key: current.toISOString().slice(0, 7),
      label: current.toLocaleDateString('en-US', { month: 'short' }),
      start: new Date(current),
      end: new Date(current.getFullYear(), current.getMonth() + 1, 0),
    });
    current.setMonth(current.getMonth() + 1);
  }
  return labels;
}

function getYearGroups(monthLabels) {
  const groups = [];
  for (const m of monthLabels) {
    const year = m.start.getFullYear();
    const last = groups[groups.length - 1];
    if (last && last.year === year) last.span += 1;
    else groups.push({ year, span: 1 });
  }
  return groups;
}

function barPosition(startStr, endStr, rangeStart, rangeEnd) {
  const start = parseDate(startStr);
  const end = parseDate(endStr);
  if (!start || !end) return null;
  const rangeMs = rangeEnd - rangeStart;
  const left = Math.max(0, (start - rangeStart) / rangeMs * 100);
  const width = Math.min(100 - left, (end - start) / rangeMs * 100);
  if (width <= 0) return null;
  return { left: `${left.toFixed(2)}%`, width: `${width.toFixed(2)}%` };
}

function formatGanttDateLabel(str) {
  if (!str) return '—';
  const d = parseDate(str);
  if (!d) return str;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function daysBetween(a, b) {
  const da = parseDate(a);
  const db = parseDate(b);
  if (!da || !db) return null;
  return Math.round((db - da) / (1000 * 60 * 60 * 24)) + 1;
}

function taskMatchesSearch(task, q) {
  if (!q) return true;
  const haystack = [
    task.name,
    task.parent_name,
    task.assignee_name,
    task.project_name,
  ].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(q);
}

function GanttBarTooltip({ title, lines }) {
  return (
    <div className="gantt-bar-tooltip" role="tooltip">
      <span className="gantt-bar-tooltip-title">{title}</span>
      {lines.map((line, i) => (
        <span key={i} className="gantt-bar-tooltip-line">{line}</span>
      ))}
    </div>
  );
}

function GanttSkeleton() {
  return (
    <div className="gantt-skeleton" aria-hidden="true">
      {[1, 2, 3].map((g) => (
        <div key={g} className="gantt-skeleton-group">
          <div className="gantt-skeleton-line gantt-skeleton-line--project" />
          {[1, 2].map((r) => (
            <div key={r} className="gantt-skeleton-row">
              <div className="gantt-skeleton-line gantt-skeleton-line--label" />
              <div className="gantt-skeleton-line gantt-skeleton-line--bar" style={{ width: `${30 + r * 20}%`, marginLeft: `${r * 8}%` }} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function Gantt() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('both');
  const [projectFilterId, setProjectFilterId] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [zoom, setZoom] = useState('standard');
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [dateRange, setDateRange] = useState(() => presetRange(12));
  const [activePreset, setActivePreset] = useState('1y');
  const scrollRef = useRef(null);

  useEffect(() => {
    setLoading(true);
    api.projectTasks.listGantt(dateRange.from, dateRange.to)
      .then(setTasks)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [dateRange.from, dateRange.to]);

  const monthWidth = ZOOM_OPTIONS.find((z) => z.id === zoom)?.width ?? 80;
  const q = search.trim().toLowerCase();

  const { rangeStart, rangeEnd, rows, monthLabels, yearGroups, availableProjects, stats, visibleTaskCount } = useMemo(() => {
    const from = new Date(dateRange.from);
    const to = new Date(dateRange.to);
    const rangeStart = from.getTime();
    const rangeEnd = to.getTime();
    const monthLabels = getMonthLabels(from, to);
    const yearGroups = getYearGroups(monthLabels);

    const availableProjects = Array.from(new Set(tasks.map((t) => t.project_id).filter(Boolean)))
      .sort((a, b) => a - b)
      .map((pid) => {
        const match = tasks.find((t) => t.project_id === pid);
        return { id: pid, name: match?.project_name || `Project ${pid}` };
      });

    let tasksFiltered = tasks;
    if (projectFilterId) tasksFiltered = tasksFiltered.filter((t) => t.project_id === +projectFilterId);
    if (statusFilter !== 'all') tasksFiltered = tasksFiltered.filter((t) => (t.status || 'new') === statusFilter);
    if (q) tasksFiltered = tasksFiltered.filter((t) => taskMatchesSearch(t, q));

    const byProject = {};
    tasksFiltered.forEach((t) => {
      if (!byProject[t.project_name]) {
        byProject[t.project_name] = { name: t.project_name, project_id: t.project_id, tasks: [] };
      }
      byProject[t.project_name].tasks.push(t);
    });
    const rows = Object.values(byProject).sort((a, b) => a.project_id - b.project_id);

    const allTasks = rows.flatMap((r) => r.tasks);
    const withProgress = allTasks.filter((t) => t.progress_percent != null);
    const avgProgress = withProgress.length
      ? Math.round(withProgress.reduce((s, t) => s + (t.progress_percent ?? 0), 0) / withProgress.length)
      : 0;

    const stats = {
      projects: rows.length,
      tasks: allTasks.length,
      avgProgress,
      ongoing: allTasks.filter((t) => t.status === 'ongoing').length,
      done: allTasks.filter((t) => t.status === 'done').length,
    };

    return {
      rangeStart,
      rangeEnd,
      rows,
      monthLabels,
      yearGroups,
      availableProjects,
      stats,
      visibleTaskCount: allTasks.length,
    };
  }, [tasks, dateRange, projectFilterId, statusFilter, q]);

  useEffect(() => {
    if (!projectFilterId) return;
    if (!availableProjects.some((p) => p.id === +projectFilterId)) setProjectFilterId('');
  }, [availableProjects, projectFilterId]);

  const toggleCollapse = useCallback((projectId) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setCollapsed(new Set());
  }, []);

  const collapseAll = useCallback(() => {
    setCollapsed(new Set(rows.map((r) => r.project_id)));
  }, [rows]);

  const applyPreset = (presetId) => {
    const preset = DATE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setActivePreset(preset.id);
    setDateRange(presetRange(preset.months));
  };

  const scrollToToday = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const marker = container.querySelector('.gantt-today-marker');
    if (!marker) return;
    const containerRect = container.getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();
    const offset = markerRect.left - containerRect.left + container.scrollLeft - container.clientWidth / 2;
    container.scrollTo({ left: Math.max(0, offset), behavior: 'smooth' });
  }, []);

  const resetFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setProjectFilterId('');
  };

  const hasActiveFilters = Boolean(q || statusFilter !== 'all' || projectFilterId);
  const rangeMs = rangeEnd - rangeStart;
  const todayMs = new Date().setHours(0, 0, 0, 0);
  const showTodayLine = todayMs >= rangeStart && todayMs <= rangeEnd;
  const todayLeft = showTodayLine ? `${((todayMs - rangeStart) / rangeMs * 100).toFixed(2)}%` : null;
  const dualLane = viewMode === 'both';

  return (
    <div className="page-module gantt-page">
      <PageHeader
        eyebrow="Delivery"
        title="Gantt timeline"
        badge={!loading && stats.tasks > 0 ? `${stats.tasks} tasks` : null}
        subtitle="Planned vs actual dates across your portfolio — open a project to edit tasks."
        actions={(
          <Link to="/projects" className="btn btn-secondary btn-sm">Projects</Link>
        )}
      />

      <div className="gantt-workspace card section-card module-workspace">
        {!loading && stats.tasks > 0 && (
          <div className="gantt-kpi-row" aria-label="Timeline summary">
            <div className="gantt-kpi">
              <span className="gantt-kpi__value">{stats.projects}</span>
              <span className="gantt-kpi__label">Projects</span>
            </div>
            <div className="gantt-kpi">
              <span className="gantt-kpi__value">{stats.tasks}</span>
              <span className="gantt-kpi__label">Tasks</span>
            </div>
            <div className="gantt-kpi">
              <span className="gantt-kpi__value">{stats.avgProgress}%</span>
              <span className="gantt-kpi__label">Avg progress</span>
            </div>
            <div className="gantt-kpi gantt-kpi--accent">
              <span className="gantt-kpi__value">{stats.ongoing}</span>
              <span className="gantt-kpi__label">In progress</span>
            </div>
            <div className="gantt-kpi gantt-kpi--success">
              <span className="gantt-kpi__value">{stats.done}</span>
              <span className="gantt-kpi__label">Completed</span>
            </div>
          </div>
        )}

        <div className="gantt-toolbar gantt-toolbar--compact">
          <div className="gantt-toolbar__row">
            <label className="gantt-toolbar__field gantt-toolbar__field--search">
              <span className="sr-only">Search tasks</span>
              <input
                type="search"
                className="form-field__input helpdesk-filter-input"
                placeholder="Search task, assignee, project…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search tasks"
              />
            </label>
            <label className="gantt-toolbar__field">
              <span className="module-toolbar__label">Range</span>
              <select
                className="form-field__input helpdesk-filter-input"
                value={activePreset || ''}
                onChange={(e) => { if (e.target.value) applyPreset(e.target.value); }}
              >
                {activePreset === '' && <option value="">Custom range</option>}
                {DATE_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </label>
            <label className="gantt-toolbar__field">
              <span className="module-toolbar__label">From</span>
              <input
                type="date"
                value={dateRange.from}
                onChange={(e) => { setActivePreset(''); setDateRange((r) => ({ ...r, from: e.target.value })); }}
                className="form-field__input helpdesk-filter-input"
              />
            </label>
            <label className="gantt-toolbar__field">
              <span className="module-toolbar__label">To</span>
              <input
                type="date"
                value={dateRange.to}
                onChange={(e) => { setActivePreset(''); setDateRange((r) => ({ ...r, to: e.target.value })); }}
                className="form-field__input helpdesk-filter-input"
              />
            </label>
            <label className="gantt-toolbar__field gantt-toolbar__field--grow">
              <span className="module-toolbar__label">Project</span>
              <select
                value={projectFilterId}
                onChange={(e) => setProjectFilterId(e.target.value)}
                className="form-field__input helpdesk-filter-input"
              >
                <option value="">All projects</option>
                {availableProjects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
            <label className="gantt-toolbar__field">
              <span className="module-toolbar__label">Status</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="form-field__input helpdesk-filter-input"
              >
                {STATUS_FILTERS.map((f) => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
            </label>
            <label className="gantt-toolbar__field">
              <span className="module-toolbar__label">View</span>
              <select
                value={viewMode}
                onChange={(e) => setViewMode(e.target.value)}
                className="form-field__input helpdesk-filter-input"
              >
                {VIEW_MODES.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </label>
            <label className="gantt-toolbar__field">
              <span className="module-toolbar__label">Zoom</span>
              <select
                value={zoom}
                onChange={(e) => setZoom(e.target.value)}
                className="form-field__input helpdesk-filter-input"
              >
                {ZOOM_OPTIONS.map((z) => (
                  <option key={z.id} value={z.id}>{z.label}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="gantt-toolbar__actions">
            <div className="gantt-toolbar__meta">
              <strong>{formatGanttDateLabel(dateRange.from)}</strong>
              <span>→</span>
              <strong>{formatGanttDateLabel(dateRange.to)}</strong>
              {!loading && (
                <span className="gantt-toolbar__count">
                  {visibleTaskCount} task{visibleTaskCount !== 1 ? 's' : ''} shown
                </span>
              )}
            </div>
            <div className="gantt-toolbar__buttons">
              {hasActiveFilters && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={resetFilters}>
                  Reset filters
                </button>
              )}
              <button type="button" className="btn btn-ghost btn-sm" onClick={expandAll} disabled={!rows.length}>
                Expand all
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={collapseAll} disabled={!rows.length}>
                Collapse all
              </button>
              {showTodayLine && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={scrollToToday}>
                  Jump to today
                </button>
              )}
            </div>
          </div>
          <div className="gantt-legend-bar">
            <span className="gantt-legend-item"><span className="gantt-legend-swatch gantt-legend-swatch--planned" /> Planned</span>
            <span className="gantt-legend-item"><span className="gantt-legend-swatch gantt-legend-swatch--actual" /> Actual</span>
            <span className="gantt-legend-item"><span className="gantt-legend-swatch gantt-legend-swatch--today" /> Today</span>
            {dualLane && (
              <span className="gantt-legend-item gantt-legend-item--hint">Dual lane: planned above, actual below</span>
            )}
          </div>
        </div>

        {loading ? (
          <GanttSkeleton />
        ) : rows.length === 0 ? (
          <UiEmptyState
            title={hasActiveFilters ? 'No tasks match your filters' : 'No tasks in this range'}
            description={
              hasActiveFilters
                ? 'Try clearing filters or widening the date range.'
                : (
                  <>
                    Add tasks with planned or actual dates in a{' '}
                    <Link to="/projects">project workspace</Link>, or widen the range above.
                  </>
                )
            }
            action={hasActiveFilters ? (
              <button type="button" className="btn btn-secondary btn-sm" onClick={resetFilters}>Reset filters</button>
            ) : (
              <Link to="/projects" className="btn btn-primary btn-sm">Browse projects</Link>
            )}
          />
        ) : (
          <div className="gantt-container">
            <div className="gantt-scroll-wrap" ref={scrollRef}>
              <div
                className={`gantt-grid ${dualLane ? 'gantt-grid--dual' : ''}`}
                style={{
                  '--gantt-months': monthLabels.length,
                  '--gantt-month-w': `${monthWidth}px`,
                }}
              >
                <div className="gantt-header-row">
                  <div className="gantt-label-col gantt-label-header">
                    <span className="gantt-label-header__title">Project / Task</span>
                  </div>
                  <div className="gantt-timeline-col gantt-timeline-col--header">
                    <div className="gantt-year-row">
                      {yearGroups.map((y) => (
                        <div
                          key={y.year}
                          className="gantt-year-cell"
                          style={{ width: `calc(var(--gantt-month-w) * ${y.span})` }}
                        >
                          {y.year}
                        </div>
                      ))}
                    </div>
                    <div className="gantt-month-row">
                      {monthLabels.map((m) => (
                        <div key={m.key} className="gantt-month-cell">{m.label}</div>
                      ))}
                    </div>
                    {showTodayLine && (
                      <div className="gantt-today-marker" style={{ left: todayLeft }} title="Today">
                        <span className="gantt-today-marker__dot" />
                        <span className="gantt-today-marker__label">Today</span>
                      </div>
                    )}
                  </div>
                </div>

                {rows.map((project) => {
                  const isCollapsed = collapsed.has(project.project_id);
                  return (
                    <div key={project.project_id} className="gantt-project-group">
                      <div className="gantt-row gantt-row-project">
                        <div className="gantt-label-col gantt-label gantt-label-project">
                          <button
                            type="button"
                            className="gantt-project-toggle"
                            onClick={() => toggleCollapse(project.project_id)}
                            aria-expanded={!isCollapsed}
                            aria-label={isCollapsed ? 'Expand project' : 'Collapse project'}
                          >
                            <span className={`gantt-chevron ${isCollapsed ? 'gantt-chevron--collapsed' : ''}`} />
                          </button>
                          <Link to={`/projects/${project.project_id}`} className="gantt-project-link">
                            {project.name}
                          </Link>
                          <span className="gantt-project-count">{project.tasks.length}</span>
                        </div>
                        <div className="gantt-timeline-col gantt-timeline-track gantt-timeline-track--project">
                          {showTodayLine && <div className="gantt-today-line" style={{ left: todayLeft }} />}
                        </div>
                      </div>

                      {!isCollapsed && project.tasks.map((task, taskIdx) => {
                        const planPos = barPosition(task.planned_start_date, task.planned_end_date, rangeStart, rangeEnd);
                        const actualPos = barPosition(task.actual_start_date, task.actual_end_date, rangeStart, rangeEnd);
                        const statusMeta = TASK_STATUS[task.status] || TASK_STATUS.new;
                        const planDays = daysBetween(task.planned_start_date, task.planned_end_date);
                        const actualDays = daysBetween(task.actual_start_date, task.actual_end_date);
                        const progress = task.progress_percent ?? 0;

                        return (
                          <div
                            key={task.id}
                            className={`gantt-row gantt-row-task ${taskIdx % 2 === 1 ? 'gantt-row--alt' : ''}`}
                          >
                            <div
                              className="gantt-label-col gantt-label gantt-label-task"
                              title={[
                                task.parent_name && `${task.parent_name} / `,
                                task.name,
                                task.assignee_name && ` · ${task.assignee_name}`,
                              ].filter(Boolean).join('')}
                            >
                              <span className={`gantt-status ${statusMeta.className}`}>{statusMeta.label}</span>
                              <span className="gantt-task-text">
                                {task.parent_name && (
                                  <span className="gantt-task-parent">{task.parent_name} / </span>
                                )}
                                <span className="gantt-task-name">{task.name}</span>
                              </span>
                              <div className="gantt-task-foot">
                                {task.assignee_name && (
                                  <span className="gantt-task-assignee">{task.assignee_name}</span>
                                )}
                                {progress > 0 && (
                                  <span className="gantt-task-progress">{progress}%</span>
                                )}
                              </div>
                            </div>
                            <div className={`gantt-timeline-col gantt-timeline-track ${dualLane ? 'gantt-timeline-track--dual' : ''}`}>
                              {showTodayLine && <div className="gantt-today-line" style={{ left: todayLeft }} />}

                              {(viewMode === 'planning' || viewMode === 'both') && planPos && (
                                <div
                                  className={`gantt-bar-hit ${dualLane ? 'gantt-bar-hit--plan' : ''}`}
                                  style={{ left: planPos.left, width: planPos.width }}
                                  tabIndex={0}
                                >
                                  <div className="gantt-bar gantt-bar-planning">
                                    <span className="gantt-bar-shine" />
                                  </div>
                                  <GanttBarTooltip
                                    title="Planned"
                                    lines={[
                                      task.name,
                                      `${formatGanttDateLabel(task.planned_start_date)} → ${formatGanttDateLabel(task.planned_end_date)}`,
                                      planDays != null ? `${planDays} day${planDays === 1 ? '' : 's'}` : null,
                                    ].filter(Boolean)}
                                  />
                                </div>
                              )}

                              {(viewMode === 'actual' || viewMode === 'both') && actualPos && (
                                <div
                                  className={`gantt-bar-hit gantt-bar-hit--actual ${dualLane ? 'gantt-bar-hit--actual-lane' : ''}`}
                                  style={{ left: actualPos.left, width: actualPos.width }}
                                  tabIndex={0}
                                >
                                  <div className={`gantt-bar gantt-bar-actual gantt-bar-actual--${task.status || 'new'}`}>
                                    {progress > 0 && progress < 100 && (
                                      <span className="gantt-bar-progress" style={{ width: `${progress}%` }} />
                                    )}
                                    <span className="gantt-bar-shine" />
                                    {progress > 0 && (
                                      <span className="gantt-bar-label">{progress}%</span>
                                    )}
                                  </div>
                                  <GanttBarTooltip
                                    title="Actual"
                                    lines={[
                                      task.name,
                                      `${formatGanttDateLabel(task.actual_start_date)} → ${formatGanttDateLabel(task.actual_end_date)}`,
                                      `${progress}% complete`,
                                      actualDays != null ? `${actualDays} day${actualDays === 1 ? '' : 's'}` : null,
                                    ].filter(Boolean)}
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
