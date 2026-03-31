import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

function parseDate(str) {
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function getMonthLabels(rangeStart, rangeEnd) {
  const labels = [];
  const start = new Date(rangeStart);
  const end = new Date(rangeEnd);
  const current = new Date(start.getFullYear(), start.getMonth(), 1);
  while (current <= end) {
    labels.push({
      key: current.toISOString().slice(0, 7),
      label: current.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      start: new Date(current),
      end: new Date(current.getFullYear(), current.getMonth() + 1, 0),
    });
    current.setMonth(current.getMonth() + 1);
  }
  return labels;
}

function barPosition(startStr, endStr, rangeStart, rangeEnd) {
  const start = parseDate(startStr);
  const end = parseDate(endStr);
  if (!start || !end) return null;
  const rangeMs = rangeEnd - rangeStart;
  const left = Math.max(0, (start - rangeStart) / rangeMs * 100);
  const width = Math.min(100 - left, (end - start) / rangeMs * 100);
  if (width <= 0) return null;
  return { left: left.toFixed(2) + '%', width: width.toFixed(2) + '%' };
}

function formatGanttDateLabel(str) {
  if (!str) return '—';
  const d = parseDate(str);
  if (!d) return str;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
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

export default function Gantt() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('planning'); // 'planning' | 'actual' | 'both'
  const [projectFilterId, setProjectFilterId] = useState(''); // '' => all projects
  const [dateRange, setDateRange] = useState(() => {
    const d = new Date();
    const year = d.getFullYear();
    const from = new Date(year - 1, 0, 1);
    const to = new Date(year + 1, 11, 31);
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
  });

  useEffect(() => {
    setLoading(true);
    api.projectTasks.listGantt(dateRange.from, dateRange.to)
      .then(setTasks)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [dateRange.from, dateRange.to]);

  const { rangeStart, rangeEnd, rows, monthLabels, availableProjects } = useMemo(() => {
    const from = new Date(dateRange.from);
    const to = new Date(dateRange.to);
    const rangeStart = from.getTime();
    const rangeEnd = to.getTime();
    const monthLabels = getMonthLabels(from, to);

    const availableProjects = Array.from(new Set(tasks.map(t => t.project_id).filter(Boolean)))
      .sort((a, b) => a - b)
      .map(pid => {
        const match = tasks.find(t => t.project_id === pid);
        return { id: pid, name: match?.project_name || `Project ${pid}` };
      });

    const tasksFiltered = projectFilterId
      ? tasks.filter(t => t.project_id === +projectFilterId)
      : tasks;

    const byProject = {};
    tasksFiltered.forEach(t => {
      if (!byProject[t.project_name]) byProject[t.project_name] = { name: t.project_name, project_id: t.project_id, tasks: [] };
      byProject[t.project_name].tasks.push(t);
    });
    const rows = Object.values(byProject).sort((a, b) => a.project_id - b.project_id);

    return { rangeStart, rangeEnd, rows, monthLabels, availableProjects };
  }, [tasks, dateRange, projectFilterId]);

  useEffect(() => {
    if (!projectFilterId) return;
    if (!availableProjects.some(p => p.id === +projectFilterId)) setProjectFilterId('');
  }, [availableProjects, projectFilterId]);

  const rangeMs = rangeEnd - rangeStart;
  const todayMs = new Date().setHours(0, 0, 0, 0);
  const showTodayLine = todayMs >= rangeStart && todayMs <= rangeEnd;
  const todayLeft = showTodayLine ? ((todayMs - rangeStart) / rangeMs * 100).toFixed(2) + '%' : null;

  return (
    <div className="gantt-page">
      <div className="gantt-page-header">
        <div>
          <h1 className="gantt-title">Timeline / Gantt</h1>
          <p className="gantt-subtitle">
            Planned vs actual dates by project. Switch view or change date range below. Manage tasks in each <Link to="/projects">project</Link>.
          </p>
        </div>
      </div>

      <div className="gantt-controls card">
        <div className="gantt-controls-inner">
          <div className="gantt-date-range">
            <label>
              <span className="gantt-control-label">From</span>
              <input
                type="date"
                value={dateRange.from}
                onChange={e => setDateRange(r => ({ ...r, from: e.target.value }))}
                className="gantt-input"
              />
            </label>
            <label>
              <span className="gantt-control-label">To</span>
              <input
                type="date"
                value={dateRange.to}
                onChange={e => setDateRange(r => ({ ...r, to: e.target.value }))}
                className="gantt-input"
              />
            </label>
          </div>
          <div className="gantt-project-filter">
            <label>
              <span className="gantt-control-label">Project</span>
              <select
                value={projectFilterId}
                onChange={e => setProjectFilterId(e.target.value)}
                className="gantt-input"
                style={{ marginTop: 0 }}
              >
                <option value="">All projects</option>
                {availableProjects.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="gantt-view-toggle">
            <span className="gantt-control-label">View</span>
            <div className="gantt-view-buttons">
              {['planning', 'actual', 'both'].map(mode => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  className={`gantt-view-btn ${viewMode === mode ? 'active' : ''}`}
                >
                  {mode === 'planning' ? 'Planned' : mode === 'actual' ? 'Actual' : 'Both'}
                </button>
              ))}
            </div>
          </div>
          <div className="gantt-legend gantt-legend-inline">
            <span className="gantt-legend-item"><span className="gantt-legend-dot planned" /> Planned</span>
            <span className="gantt-legend-item"><span className="gantt-legend-dot actual" /> Actual</span>
          </div>
        </div>
      </div>

      <div className="gantt-card card">
        {loading ? (
          <div className="gantt-loading">Loading timeline…</div>
        ) : rows.length === 0 ? (
          <div className="gantt-empty">
            {projectFilterId ? (
              <p>No tasks for the selected project in this date range. Try a wider range or pick another project.</p>
            ) : (
              <p>No project tasks in this date range. Add tasks with planned/actual dates in each <Link to="/projects">project</Link>, or widen the range above.</p>
            )}
          </div>
        ) : (
          <div className="gantt-container">
            <div className="gantt-scroll-wrap">
              <div className="gantt-grid" style={{ '--gantt-months': monthLabels.length }}>
                <div className="gantt-header-row">
                  <div className="gantt-label-col gantt-label-header">Project / Task</div>
                  <div className="gantt-timeline-col">
                    <div className="gantt-month-row">
                      {monthLabels.map(m => (
                        <div key={m.key} className="gantt-month-cell">{m.label}</div>
                      ))}
                    </div>
                    {showTodayLine && <div className="gantt-today-line" style={{ left: todayLeft }} title="Today" />}
                  </div>
                </div>
                {rows.map(project => (
                  <div key={project.project_id} className="gantt-project-group">
                    <div className="gantt-row gantt-row-project">
                      <div className="gantt-label-col gantt-label">
                        <Link to={`/projects/${project.project_id}`} className="gantt-project-link">{project.name}</Link>
                      </div>
                      <div className="gantt-timeline-col gantt-timeline-track" />
                    </div>
                    {project.tasks.map(task => {
                      const planPos = barPosition(task.planned_start_date, task.planned_end_date, rangeStart, rangeEnd);
                      const actualPos = barPosition(task.actual_start_date, task.actual_end_date, rangeStart, rangeEnd);
                      return (
                        <div key={task.id} className="gantt-row gantt-row-task">
                          <div
                            className="gantt-label-col gantt-label gantt-label-task"
                            title={[
                              task.parent_name && `${task.parent_name} / `,
                              task.name,
                              task.assignee_name && ` · ${task.assignee_name}`,
                            ].filter(Boolean).join('')}
                          >
                            {task.parent_name && (
                              <span className="gantt-task-parent">{task.parent_name} / </span>
                            )}
                            <span className="gantt-task-name">{task.name}</span>
                            {task.assignee_name && (
                              <span className="gantt-task-assignee" title={`Assigned to ${task.assignee_name}`}> · {task.assignee_name}</span>
                            )}
                            {(viewMode === 'actual' || viewMode === 'both') && task.progress_percent != null && (
                              <span className="gantt-task-pct">{task.progress_percent}%</span>
                            )}
                          </div>
                          <div className="gantt-timeline-col gantt-timeline-track">
                            {(viewMode === 'planning' || viewMode === 'both') && planPos && (
                              <div
                                className="gantt-bar-hit"
                                style={{ left: planPos.left, width: planPos.width, minWidth: '4px' }}
                              >
                                <div className="gantt-bar gantt-bar-planning" />
                                <GanttBarTooltip
                                  title="Planned"
                                  lines={[
                                    `${formatGanttDateLabel(task.planned_start_date)} → ${formatGanttDateLabel(task.planned_end_date)}`,
                                  ]}
                                />
                              </div>
                            )}
                            {(viewMode === 'actual' || viewMode === 'both') && actualPos && (
                              <div
                                className="gantt-bar-hit gantt-bar-hit-actual"
                                style={{ left: actualPos.left, width: actualPos.width, minWidth: '4px' }}
                              >
                                <div className="gantt-bar gantt-bar-actual">
                                  {(task.progress_percent ?? 0) > 0 && (task.progress_percent ?? 0) < 100 && (
                                    <span className="gantt-bar-progress" style={{ width: (task.progress_percent ?? 0) + '%' }} />
                                  )}
                                </div>
                                <GanttBarTooltip
                                  title="Actual"
                                  lines={[
                                    `${formatGanttDateLabel(task.actual_start_date)} → ${formatGanttDateLabel(task.actual_end_date)}`,
                                    `${task.progress_percent ?? 0}% complete`,
                                  ]}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

