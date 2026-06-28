import { useMemo, useState } from 'react';
import ChartCard from './charts/ChartCard';
import DonutChart from './charts/DonutChart';
import HBarChart from './charts/HBarChart';
import VBarChart from './charts/VBarChart';
import GaugeChart from './charts/GaugeChart';
import {
  chartProjectTaskStatus,
  chartProjectAssigneeLoad,
  chartProjectWorkPackages,
  chartProjectPhases,
  chartProjectBacklog,
  chartProjectVelocity,
  chartProjectHealthBreakdown,
} from '../../lib/projectCharts.js';

export default function ProjectOverviewCharts({
  tasks,
  workPackages,
  phases,
  backlogItems,
  progress,
  health,
  onDrillDown,
}) {
  const [activeChart, setActiveChart] = useState(null);

  const taskStatus = useMemo(() => chartProjectTaskStatus(tasks), [tasks]);
  const healthBreakdown = useMemo(() => chartProjectHealthBreakdown(tasks), [tasks]);
  const assigneeLoad = useMemo(() => chartProjectAssigneeLoad(tasks), [tasks]);
  const packageProgress = useMemo(
    () => chartProjectWorkPackages(tasks, workPackages),
    [tasks, workPackages],
  );
  const phaseChart = useMemo(() => chartProjectPhases(phases), [phases]);
  const backlogChart = useMemo(() => chartProjectBacklog(backlogItems), [backlogItems]);
  const velocity = useMemo(() => chartProjectVelocity(tasks), [tasks]);

  const taskTotal = taskStatus.reduce((s, d) => s + d.value, 0);

  const handleTaskStatusClick = (seg) => {
    setActiveChart({ type: 'taskStatus', key: seg.key, label: seg.label });
    onDrillDown?.({ tab: 'tasks', taskStatus: seg.key });
  };

  const handlePackageClick = (bar) => {
    setActiveChart({ type: 'package', key: bar.key, label: bar.label });
    onDrillDown?.({ tab: 'tasks', packageId: bar.key });
  };

  const handleHealthClick = (seg) => {
    setActiveChart({ type: 'health', key: seg.key, label: seg.label });
    onDrillDown?.({ tab: 'tasks', healthKey: seg.key });
  };

  const handlePhaseClick = (seg) => {
    setActiveChart({ type: 'phase', key: seg.key, label: seg.label });
    onDrillDown?.({ tab: 'delivery', phaseStatus: seg.key });
  };

  const handleBacklogClick = (seg) => {
    setActiveChart({ type: 'backlog', key: seg.key, label: seg.label });
    onDrillDown?.({ tab: 'backlog', backlogStatus: seg.key });
  };

  const clearFilter = () => {
    setActiveChart(null);
    onDrillDown?.({ clear: true });
  };

  return (
    <section className="project-charts-section" aria-label="Project analytics">
      {activeChart && (
        <div className="project-charts-filter-bar">
          <span>
            Filtered: <strong>{activeChart.label}</strong>
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={clearFilter}>
            Clear filter
          </button>
        </div>
      )}

      <div className="project-charts-grid">
        <ChartCard title="Completion" subtitle="Average task progress" className="project-charts-grid__gauge">
          <div className="chart-gauge-wrap">
            <GaugeChart value={progress} label="Project" />
          </div>
        </ChartCard>

        <ChartCard title="Task status" subtitle="Click a segment to filter tasks">
          <DonutChart
            data={taskStatus.length ? taskStatus : [{ key: 'empty', label: 'No tasks', value: 1, color: 'var(--border)' }]}
            centerValue={taskTotal}
            centerLabel="tasks"
            interactive={taskStatus.length > 0}
            activeKey={activeChart?.type === 'taskStatus' ? activeChart.key : null}
            onSegmentClick={handleTaskStatusClick}
          />
        </ChartCard>

        <ChartCard title="Task health" subtitle="On track vs at risk · click to filter">
          <DonutChart
            data={healthBreakdown.length ? healthBreakdown : [{ key: 'empty', label: 'No tasks', value: 1, color: 'var(--border)' }]}
            centerValue={healthBreakdown.reduce((s, d) => s + d.value, 0) || 0}
            centerLabel="open"
            interactive={healthBreakdown.length > 0}
            activeKey={activeChart?.type === 'health' ? activeChart.key : null}
            onSegmentClick={handleHealthClick}
          />
        </ChartCard>

        {packageProgress.length > 0 && (
          <ChartCard title="Work packages" subtitle="Avg progress · click to focus package" className="project-charts-grid__wide">
            <HBarChart
              data={packageProgress}
              max={100}
              interactive
              activeKey={activeChart?.type === 'package' ? activeChart.key : null}
              onBarClick={handlePackageClick}
            />
          </ChartCard>
        )}

        <ChartCard title="Team workload" subtitle="Tasks per assignee · click to view tasks">
          <HBarChart
            data={assigneeLoad.map((r) => ({ ...r, value: r.value, unit: '' }))}
            max={Math.max(...assigneeLoad.map((r) => r.value), 1)}
            unit=""
            showValues
            interactive={assigneeLoad.length > 0}
            onBarClick={(bar) => onDrillDown?.({ tab: 'tasks', assigneeKey: bar.key, assigneeLabel: bar.label })}
          />
        </ChartCard>

        <ChartCard title="Done per week" subtitle="Tasks completed (last 6 weeks)">
          <VBarChart data={velocity} unit="" interactive />
        </ChartCard>

        {phaseChart.length > 0 && (
          <ChartCard title="Delivery phases" subtitle="Click to open delivery tab">
            <DonutChart
              data={phaseChart}
              centerValue={phases.length}
              centerLabel="phases"
              interactive
              activeKey={activeChart?.type === 'phase' ? activeChart.key : null}
              onSegmentClick={handlePhaseClick}
            />
          </ChartCard>
        )}

        {backlogChart.length > 0 && (
          <ChartCard title="Backlog" subtitle="Scope items by status">
            <DonutChart
              data={backlogChart}
              centerValue={backlogItems.length}
              centerLabel="items"
              interactive
              activeKey={activeChart?.type === 'backlog' ? activeChart.key : null}
              onSegmentClick={handleBacklogClick}
            />
          </ChartCard>
        )}
      </div>

      <p className="project-charts-hint">
        Hover chart segments for details. Click to drill down into Tasks, Delivery, or Backlog.
        Health: <span className={`pmo-health-badge pmo-health-${health}`}>{health === 'at_risk' ? 'At risk' : health === 'blocked' ? 'Blocked' : 'On track'}</span>
      </p>
    </section>
  );
}
