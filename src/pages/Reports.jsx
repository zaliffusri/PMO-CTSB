import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { enrichProjectsWithHealth, healthLabel } from '../../lib/pmoMetrics.js';
import PageHeader from '../components/PageHeader';
import PageLoadingState from '../components/PageLoadingState';
import { engagementTypeLabel, deliveryScopeLabel } from '../../lib/projectConstants.js';
import { downloadCsv } from '../utils/downloadCsv';
import { earnedValueFromTasks } from '../../lib/earnedValue.js';
import { useLocale } from '../context/LocaleContext';

export default function Reports() {
  const { t } = useLocale();
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
    const header = ['Name', 'Role', 'Projects', 'Activities (period)'];
    const rows = workload.map((w) => [
      w.name,
      w.role || '',
      w.projectCount,
      w.activities?.length ?? 0,
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

  const ev = useMemo(() => earnedValueFromTasks(tasks), [tasks]);
  const programGroups = useMemo(() => {
    const map = new Map();
    for (const p of projects) {
      const key = p.program_name || t('reports.unassignedProgram');
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [projects, t]);

  const exportPhases = () => {
    const header = ['Project', 'Milestone', 'Status', 'Progress %', 'Payment status', 'Amount', 'Invoice', 'Target', 'Completed'];
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

  if (loading) return <PageLoadingState message={t('reports.loading')} />;

  return (
    <div className="page-module reports-page">
      <PageHeader
        eyebrow={t('eyebrow.management')}
        title={t('page.reports')}
      />

      <div className="pmo-reports-grid">
        <section className={`ui-card pmo-report-card ${activePreview === 'projects' ? 'pmo-report-card--active' : ''}`}>
          <div className="pmo-report-card__icon" aria-hidden>📊</div>
          <h2 className="pmo-report-card__title">{t('reports.projectStatus')}</h2>
          <div className="pmo-report-card__actions">
            <button type="button" className="btn btn-primary" onClick={exportProjectStatus}>
              {t('action.downloadCsv')}
            </button>
            <button
              type="button"
              className={`btn btn-secondary ${activePreview === 'projects' ? 'active' : ''}`}
              onClick={() => togglePreview('projects')}
            >
              {activePreview === 'projects' ? t('action.hidePreview') : t('action.preview')}
            </button>
          </div>
        </section>

        <section className={`ui-card pmo-report-card ${activePreview === 'resources' ? 'pmo-report-card--active' : ''}`}>
          <div className="pmo-report-card__icon" aria-hidden>👥</div>
          <h2 className="pmo-report-card__title">{t('reports.workload')}</h2>
          <div className="pmo-report-card__actions">
            <button type="button" className="btn btn-primary" onClick={exportResourceUtilization}>
              {t('action.downloadCsv')}
            </button>
            <button
              type="button"
              className={`btn btn-secondary ${activePreview === 'resources' ? 'active' : ''}`}
              onClick={() => togglePreview('resources')}
            >
              {activePreview === 'resources' ? t('action.hidePreview') : t('action.preview')}
            </button>
          </div>
        </section>

        <section className="ui-card pmo-report-card">
          <div className="pmo-report-card__icon" aria-hidden>🎫</div>
          <h2 className="pmo-report-card__title">{t('reports.helpdesk')}</h2>
          <div className="pmo-report-card__actions">
            <button type="button" className="btn btn-primary" onClick={exportHelpdesk}>
              {t('action.downloadCsv')}
            </button>
            <Link to="/helpdesk" className="btn btn-secondary">{t('reports.openHelpdesk')}</Link>
          </div>
        </section>

        <section className="ui-card pmo-report-card">
          <div className="pmo-report-card__icon" aria-hidden>🚦</div>
          <h2 className="pmo-report-card__title">{t('reports.phases')}</h2>
          <div className="pmo-report-card__actions">
            <button type="button" className="btn btn-primary" onClick={exportPhases} disabled={!phases.length}>
              {t('action.downloadCsv')}
            </button>
            <Link to="/finance" className="btn btn-secondary">{t('reports.financeView')}</Link>
          </div>
        </section>

        <section className="ui-card pmo-report-card">
          <div className="pmo-report-card__icon" aria-hidden>📐</div>
          <h2 className="pmo-report-card__title">{t('reports.earnedValue')}</h2>
          <p className="pmo-data-list__meta">
            PV {ev.planned_value_hours}h · EV {ev.earned_value_hours}h · AC {ev.actual_cost_hours}h
            {ev.cpi != null ? ` · CPI ${ev.cpi}` : ''}
            {ev.spi != null ? ` · SPI ${ev.spi}` : ''}
          </p>
        </section>
      </div>

      {programGroups.length > 0 && (
        <section className="ui-card reports-preview">
          <h2 className="reports-preview__title">{t('reports.programs')}</h2>
          <div className="table-wrap pmo-data-list-wrap">
            <table className="pmo-data-list pmo-portfolio-table">
              <thead>
                <tr>
                  <th>{t('common.program')}</th>
                  <th>{t('common.projects')}</th>
                </tr>
              </thead>
              <tbody>
                {programGroups.map(([name, rows]) => (
                  <tr key={name}>
                    <td>{name}</td>
                    <td>{rows.map((p) => p.name).join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activePreview === 'projects' && (
        <section className="ui-card reports-preview">
          <h2 className="reports-preview__title">{t('reports.previewStatus')}</h2>
          <div className="table-wrap pmo-data-list-wrap pmo-data-list-wrap--sticky pmo-data-list-wrap--comfortable">
            <table className="pmo-data-list pmo-portfolio-table">
              <thead>
                <tr>
                  <th>{t('common.project')}</th>
                  <th>{t('common.health')}</th>
                  <th>{t('common.progress')}</th>
                  <th className="hide-mobile">{t('common.client')}</th>
                </tr>
              </thead>
              <tbody>
                {enriched.slice(0, 10).map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>
                      <span className={`pmo-health-badge pmo-health-${p.health}`}>{t(`health.${p.health}`) || healthLabel(p.health)}</span>
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
          <h2 className="reports-preview__title">{t('reports.previewWorkload')}</h2>
          <div className="table-wrap pmo-data-list-wrap pmo-data-list-wrap--sticky pmo-data-list-wrap--comfortable">
            <table className="pmo-data-list pmo-portfolio-table">
              <thead>
                <tr>
                  <th>{t('reports.name')}</th>
                  <th>{t('common.projects')}</th>
                  <th>{t('reports.activities')}</th>
                </tr>
              </thead>
              <tbody>
                {workload.slice(0, 10).map((w) => (
                  <tr key={w.id}>
                    <td>{w.name}</td>
                    <td>{w.projectCount ?? 0}</td>
                    <td>{w.activities?.length ?? 0}</td>
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
