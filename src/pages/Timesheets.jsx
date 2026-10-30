import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { canCreateProject } from '../../lib/permissions.js';
import PageHeader from '../components/PageHeader';
import { formatHours } from '../../lib/hoursUtils.js';
import { downloadCsv } from '../utils/downloadCsv';
import { useLocale } from '../context/LocaleContext';

export default function Timesheets() {
  const { user } = useAuth();
  const { t } = useLocale();
  const canApprove = canCreateProject(user);
  const [rows, setRows] = useState([]);

  const load = () => api.timeSessions.timesheets().then(setRows).catch(() => setRows([]));
  useEffect(() => { load(); }, []);

  const approve = async (id, billable) => {
    await api.timeSessions.approveTimesheet(id, { billable });
    load();
  };

  const exportCsv = () => {
    downloadCsv('timesheets.csv', [
      ['Person', 'Project', 'Task', 'Minutes', 'Hours', 'Billable', 'Approved'],
      ...rows.map((r) => [
        r.person_name, r.project_name, r.task_name, r.minutes, r.hours,
        r.billable === false ? 'no' : 'yes', r.approved_at || '',
      ]),
    ]);
  };

  return (
    <div className="page-module">
      <PageHeader
        eyebrow={t('eyebrow.delivery')}
        title={t('page.timesheets')}
        actions={<button type="button" className="btn btn-secondary btn-sm" onClick={exportCsv}>{t('action.exportCsv')}</button>}
      />
      <div className="card section-card pmo-data-list-card">
        <table className="pmo-data-list">
          <thead>
            <tr>
              <th>{t('common.person')}</th>
              <th>{t('common.project')}</th>
              <th>{t('common.task')}</th>
              <th>{t('common.hours')}</th>
              <th>{t('common.billable')}</th>
              <th>{t('common.approved')}</th>
              {canApprove && <th>{t('common.actions')}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.person_name || '—'}</td>
                <td>{r.project_name || '—'}</td>
                <td>{r.task_name || '—'}</td>
                <td>{formatHours(r.hours)}</td>
                <td>{r.billable === false ? t('status.no') : t('status.yes')}</td>
                <td>{r.approved_at ? t('status.yes') : t('timesheets.pending')}</td>
                {canApprove && (
                  <td>
                    {!r.approved_at && (
                      <>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => approve(r.id, true)}>
                          {t('action.approveBillable')}
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => approve(r.id, false)}>
                          {t('action.nonBillable')}
                        </button>
                      </>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
