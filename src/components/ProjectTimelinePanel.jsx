import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import UiEmptyState from './UiEmptyState';
import { formatProjectDate, deadlineSummary } from '../../lib/pmoMetrics.js';
import { deliveryScopeLabel } from '../../lib/projectConstants.js';
import { phaseStatusLabel } from '../../lib/phaseConstants.js';

const RANGE_PRESETS = [
  { id: 'fit', label: 'Fit all' },
  { id: '3m', label: '3 months', months: 3 },
  { id: '6m', label: '6 months', months: 6 },
  { id: '1y', label: '1 year', months: 12 },
];

const TASK_STATUS_CLASS = {
  new: 'project-timeline-status--new',
  ongoing: 'project-timeline-status--ongoing',
  done: 'project-timeline-status--done',
};

function parseDate(str) {
  if (!str) return null;
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toDateInput(d) {
  return d.toISOString().slice(0, 10);
}

function barPosition(startStr, endStr, rangeStart, rangeEnd) {
  const start = parseDate(startStr);
  const end = parseDate(endStr);
  if (!start || !end) return null;
  const rangeMs = rangeEnd - rangeStart;
  if (rangeMs <= 0) return null;
  const left = Math.max(0, ((start - rangeStart) / rangeMs) * 100);
  const width = Math.min(100 - left, ((end - start) / rangeMs) * 100);
  if (width <= 0) return null;
  return { left: `${left.toFixed(2)}%`, width: `${Math.max(width, 0.4).toFixed(2)}%` };
}

function markerPosition(dateStr, rangeStart, rangeEnd) {
  const d = parseDate(dateStr);
  if (!d) return null;
  const rangeMs = rangeEnd - rangeStart;
  if (rangeMs <= 0) return null;
  const left = Math.max(0, Math.min(100, ((d - rangeStart) / rangeMs) * 100));
  return `${left.toFixed(2)}%`;
}

function computeRange(preset, tasks, phases, project) {
  const dates = [];
  const push = (d) => {
    const p = parseDate(d);
    if (p) dates.push(p);
  };

  (tasks || []).filter((t) => t.task_kind !== 'group').forEach((t) => {
    push(t.planned_start_date);
    push(t.planned_end_date);
    push(t.actual_start_date);
    push(t.actual_end_date);
  });
  (phases || []).forEach((ph) => {
    push(ph.target_date);
    push(ph.completed_date);
  });
  push(project?.start_date);
  push(project?.end_date);

  let min = dates.length ? new Date(Math.min(...dates)) : null;
  let max = dates.length ? new Date(Math.max(...dates)) : null;

  if (preset.id !== 'fit' && preset.months) {
    const mid = new Date();
    const from = new Date(mid.getFullYear(), mid.getMonth() - Math.floor(preset.months / 2), 1);
    const to = new Date(mid.getFullYear(), mid.getMonth() + Math.ceil(preset.months / 2), 0);
    return { rangeStart: from, rangeEnd: to };
  }

  if (!min || !max) {
    const now = new Date();
    min = new Date(now.getFullYear(), now.getMonth(), 1);
    max = new Date(now.getFullYear(), now.getMonth() + 4, 0);
  } else {
    min = new Date(min.getFullYear(), min.getMonth(), 1);
    max = new Date(max.getFullYear(), max.getMonth() + 1, 0);
  }
  return { rangeStart: min, rangeEnd: max };
}

function monthLabels(rangeStart, rangeEnd) {
  const labels = [];
  const cur = new Date(rangeStart);
  while (cur <= rangeEnd) {
    labels.push({
      key: cur.toISOString().slice(0, 7),
      label: cur.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
    });
    cur.setMonth(cur.getMonth() + 1);
  }
  return labels;
}

function TaskRow({ task, rangeStart, rangeEnd, todayLeft }) {
  const planned = barPosition(task.planned_start_date, task.planned_end_date, rangeStart, rangeEnd);
  const actual = barPosition(task.actual_start_date, task.actual_end_date, rangeStart, rangeEnd);
  const progress = Math.min(100, Math.max(0, task.progress_percent || 0));
  const status = task.status || 'new';
  const due = deadlineSummary(task.planned_end_date, status === 'done' ? 'completed' : 'active');

  return (
    <div className="project-timeline-row project-timeline-row--task">
      <div className="project-timeline-label-col">
        <div className="project-timeline-row__title">{task.name}</div>
        <div className="project-timeline-row__meta">
          <span className={`project-timeline-status ${TASK_STATUS_CLASS[status] || ''}`}>{status}</span>
          {task.assignee_name && <span>{task.assignee_name}</span>}
          {task.work_package_name && <span className="hide-mobile">{task.work_package_name}</span>}
          {due && <span className={`project-timeline-due project-timeline-due--${due.tone}`}>{due.label}</span>}
        </div>
      </div>
      <div className="project-timeline-chart-col">
        <div className="project-timeline-track" title={`Planned: ${task.planned_start_date || '—'} → ${task.planned_end_date || '—'}`}>
          {todayLeft && <div className="project-timeline-today" style={{ left: todayLeft }} aria-hidden />}
          {planned && (
            <div className="project-timeline-bar project-timeline-bar--planned" style={{ left: planned.left, width: planned.width }}>
              <div className="project-timeline-bar__fill" style={{ width: `${progress}%` }} />
            </div>
          )}
          {actual && (
            <div className="project-timeline-bar project-timeline-bar--actual" style={{ left: actual.left, width: actual.width }} title="Actual dates" />
          )}
        </div>
        <div className="project-timeline-dates hide-mobile">
          <span>{formatProjectDate(task.planned_start_date) || '—'}</span>
          <span>→</span>
          <span>{formatProjectDate(task.planned_end_date) || '—'}</span>
        </div>
      </div>
    </div>
  );
}

function PhaseRow({ phase, rangeStart, rangeEnd, todayLeft }) {
  const start = phase.completed_date || phase.target_date;
  const end = phase.completed_date || phase.target_date;
  const bar = barPosition(start, end, rangeStart, rangeEnd);
  const marker = markerPosition(phase.target_date, rangeStart, rangeEnd);

  return (
    <div className="project-timeline-row project-timeline-row--phase">
      <div className="project-timeline-label-col">
        <div className="project-timeline-row__title">
          <span className="project-timeline-phase-icon" aria-hidden>◆</span>
          {phase.name}
        </div>
        <div className="project-timeline-row__meta">
          <span className="project-timeline-status project-timeline-status--phase">{phaseStatusLabel(phase.status)}</span>
          {phase.payment_status && phase.payment_status !== 'not_applicable' && (
            <span className="project-timeline-payment">{phase.payment_status}</span>
          )}
        </div>
      </div>
      <div className="project-timeline-chart-col">
        <div className="project-timeline-track project-timeline-track--phase">
          {todayLeft && <div className="project-timeline-today" style={{ left: todayLeft }} aria-hidden />}
          {bar && (
            <div className="project-timeline-bar project-timeline-bar--phase" style={{ left: bar.left, width: bar.width }} />
          )}
          {marker && !bar && (
            <div className="project-timeline-milestone" style={{ left: marker }} title={phase.target_date} />
          )}
        </div>
        <div className="project-timeline-dates hide-mobile">
          <span>Target: {formatProjectDate(phase.target_date) || '—'}</span>
          {phase.completed_date && <span> · Done: {formatProjectDate(phase.completed_date)}</span>}
        </div>
      </div>
    </div>
  );
}

export default function ProjectTimelinePanel({
  project,
  tasks = [],
  phases = [],
  workPackages = [],
  workPackageFilter = '',
  onGoToTasks,
}) {
  const [rangeId, setRangeId] = useState('fit');
  const [showTasks, setShowTasks] = useState(true);
  const [showPhases, setShowPhases] = useState(true);
  const [localWpFilter, setLocalWpFilter] = useState(workPackageFilter || '');

  const preset = RANGE_PRESETS.find((p) => p.id === rangeId) || RANGE_PRESETS[0];
  const { rangeStart, rangeEnd } = useMemo(
    () => computeRange(preset, tasks, phases, project),
    [preset, tasks, phases, project],
  );
  const months = useMemo(() => monthLabels(rangeStart, rangeEnd), [rangeStart, rangeEnd]);
  const todayLeft = markerPosition(toDateInput(new Date()), rangeStart, rangeEnd);

  const leafTasks = useMemo(() => {
    let list = (tasks || []).filter((t) => t.task_kind !== 'group');
    const wp = localWpFilter || workPackageFilter;
    if (wp) list = list.filter((t) => String(t.work_package_id) === String(wp));
    return list.sort((a, b) => {
      const da = a.planned_start_date || a.planned_end_date || '';
      const db = b.planned_start_date || b.planned_end_date || '';
      return String(da).localeCompare(String(db));
    });
  }, [tasks, localWpFilter, workPackageFilter]);

  const filteredPhases = useMemo(() => {
    let list = [...(phases || [])];
    const wp = localWpFilter || workPackageFilter;
    if (wp) list = list.filter((p) => String(p.work_package_id) === String(wp));
    return list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }, [phases, localWpFilter, workPackageFilter]);

  const stats = useMemo(() => {
    const today = toDateInput(new Date());
    const withDates = leafTasks.filter((t) => t.planned_start_date || t.planned_end_date).length;
    const overdue = leafTasks.filter((t) => {
      const due = t.planned_end_date;
      return due && due < today && (t.status || 'new') !== 'done';
    }).length;
    const done = leafTasks.filter((t) => (t.status || '') === 'done').length;
    return { withDates, overdue, done, phases: filteredPhases.length };
  }, [leafTasks, filteredPhases]);

  const projectBar = barPosition(project?.start_date, project?.end_date, rangeStart, rangeEnd);
  const hasContent = (showTasks && leafTasks.length > 0) || (showPhases && filteredPhases.length > 0);

  const groupedTasks = useMemo(() => {
    if (!workPackages.length) return [{ key: 'all', title: null, tasks: leafTasks }];
    const groups = workPackages.map((wp) => ({
      key: String(wp.id),
      title: wp.name,
      subtitle: deliveryScopeLabel(wp.classification),
      tasks: leafTasks.filter((t) => t.work_package_id === wp.id),
    })).filter((g) => g.tasks.length > 0);
    const unassigned = leafTasks.filter((t) => !t.work_package_id);
    if (unassigned.length) {
      groups.push({ key: 'unassigned', title: 'Unassigned tasks', subtitle: null, tasks: unassigned });
    }
    return groups.length ? groups : [{ key: 'all', title: null, tasks: leafTasks }];
  }, [leafTasks, workPackages]);

  return (
    <div className="project-timeline-panel">
      <div className="section-card__header section-card__header--compact">
        <div>
          <h2 className="section-card__title">Project timeline</h2>
          <p className="section-card__desc">
            Planned vs actual tasks, delivery phases, and project window — {formatProjectDate(project?.start_date) || '—'} to {formatProjectDate(project?.end_date) || 'Open'}.
          </p>
        </div>
        <div className="project-timeline-header-actions">
          <Link to="/gantt" className="btn btn-secondary btn-sm">Portfolio Gantt</Link>
          {onGoToTasks && (
            <button type="button" className="btn btn-primary btn-sm" onClick={onGoToTasks}>Manage tasks</button>
          )}
        </div>
      </div>

      <section className="dashboard-stats helpdesk-kpis project-timeline-kpis" aria-label="Timeline summary">
        <div className="dashboard-stat-card">
          <span className="dashboard-stat-label">Scheduled tasks</span>
          <span className="dashboard-stat-value">{stats.withDates}</span>
          <span className="dashboard-stat-hint">{leafTasks.length} total</span>
        </div>
        <div className={`dashboard-stat-card ${stats.overdue ? 'has-issue' : ''}`}>
          <span className="dashboard-stat-label">Overdue</span>
          <span className={`dashboard-stat-value ${stats.overdue ? 'pmo-stat-danger' : ''}`}>{stats.overdue}</span>
        </div>
        <div className="dashboard-stat-card">
          <span className="dashboard-stat-label">Completed</span>
          <span className="dashboard-stat-value pmo-stat-success">{stats.done}</span>
        </div>
        <div className="dashboard-stat-card">
          <span className="dashboard-stat-label">Delivery phases</span>
          <span className="dashboard-stat-value">{stats.phases}</span>
        </div>
      </section>

      <div className="module-toolbar project-timeline-toolbar">
        <div className="module-toolbar__field">
          <span className="module-toolbar__label">Range</span>
          <div className="chip-group">
            {RANGE_PRESETS.map((p) => (
              <button key={p.id} type="button" className={`chip-filter ${rangeId === p.id ? 'active' : ''}`} onClick={() => setRangeId(p.id)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="module-toolbar__field">
          <span className="module-toolbar__label">Show</span>
          <div className="chip-group">
            <button type="button" className={`chip-filter ${showTasks ? 'active' : ''}`} onClick={() => setShowTasks((v) => !v)}>Tasks</button>
            <button type="button" className={`chip-filter ${showPhases ? 'active' : ''}`} onClick={() => setShowPhases((v) => !v)}>Phases</button>
          </div>
        </div>
        {workPackages.length > 0 && (
          <div className="module-toolbar__field">
            <span className="module-toolbar__label">Package</span>
            <select className="ui-input project-timeline-wp-select" value={localWpFilter} onChange={(e) => setLocalWpFilter(e.target.value)}>
              <option value="">All packages</option>
              {workPackages.map((wp) => (
                <option key={wp.id} value={wp.id}>{wp.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="project-timeline-legend" aria-hidden>
        <span><i className="project-timeline-legend-swatch project-timeline-legend-swatch--planned" /> Planned</span>
        <span><i className="project-timeline-legend-swatch project-timeline-legend-swatch--actual" /> Actual</span>
        <span><i className="project-timeline-legend-swatch project-timeline-legend-swatch--phase" /> Phase</span>
        <span><i className="project-timeline-legend-swatch project-timeline-legend-swatch--today" /> Today</span>
        {projectBar && <span><i className="project-timeline-legend-swatch project-timeline-legend-swatch--project" /> Project window</span>}
      </div>

      {!hasContent ? (
        <UiEmptyState
          title="No timeline data yet"
          description="Add planned dates on tasks or initialize delivery phases to see the schedule."
          action={onGoToTasks ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={onGoToTasks}>Go to tasks</button>
          ) : null}
        />
      ) : (
        <div className="project-timeline-chart-wrap">
          <div className="project-timeline-chart-header">
            <div className="project-timeline-label-col project-timeline-label-col--head">Item</div>
            <div className="project-timeline-chart-col">
              <div className="project-timeline-months">
                {months.map((m) => (
                  <span key={m.key}>{m.label}</span>
                ))}
              </div>
            </div>
          </div>

          {projectBar && project?.start_date && (
            <div className="project-timeline-row project-timeline-row--project">
              <div className="project-timeline-label-col">
                <div className="project-timeline-row__title">Project window</div>
                <div className="project-timeline-row__meta">
                  <span>{project.status}</span>
                </div>
              </div>
              <div className="project-timeline-chart-col">
                <div className="project-timeline-track project-timeline-track--project">
                  {todayLeft && <div className="project-timeline-today" style={{ left: todayLeft }} aria-hidden />}
                  <div className="project-timeline-bar project-timeline-bar--project" style={{ left: projectBar.left, width: projectBar.width }} />
                </div>
              </div>
            </div>
          )}

          {showPhases && filteredPhases.length > 0 && (
            <section className="project-timeline-group">
              <header className="project-timeline-group__head">Delivery phases</header>
              {filteredPhases.map((ph) => (
                <PhaseRow key={ph.id} phase={ph} rangeStart={rangeStart} rangeEnd={rangeEnd} todayLeft={todayLeft} />
              ))}
            </section>
          )}

          {showTasks && leafTasks.length > 0 && (
            <section className="project-timeline-group">
              <header className="project-timeline-group__head">Tasks</header>
              {groupedTasks.map((group) => (
                <div key={group.key} className="project-timeline-subgroup">
                  {group.title && (
                    <div className="project-timeline-subgroup__head">
                      <strong>{group.title}</strong>
                      {group.subtitle && <span>{group.subtitle}</span>}
                    </div>
                  )}
                  {group.tasks.map((t) => (
                    <TaskRow key={t.id} task={t} rangeStart={rangeStart} rangeEnd={rangeEnd} todayLeft={todayLeft} />
                  ))}
                </div>
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
