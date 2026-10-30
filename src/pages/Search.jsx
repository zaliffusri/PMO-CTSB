import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import PageHeader from '../components/PageHeader';
import { useLocale } from '../context/LocaleContext';

export default function Search() {
  const { t } = useLocale();
  const [q, setQ] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      if (q.trim().length < 2) {
        setResult(null);
        return;
      }
      setBusy(true);
      api.search.query(q.trim())
        .then(setResult)
        .catch(() => setResult(null))
        .finally(() => setBusy(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const groups = [
    { key: 'projects', label: t('search.projects'), href: (r) => `/projects/${r.id}` },
    { key: 'tasks', label: t('search.tasks'), href: (r) => `/projects/${r.project_id}?tab=tasks` },
    { key: 'issues', label: t('search.issues'), href: () => '/helpdesk' },
    { key: 'backlogs', label: t('search.backlogs'), href: (r) => `/projects/${r.project_id}?tab=backlog` },
  ];

  return (
    <div className="page-module">
      <PageHeader eyebrow={t('eyebrow.workspace')} title={t('page.search')} />
      <div className="card section-card" style={{ padding: '1rem 1.15rem' }}>
        <input
          type="search"
          className="form-field__input"
          placeholder={t('search.placeholder')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
        {busy && <p className="pmo-filter-summary">{t('common.searching')}</p>}
        {result && groups.map((g) => {
          const rows = result[g.key] || [];
          if (!rows.length) return null;
          return (
            <section key={g.key} style={{ marginTop: '1.25rem' }}>
              <h2 className="section-card__title">{g.label}</h2>
              <ul className="pmo-search-list">
                {rows.map((r) => (
                  <li key={`${g.key}-${r.id}`}>
                    <Link to={g.href(r)}>{r.name || r.title || r.ref_no || r.ticket_no}</Link>
                    {r.ref_no && r.title && <span className="pmo-data-list__meta"> {r.ref_no}</span>}
                    {r.ticket_no && <span className="pmo-data-list__meta"> {r.ticket_no}</span>}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
