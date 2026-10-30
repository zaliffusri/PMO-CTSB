import { useLocale } from '../../context/LocaleContext';

export default function HelpdeskKpis({ stats }) {
  const { t } = useLocale();
  return (
    <section className="dashboard-stats kpi-strip helpdesk-kpis" aria-label={t('helpdesk.summary')}>
      <div className="dashboard-stat-card">
        <span className="dashboard-stat-label">{t('status.open')}</span>
        <span className="dashboard-stat-value">{stats.open}</span>
      </div>
      <div className={`dashboard-stat-card ${stats.critical ? 'has-issue' : ''}`}>
        <span className="dashboard-stat-label">{t('helpdesk.critical')}</span>
        <span className="dashboard-stat-value pmo-stat-danger">{stats.critical}</span>
      </div>
      <div className="dashboard-stat-card">
        <span className="dashboard-stat-label">{t('helpdesk.l1')}</span>
        <span className="dashboard-stat-value">{stats.l1}</span>
      </div>
      <div className="dashboard-stat-card">
        <span className="dashboard-stat-label">{t('helpdesk.l2')}</span>
        <span className="dashboard-stat-value">{stats.l2}</span>
      </div>
      <div className="dashboard-stat-card">
        <span className="dashboard-stat-label">{t('helpdesk.backlog')}</span>
        <span className="dashboard-stat-value pmo-stat-warning">{stats.backlog}</span>
      </div>
      <div className={`dashboard-stat-card ${stats.slaBreached ? 'has-issue' : ''}`}>
        <span className="dashboard-stat-label">{t('helpdesk.slaBreached')}</span>
        <span className="dashboard-stat-value pmo-stat-danger">{stats.slaBreached || 0}</span>
      </div>
      <div className="dashboard-stat-card">
        <span className="dashboard-stat-label">{t('helpdesk.csat')}</span>
        <span className="dashboard-stat-value">{stats.csatAvg != null ? `${stats.csatAvg}/5` : '—'}</span>
      </div>
    </section>
  );
}
