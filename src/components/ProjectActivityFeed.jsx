import { useEffect, useState } from 'react';
import { api } from '../api';
import { useLocale } from '../context/LocaleContext';

export default function ProjectActivityFeed({ projectId }) {
  const { t } = useLocale();
  const [rows, setRows] = useState([]);
  useEffect(() => {
    api.projectActivity.list(projectId).then(setRows).catch(() => setRows([]));
  }, [projectId]);
  if (!rows.length) return <p className="pmo-data-list__meta">{t('activity.empty')}</p>;
  return (
    <ol className="project-activity-feed">
      {rows.map((r) => (
        <li key={r.id}>
          <strong>{r.actor_name || t('activity.system')}</strong>
          {' — '}
          {r.summary}
          <span className="pmo-data-list__meta"> {new Date(r.created_at).toLocaleString()}</span>
        </li>
      ))}
    </ol>
  );
}
