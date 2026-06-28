import { useMemo } from 'react';
import { formatProjectDate } from '../../lib/pmoMetrics.js';

function parseDate(str) {
  if (!str) return null;
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : d;
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
  return { left: `${left.toFixed(2)}%`, width: `${width.toFixed(2)}%` };
}

export default function ProjectMiniTimeline({ tasks, projectName, compact = false, maxRows = 5 }) {
  const { rows, monthLabels, rangeStart, rangeEnd } = useMemo(() => {
    const leaf = (tasks || []).filter((t) => t.task_kind !== 'group');
    let min = null;
    let max = null;
    leaf.forEach((t) => {
      [t.planned_start_date, t.planned_end_date, t.actual_start_date, t.actual_end_date].forEach((d) => {
        const parsed = parseDate(d);
        if (!parsed) return;
        if (!min || parsed < min) min = parsed;
        if (!max || parsed > max) max = parsed;
      });
    });
    if (!min || !max) {
      const now = new Date();
      min = new Date(now.getFullYear(), now.getMonth(), 1);
      max = new Date(now.getFullYear(), now.getMonth() + 3, 0);
    } else {
      min = new Date(min.getFullYear(), min.getMonth(), 1);
      max = new Date(max.getFullYear(), max.getMonth() + 1, 0);
    }
    const labels = [];
    const cur = new Date(min);
    while (cur <= max) {
      labels.push({
        label: cur.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      });
      cur.setMonth(cur.getMonth() + 1);
    }
    const sorted = [...leaf].sort((a, b) =>
      String(a.planned_start_date || '').localeCompare(String(b.planned_start_date || '')),
    );
    return {
      rows: compact ? sorted.slice(0, maxRows) : sorted,
      monthLabels: labels,
      rangeStart: min,
      rangeEnd: max,
      total: leaf.length,
    };
  }, [tasks, compact, maxRows]);

  if (!rows.length) {
    return (
      <p className="project-overview-empty">No tasks with dates yet. Add planned dates in the Tasks tab.</p>
    );
  }

  const todayLeft = barPosition(
    new Date().toISOString().slice(0, 10),
    new Date().toISOString().slice(0, 10),
    rangeStart,
    rangeEnd,
  );

  return (
    <div className={`pmo-mini-timeline ${compact ? 'pmo-mini-timeline--compact' : ''}`}>
      {!compact && (
        <p className="pmo-table-muted project-timeline-intro">
          Timeline for <strong>{projectName}</strong> — planned (blue) vs actual (green).
        </p>
      )}
      <div className="pmo-mini-timeline-header">
        <div className="pmo-mini-timeline-label-col">Task</div>
        <div className="pmo-mini-timeline-chart-col">
          <div className="pmo-mini-timeline-months">
            {monthLabels.map((m, i) => (
              <span key={i}>{m.label}</span>
            ))}
          </div>
        </div>
      </div>
      {rows.map((t) => {
        const planned = barPosition(t.planned_start_date, t.planned_end_date, rangeStart, rangeEnd);
        const actual = barPosition(t.actual_start_date, t.actual_end_date, rangeStart, rangeEnd);
        const progress = Math.min(100, Math.max(0, t.progress_percent || 0));
        return (
          <div key={t.id} className="pmo-mini-timeline-row">
            <div className="pmo-mini-timeline-label-col">
              <div className="pmo-link-strong pmo-mini-timeline-name">{t.name}</div>
              <div className="pmo-table-muted">
                {t.assignee_name || 'Unassigned'} · {t.status || 'new'}
                {!compact && t.planned_end_date && (
                  <> · due {formatProjectDate(t.planned_end_date)}</>
                )}
              </div>
            </div>
            <div className="pmo-mini-timeline-chart-col">
              <div className="pmo-mini-timeline-track">
                {todayLeft && <div className="pmo-mini-timeline-today" style={{ left: todayLeft.left }} />}
                {planned && (
                  <div className="pmo-mini-timeline-bar planned" style={{ left: planned.left, width: planned.width }} title="Planned">
                    <div className="pmo-mini-timeline-bar__progress" style={{ width: `${progress}%` }} />
                  </div>
                )}
                {actual && (
                  <div className="pmo-mini-timeline-bar actual" style={{ left: actual.left, width: actual.width }} title="Actual" />
                )}
              </div>
            </div>
          </div>
        );
      })}
      {compact && rows.length < (tasks || []).filter((t) => t.task_kind !== 'group').length && (
        <p className="pmo-table-muted project-timeline-more-hint">
          Showing {rows.length} of {(tasks || []).filter((t) => t.task_kind !== 'group').length} tasks — open Timeline tab for full view.
        </p>
      )}
    </div>
  );
}
