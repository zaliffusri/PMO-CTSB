import { useMemo, useState } from 'react';
import ChartCard from './charts/ChartCard';
import DonutChart from './charts/DonutChart';
import HBarChart from './charts/HBarChart';
import GaugeChart from './charts/GaugeChart';
import VBarChart from './charts/VBarChart';
import {
  chartHealthData,
  chartStatusData,
  chartProgressData,
  chartEngagementTypeData,
  chartOverdueByProject,
  chartTaskVolumeByProject,
} from '../../lib/pmoMetrics.js';
import { engagementTypeLabel } from '../../lib/projectConstants.js';

export default function ProjectsPortfolioCharts({
  enriched,
  summary,
  onDrillDown,
  activeHealth,
  activeStatus,
  activeEngagement,
  spotlightProjectId,
}) {
  const [chartFocus, setChartFocus] = useState(null);

  const healthChart = useMemo(() => chartHealthData(enriched), [enriched]);
  const statusChart = useMemo(() => chartStatusData(enriched), [enriched]);
  const progressChart = useMemo(() => chartProgressData(enriched, 8), [enriched]);
  const engagementChart = useMemo(
    () => chartEngagementTypeData(enriched, engagementTypeLabel),
    [enriched],
  );
  const overdueChart = useMemo(() => chartOverdueByProject(enriched, 6), [enriched]);
  const taskVolumeChart = useMemo(() => chartTaskVolumeByProject(enriched, 6), [enriched]);

  const healthTotal = healthChart.reduce((s, d) => s + d.value, 0);

  const apply = (focus, payload) => {
    setChartFocus(focus);
    onDrillDown?.(payload);
  };

  const clear = () => {
    setChartFocus(null);
    onDrillDown?.({ clear: true });
  };

  const hasFilter = chartFocus
    || activeHealth !== 'all'
    || activeStatus !== 'active'
    || activeEngagement
    || spotlightProjectId;

  return (
    <section className="projects-charts-section" aria-label="Portfolio analytics">
      {hasFilter && (
        <div className="project-charts-filter-bar">
          <span>
            Portfolio filter:
            {activeHealth !== 'all' && <> health <strong>{activeHealth.replace(/_/g, ' ')}</strong></>}
            {activeStatus !== 'active' && <> status <strong>{activeStatus}</strong></>}
            {activeEngagement && <> engagement <strong>{engagementTypeLabel(activeEngagement)}</strong></>}
            {spotlightProjectId && <> project <strong>#{spotlightProjectId}</strong></>}
            {chartFocus?.label && !spotlightProjectId && <> <strong>{chartFocus.label}</strong></>}
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={clear}>
            Clear filters
          </button>
        </div>
      )}

      <div className="projects-charts-grid">
        <ChartCard title="Portfolio completion" subtitle="Average across active projects">
          <div className="chart-gauge-wrap">
            <GaugeChart value={summary.avgCompletion} label="Active avg" />
          </div>
        </ChartCard>

        <ChartCard title="Delivery health" subtitle="Active projects · click to filter">
          <DonutChart
            data={healthChart.length ? healthChart : [{ key: 'empty', label: 'None', value: 1, color: 'var(--border)' }]}
            centerValue={healthTotal}
            centerLabel="active"
            interactive={healthChart.length > 0}
            activeKey={activeHealth !== 'all' ? activeHealth : null}
            onSegmentClick={(seg) => apply({ type: 'health', label: seg.label }, { health: seg.key, status: 'active' })}
          />
        </ChartCard>

        <ChartCard title="Project status" subtitle="Entire portfolio mix">
          <DonutChart
            data={statusChart.length ? statusChart : [{ key: 'empty', label: 'None', value: 1, color: 'var(--border)' }]}
            centerValue={enriched.length}
            centerLabel="total"
            interactive={statusChart.length > 0}
            activeKey={activeStatus !== 'active' && activeStatus !== 'all' ? activeStatus : activeStatus === 'all' ? 'all' : null}
            onSegmentClick={(seg) => {
              const status = seg.key === 'active' ? 'active' : seg.key;
              apply({ type: 'status', label: seg.label }, { status: status === 'active' ? 'active' : status, health: 'all' });
            }}
          />
        </ChartCard>

        <ChartCard title="Top progress" subtitle="Leading active projects · click to spotlight" className="projects-charts-grid__wide">
          <HBarChart
            data={progressChart}
            max={100}
            interactive={progressChart.length > 0}
            activeKey={spotlightProjectId ? String(spotlightProjectId) : null}
            onBarClick={(bar) => apply({ type: 'project', label: bar.label }, { projectId: bar.key })}
          />
        </ChartCard>

        {engagementChart.length > 0 && (
          <ChartCard title="Engagement type" subtitle="Contract, LO, PO… · click to filter">
            <DonutChart
              data={engagementChart}
              centerValue={engagementChart.reduce((s, d) => s + d.value, 0)}
              centerLabel="projects"
              interactive
              activeKey={activeEngagement || (chartFocus?.type === 'engagement' ? chartFocus.key : null)}
              onSegmentClick={(seg) => apply(
                { type: 'engagement', key: seg.key, label: seg.label },
                { engagementType: seg.key, status: 'all' },
              )}
            />
          </ChartCard>
        )}

        {overdueChart.length > 0 && (
          <ChartCard title="Overdue tasks" subtitle="By project · click to open list">
            <HBarChart
              data={overdueChart}
              max={Math.max(...overdueChart.map((d) => d.value), 1)}
              unit=""
              interactive
              activeKey={spotlightProjectId ? String(spotlightProjectId) : null}
              onBarClick={(bar) => apply({ type: 'project', label: bar.label }, { projectId: bar.key, health: 'at_risk' })}
            />
          </ChartCard>
        )}

        {taskVolumeChart.length > 0 && (
          <ChartCard title="Task volume" subtitle="Open tasks per active project">
            <VBarChart
              data={taskVolumeChart}
              unit=""
              interactive
              activeKey={spotlightProjectId ? String(spotlightProjectId) : null}
              onBarClick={(bar) => apply({ type: 'project', label: bar.label }, { projectId: bar.key })}
            />
          </ChartCard>
        )}
      </div>

      <p className="projects-charts-hint">
        Hover chart segments for details. Click to filter the project list or spotlight a project below.
      </p>
    </section>
  );
}
