import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { useSubmitLock } from '../hooks/useSubmitLock';
import PageHeader from '../components/PageHeader';
import ModuleTabs from '../components/ModuleTabs';
import ModuleFilterBar from '../components/ModuleFilterBar';
import PageLoadingState from '../components/PageLoadingState';
import ChartCard from '../components/charts/ChartCard';
import VBarChart from '../components/charts/VBarChart';
import { PMO_ROLES, normalizeRole } from '../../lib/permissions.js';
import { useLocale } from '../context/LocaleContext';

const TEAM_TABS = [
  { id: 'capacity', key: 'tab.assignments' },
  { id: 'directory', key: 'tab.directory' },
  { id: 'workload', key: 'tab.workload' },
];

function PersonDetailPanel({ personDetail, onClose }) {
  if (!personDetail) {
    return (
      <div className="team-detail-empty ui-card">
        <p>Select a team member to view projects and recent activities.</p>
      </div>
    );
  }

  return (
    <div className="team-detail-panel ui-card">
      <div className="team-detail-panel__header">
        <div>
          <h3>{personDetail.name}</h3>
          <p className="team-detail-meta">
            {personDetail.email || 'No email'} · {personDetail.role || 'No role'}
          </p>
        </div>
        {onClose && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Close
          </button>
        )}
      </div>

      <div className="team-detail-section">
        <h4>Projects</h4>
        {!personDetail.projects?.length ? (
          <p className="team-detail-muted">Not assigned to any project.</p>
        ) : (
          <ul className="team-detail-list">
            {personDetail.projects.map((pr) => (
              <li key={pr.id}>
                <Link to={`/projects/${pr.project_id}`}>{pr.project_name}</Link> — {pr.role_in_project || '–'}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="team-detail-section">
        <h4>Recent activities</h4>
        {!personDetail.activities?.length ? (
          <p className="team-detail-muted">No activities logged.</p>
        ) : (
          <ul className="team-detail-list team-detail-list--compact">
            {personDetail.activities.slice(0, 8).map((a) => (
              <li key={a.id}>
                <span className="team-detail-muted">[{a.type}]</span> {a.title}
                {a.project_name && ` (${a.project_name})`} · {new Date(a.start_at).toLocaleString()}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function Team() {
  const { user } = useAuth();
  const { t } = useLocale();
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('capacity');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', role: '' });
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const [personDetail, setPersonDetail] = useState(null);
  const [workload, setWorkload] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });
  const { pending: saving, run } = useSubmitLock();

  const canSyncRoster = user && (normalizeRole(user.role) === 'admin' || PMO_ROLES.has(normalizeRole(user.role)));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (canSyncRoster) {
        await api.people.syncFromUsers();
      }
      const list = await api.people.list({ linked_only: '1' });
      setPeople(list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [canSyncRoster]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selected) {
      setPersonDetail(null);
      return;
    }
    api.people.get(selected).then(setPersonDetail).catch(console.error);
  }, [selected]);

  useEffect(() => {
    api.availability.workload(from, to).then((wl) => setWorkload(wl?.workload || [])).catch(console.error);
    api.assignments.list().then(setAssignments).catch(console.error);
  }, [from, to]);

  const projectsByPerson = useMemo(() => {
    const map = {};
    assignments.forEach((a) => {
      if (!map[a.person_id]) map[a.person_id] = [];
      map[a.person_id].push(a.project_name);
    });
    return map;
  }, [assignments]);

  const filteredPeople = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) =>
      [p.name, p.email, p.role].filter(Boolean).join(' ').toLowerCase().includes(q)
    );
  }, [people, search]);

  const workloadVBars = useMemo(
    () => workload.slice(0, 6).map((w) => ({
      key: String(w.id),
      label: (w.name || '').split(' ')[0],
      value: w.activities?.length ?? 0,
      color: '#2563eb',
    })),
    [workload]
  );

  const selectPerson = (id) => setSelected((prev) => (prev === id ? null : id));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    await run(async () => {
      try {
        await api.people.create(form);
        setForm({ name: '', email: '', role: '' });
        setShowForm(false);
        load();
      } catch (err) {
        alert(err.message);
      }
    });
  };

  if (loading) return <PageLoadingState message="Loading team…" />;

  const periodToolbar = (
    <ModuleFilterBar summary={`Activity period: ${from} → ${to}`}>
      <label className="module-toolbar__field">
        <span className="module-toolbar__label">Period from</span>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="form-field__input pmo-filter-input" />
      </label>
      <label className="module-toolbar__field">
        <span className="module-toolbar__label">To</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="form-field__input pmo-filter-input" />
      </label>
    </ModuleFilterBar>
  );

  return (
    <div className="page-module team-page">
      <PageHeader
        title={t('page.team')}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setShowForm(true)}>
            {t('action.addPerson')}
          </button>
        }
      />

      <ModuleTabs
        tabs={TEAM_TABS.map((tab) => ({ ...tab, label: t(tab.key) }))}
        active={activeTab}
        onChange={setActiveTab}
        ariaLabel={t('tab.views')}
      />

      {showForm && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="team-add-modal-title">
            <div className="modal-dialog-header">
              <h2 id="team-add-modal-title" className="modal-dialog-title">Add team member</h2>
              <button type="button" className="modal-dialog-close" onClick={() => setShowForm(false)} aria-label="Close">
                ×
              </button>
            </div>
            <form onSubmit={submit} className="project-create-form">
              <div className="project-create-panel form-stack">
                <div className="form-field">
                  <label className="form-field__label" htmlFor="team-add-name">
                    Name <span className="form-field__required">*</span>
                  </label>
                  <input
                    id="team-add-name"
                    type="text"
                    className="form-field__input ui-input"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-field">
                  <label className="form-field__label" htmlFor="team-add-email">Email</label>
                  <input
                    id="team-add-email"
                    type="email"
                    className="form-field__input ui-input"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </div>
                <div className="form-field">
                  <label className="form-field__label" htmlFor="team-add-role">Role</label>
                  <input
                    id="team-add-role"
                    type="text"
                    className="form-field__input ui-input"
                    value={form.role}
                    onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                    placeholder="e.g. Developer, Analyst"
                  />
                </div>
              </div>
              <div className="project-create-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary project-create-footer__primary" disabled={saving}>
                  {saving ? 'Adding…' : 'Add person'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'capacity' && (
        <div className="page-section-stack">
          <section className="ui-card section-card">
            <div className="section-card__header">
              <div>
                <h2 className="section-card__title">Project assignments</h2>
              </div>
            </div>
            <div className="pmo-capacity-grid">
              {people.map((p) => {
                const projectNames = projectsByPerson[p.id] || [];
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`pmo-capacity-card ${selected === p.id ? 'selected' : ''}`}
                    onClick={() => selectPerson(p.id)}
                  >
                    <div className="pmo-capacity-name">{p.name}</div>
                    <div className="pmo-capacity-pct">
                      {projectNames.length} project{projectNames.length === 1 ? '' : 's'}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
          {selected && (
            <PersonDetailPanel
              personDetail={personDetail}
              onClose={() => setSelected(null)}
            />
          )}
        </div>
      )}

      {activeTab === 'directory' && (
        <div className="team-directory-layout">
          <aside className="team-directory-list ui-card">
            <div className="section-card__header section-card__header--compact">
              <h2 className="section-card__title">People</h2>
            </div>
            <label className="team-directory-search">
              <span className="sr-only">Search team</span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, email, role…"
                className="ui-input"
              />
            </label>
            <div className="team-directory-items">
              {filteredPeople.length === 0 ? (
                <p className="team-detail-muted">No people match your search.</p>
              ) : (
                filteredPeople.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`team-directory-item ${selected === p.id ? 'active' : ''}`}
                      onClick={() => setSelected(p.id)}
                    >
                      <span className="team-directory-item__name">{p.name}</span>
                      <span className="team-directory-item__meta">
                        {p.role || '–'} · {p.project_count} project(s)
                      </span>
                    </button>
                  ))
              )}
            </div>
          </aside>
          <PersonDetailPanel personDetail={personDetail} />
        </div>
      )}

      {activeTab === 'workload' && (
        <div className="page-section-stack">
          {periodToolbar}
          <div className="team-charts-row">
            <ChartCard title="Activity volume">
              <VBarChart data={workloadVBars} unit="" />
            </ChartCard>
          </div>
          <section className="ui-card section-card">
            <div className="section-card__header">
              <div>
                <h2 className="section-card__title">Workload summary</h2>
              </div>
            </div>
            {!workload.length ? (
              <p className="team-detail-muted">No workload data for this period.</p>
            ) : (
              <div className="table-wrap pmo-data-list-wrap pmo-data-list-wrap--sticky pmo-data-list-wrap--comfortable">
                <table className="pmo-data-list pmo-portfolio-table team-workload-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Projects</th>
                      <th>Tasks (open)</th>
                      <th>Activities</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workload.map((w) => {
                      const ts = w.taskSummary || { notDone: 0 };
                      return (
                        <tr key={w.id}>
                          <td>{w.name}</td>
                          <td>{w.projectCount ?? 0}</td>
                          <td>{ts.notDone ?? 0}</td>
                          <td>{w.activities.length} ({w.activityHours.toFixed(1)}h)</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
