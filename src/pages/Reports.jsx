import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { enrichProjectsWithHealth, healthLabel, chartHealthData, chartStatusData, chartProgressData, chartCapacityData } from '../../lib/pmoMetrics.js';
import PageHeader from '../components/PageHeader';
import PageLoadingState from '../components/PageLoadingState';
import { engagementTypeLabel, deliveryScopeLabel } from '../../lib/projectConstants.js';
import HBarChart from '../components/charts/HBarChart';

import { downloadCsv } from '../utils/downloadCsv';

export default function Reports() {
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [workload, setWorkload] = useState([]);
  const [issues, setIssues] = useState([]);
  const [phases, setPhases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activePreview, setActivePreview] = useState(null);
  const [from] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });

  useEffect(() => {
    const loadTo = new Date();
    loadTo.setDate(loadTo.getDate() + 14);
    Promise.all([
      api.projects.list(),
      api.projectTasks.list(),
      api.availability.workload(from, loadTo.toISOString().slice(0, 10)),
      api.issues.list(),
      api.projectPhases.list(),
    ])
      .then(([pr, tk, wl, iss, ph]) => {
        setProjects(pr);
        setTasks(tk);
        setWorkload(wl?.workload || []);
        setIssues(iss);
        setPhases(ph);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [from]);

  const enriched = useMemo(() => enrichProjectsWithHealth(projects, tasks), [projects, tasks]);
  const healthChart = useMemo(() => chartHealthData(enriched), [enriched]);
  const statusChart = useMemo(() => chartStatusData(projects), [projects]);
  const progressChart = useMemo(() => chartProgressData(enriched, 8), [enriched]);
  const resourceChart = useMemo(() => chartCapacityData(workload, 8), [workload]);

  const exportProjectStatus = () => {
    const header = ['Project', 'Status', 'Health', 'Client', 'Engagement', 'Delivery scope', 'Progress %', 'Start', 'End', 'Team size'];
    const rows = enriched.map((p) => [
      p.name,
      p.status,
      healthLabel(p.health),
      p.client_name || '',
      engagementTypeLabel(p.engagement_type) || '',
      deliveryScopeLabel(p.classification) || '',
      p.progress || 0,
      p.start_date || '',
      p.end_date || '',
      p.member_count || 0,
    ]);
    downloadCsv(`pmo-project-status-${from}.csv`, [header, ...rows]);
  };

  const exportResourceUtilization = () => {
    const header = ['Name', 'Role', 'Allocation %', 'Available %', 'Projects', 'Activities (period)', 'Overloaded'];
    const rows = workload.map((w) => [
      w.name,
      w.role || '',
      w.totalAllocation,
      w.availability,
      w.projectCount,
      w.activities?.length ?? 0,
      w.isOverloaded ? 'Yes' : 'No',
    ]);
    downloadCsv(`pmo-resource-utilization-${from}.csv`, [header, ...rows]);
  };

  const exportHelpdesk = () => {
    const header = ['Ticket', 'Title', 'Status', 'Priority', 'Category', 'Project', 'Client', 'Assignee', 'Created', 'Updated'];
    const rows = issues.map((i) => [
      i.ticket_no,
      i.title,
      i.status,
      i.priority,
      i.category,
      i.project_name || '',
      i.client_name || '',
      i.assignee_name || '',
      i.created_at || '',
      i.updated_at || '',
    ]);
    downloadCsv(`pmo-helpdesk-${from}.csv`, [header, ...rows]);
  };

  const openIssues = issues.filter((i) => !['closed', 'resolved'].includes(i.status)).length;

  const exportPhases = () => {
    const header = ['Project', 'Phase', 'Status', 'Progress %', 'Payment status', 'Amount', 'Invoice', 'Target', 'Completed'];
    const rows = phases.map((p) => [
      p.project_name || '',
      p.name,
      p.status,
      p.progress_percent || 0,
      p.payment_status,
      p.payment_amount || '',
      p.invoice_no || '',
      p.target_date || '',
      p.completed_date || '',
    ]);
    downloadCsv(`pmo-delivery-phases-${from}.csv`, [header, ...rows]);
  };

  const togglePreview = (id) => {
    setActivePreview((prev) => (prev === id ? null : id));
  };

  if (loading) return <PageLoadingState message="Loading reports…" />;

  return (
    <div className="page-module reports-page">
      <PageHeader
        eyebrow="Management"
        title="Reports"
        subtitle="Portfolio health, team capacity, helpdesk, and delivery reports for management."
      />

      <div className="pmo-reports-grid">
        <section className={`ui-card pmo-report-card ${activePreview === 'projects' ? 'pmo-report-card--active' : ''}`}>
          <div className="pmo-report-card__icon" aria-hidden>📊</div>
          <h2 className="pmo-report-card__title">Project status report</h2>
          <p className="pmo-report-card__desc">
            Portfolio snapshot with health, progress, clients, and dates.
          </p>
          <div className="pmo-report-card__actions">
            <button type="button" className="btn btn-primary" onClick={exportProjectStatus}>
              Download CSV
            </button>
            <button
              type="button"
              className={`btn btn-secondary ${activePreview === 'projects' ? 'active' : ''}`}
              onClick={() => togglePreview('projects')}
            >
              {activePreview === 'projects' ? 'Hide preview' : 'Preview'}
            </button>
          </div>
        </section>

        <section className={`ui-card pmo-report-card ${activePreview === 'resources' ? 'pmo-report-card--active' : ''}`}>
          <div className="pmo-report-card__icon" aria-hidden>👥</div>
          <h2 className="pmo-report-card__title">Resource utilization</h2>
          <p className="pmo-report-card__desc">
            Team allocation %, availability, and overload flags.
          </p>
          <div className="pmo-report-card__actions">
            <button type="button" className="btn btn-primary" onClick={exportResourceUtilization}>
              Download CSV
            </button>
            <button
              type="button"
              className={`btn btn-secondary ${activePreview === 'resources' ? 'active' : ''}`}
              onClick={() => togglePreview('resources')}
            >
              {activePreview === 'resources' ? 'Hide preview' : 'Preview'}
            </button>
          </div>
        </section>

        <section className="ui-card pmo-report-card">
          <div className="pmo-report-card__icon" aria-hidden>🎫</div>
          <h2 className="pmo-report-card__title">Helpdesk & issues</h2>
          <p className="pmo-report-card__desc">
            Project issues ({openIssues} open) — ticket, priority, assignee, status.
          </p>
          <div className="pmo-report-card__actions">
            <button type="button" className="btn btn-primary" onClick={exportHelpdesk}>
              Download CSV
            </button>
            <Link to="/helpdesk" className="btn btn-secondary">Open helpdesk</Link>
          </div>
        </section>

        <section className="ui-card pmo-report-card">
          <div className="pmo-report-card__icon" aria-hidden>🚦</div>
          <h2 className="pmo-report-card__title">Delivery & project phases</h2>
          <p className="pmo-report-card__desc">
            Current delivery phase, milestone progress, and payment status ({phases.length} phases).
          </p>
          <div className="pmo-report-card__actions">
            <button type="button" className="btn btn-primary" onClick={exportPhases} disabled={!phases.length}>
              Download CSV
            </button>
            <Link to="/finance" className="btn btn-secondary">Finance view</Link>
          </div>
        </section>

        <section className="ui-card pmo-report-card">
          <div className="pmo-report-card__icon" aria-hidden>📅</div>
          <h2 className="pmo-report-card__title">Activity report</h2>
          <p className="pmo-report-card__desc">
            Monthly staff activity export (date, client, title, location).
          </p>
          <div className="pmo-report-card__actions">
            <Link to="/calendar" className="btn btn-secondary">
              Open calendar →
            </Link>
          </div>
        </section>
      </div>

      {activePreview === 'projects' && (
        <section className="ui-card reports-preview">
          <h2 className="reports-preview__title">Preview — project status</h2>
          <div className="reports-preview-charts">
            <div className="reports-preview-chart">
              <h3>Health mix</h3>
              <DonutChart data={healthChart} centerValue={healthChart.reduce((s, d) => s + d.value, 0)} centerLabel="active" />
            </div>
            <div className="reports-preview-chart">
              <h3>Status mix</h3>
              <DonutChart data={statusChart} centerValue={projects.length} centerLabel="total" />
            </div>
            <div className="reports-preview-chart reports-preview-chart--wide">
              <h3>Progress by project</h3>
              <HBarChart data={progressChart} max={100} />
            </div>
          </div>
          <div className="table-wrap pmo-data-list-wrap pmo-data-list-wrap--sticky pmo-data-list-wrap--comfortable">
            <table className="pmo-data-list pmo-portfolio-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Health</th>
                  <th>Progress</th>
                  <th className="hide-mobile">Client</th>
                </tr>
              </thead>
              <tbody>
                {enriched.slice(0, 10).map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>
                      <span className={`pmo-health-badge pmo-health-${p.health}`}>{healthLabel(p.health)}</span>
                    </td>
                    <td>{p.progress || 0}%</td>
                    <td className="hide-mobile">{p.client_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activePreview === 'resources' && (
        <section className="ui-card reports-preview">
          <h2 className="reports-preview__title">Preview — resource utilization</h2>
          <div className="reports-preview-charts reports-preview-charts--single">
            <div className="reports-preview-chart reports-preview-chart--wide">
              <h3>Allocation by person</h3>
              <HBarChart data={resourceChart} max={100} />
            </div>
          </div>
          <div className="table-wrap pmo-data-list-wrap pmo-data-list-wrap--sticky pmo-data-list-wrap--comfortable">
            <table className="pmo-data-list pmo-portfolio-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Allocation</th>
                  <th>Available</th>
                  <th className="hide-mobile">Projects</th>
                  <th>Overloaded</th>
                </tr>
              </thead>
              <tbody>
                {workload.slice(0, 10).map((w) => (
                  <tr key={w.id}>
                    <td>{w.name}</td>
                    <td>{w.totalAllocation}%</td>
                    <td>{w.availability}%</td>
                    <td className="hide-mobile">{w.projectCount ?? 0}</td>
                    <td>{w.isOverloaded ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
