import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { inputStyle, tdStyle, thStyle } from '../styles/commonStyles';
import { useSubmitLock } from '../hooks/useSubmitLock';
import ClientMultiSelect from '../components/ClientMultiSelect';
import ProjectMiniTimeline from '../components/ProjectMiniTimeline';
import ProjectTimelinePanel from '../components/ProjectTimelinePanel';
import PageHeader from '../components/PageHeader';
import ImageUploadField from '../components/ImageUploadField';
import { IMAGE_PRESETS } from '../lib/imageResize';
import { computeProjectHealth, healthLabel, formatProjectDate, deadlineSummary } from '../../lib/pmoMetrics.js';
import { useAuth } from '../AuthContext';
import { canCreateProject, canViewFinance } from '../../lib/permissions.js';
import ProjectBacklogPanel from '../components/ProjectBacklogPanel';
import ProjectDeliveryPanel from '../components/ProjectDeliveryPanel';
import ProjectOverviewCharts from '../components/ProjectOverviewCharts';
import ProjectTasksPanel from '../components/ProjectTasksPanel';
import ProjectWorkPackagesPanel from '../components/ProjectWorkPackagesPanel';
import ModuleTabs from '../components/ModuleTabs';
import PageLoadError from '../components/PageLoadError';
import { PROJECT_ENGAGEMENT_TYPES, engagementTypeLabel, deliveryScopeLabel } from '../../lib/projectConstants.js';
import { OPEN_BACKLOG_STATUSES } from '../../lib/backlogConstants.js';

const WORKSPACE_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'packages', label: 'Work packages' },
  { id: 'backlog', label: 'Backlog' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'people', label: 'People' },
];

function ProjectDetail() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const canManage = canCreateProject(user);
  const canFinance = canViewFinance(user);
  const [project, setProject] = useState(null);
  const [people, setPeople] = useState([]);
  const [allPeople, setAllPeople] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignForm, setAssignForm] = useState({ person_id: '', role_in_project: '', allocation_percent: 100 });
  const [activeTab, setActiveTab] = useState(() => {
    const t = searchParams.get('tab');
    return WORKSPACE_TABS.some((x) => x.id === t) ? t : 'overview';
  });
  const [tasks, setTasks] = useState([]);
  const [backlogItems, setBacklogItems] = useState([]);
  const [phases, setPhases] = useState([]);
  const [workPackages, setWorkPackages] = useState([]);
  const [packageFilter, setPackageFilter] = useState('');
  const [chartFilter, setChartFilter] = useState(null);
  const { pending: busy, run } = useSubmitLock();

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    status: 'active',
    engagement_type: '',
    client_ids: [],
  });

  const load = () => {
    if (!id) return;
    setLoadError(null);
    setLoading(true);
    Promise.all([
      api.projects.get(id),
      api.clients.list(),
      api.people.list(),
      api.projectTasks.list({ project_id: id }),
      api.backlogs.list({ project_id: id }),
      api.projectPhases.list({ project_id: id }),
      api.workPackages.list({ project_id: id }),
    ])
      .then(([p, clientsList, peopleList, taskList, backlogList, phaseList, packageList]) => {
        setProject(p);
        setClients(clientsList);
        setEditForm({
          name: p?.name || '',
          description: p?.description || '',
          status: p?.status || 'active',
          engagement_type: p?.engagement_type || '',
          client_ids: Array.isArray(p?.client_ids) ? [...p.client_ids] : p?.client_id ? [p.client_id] : [],
        });
        setAllPeople(peopleList);
        setPeople(peopleList.filter(pe => !p.members?.some(m => m.person_id === pe.id)));
        setTasks(taskList);
        setBacklogItems(backlogList);
        setPhases(phaseList);
        setWorkPackages(packageList);
      })
      .catch((err) => setLoadError(err.message || 'Failed to load project'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  const changeTab = useCallback((tab) => {
    setActiveTab(tab);
    const next = new URLSearchParams(searchParams);
    if (!tab || tab === 'overview') next.delete('tab');
    else next.set('tab', tab);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const t = searchParams.get('tab');
    const next = WORKSPACE_TABS.some((x) => x.id === t) ? t : 'overview';
    setActiveTab(next);
  }, [searchParams]);

  const addAssignment = async (e) => {
    e.preventDefault();
    if (!assignForm.person_id) return;
    await run(async () => {
      try {
        const created = await api.assignments.create({
          project_id: +id,
          person_id: +assignForm.person_id,
          role_in_project: assignForm.role_in_project || undefined,
          allocation_percent: Math.min(100, Math.max(1, +assignForm.allocation_percent || 100)),
        });
        setAssignForm({ person_id: '', role_in_project: '', allocation_percent: 100 });
        setAssignOpen(false);
        load();
        const en = created?.email_notification;
        if (en && en !== 'sent') {
          const hint = {
            no_recipient:
              'Assignment saved. No notification email: add an email for this person on Team, or use the same name as their system user account.',
            smtp_not_configured: 'Assignment saved. Email is not available until SMTP is configured on the server.',
            failed: 'Assignment saved, but the notification email could not be sent. Ask an admin to check server logs.',
          }[en];
          if (hint) alert(hint);
        }
      } catch (err) {
        alert(err.message);
      }
    });
  };

  const removeAssignment = async (assignId) => {
    if (!confirm('Remove this team member from the project?')) return;
    await run(async () => {
      try {
        await api.assignments.delete(assignId);
        load();
      } catch (err) {
        alert(err.message);
      }
    });
  };

  const saveProjectEdit = async (e) => {
    e.preventDefault();
    await run(async () => {
      try {
        const updated = await api.projects.update(id, {
          name: editForm.name,
          description: editForm.description || null,
          status: editForm.status,
          engagement_type: editForm.engagement_type || null,
          client_ids: editForm.client_ids,
        });
        setProject(updated);
        setEditOpen(false);
      } catch (err) {
        alert(err.message);
      }
    });
  };

  const updateAllocation = async (assignId, allocation_percent) => {
    const pct = Math.min(100, Math.max(1, +allocation_percent || 1));
    try {
      await api.assignments.update(assignId, { allocation_percent: pct });
      load();
    } catch (err) {
      alert(err.message);
    }
  };

  const projectHealth = useMemo(
    () => (project ? computeProjectHealth(project, tasks) : null),
    [project, tasks],
  );

  const leafTasks = useMemo(
    () => {
      let list = tasks.filter((t) => t.task_kind !== 'group');
      if (packageFilter) list = list.filter((t) => t.work_package_id === +packageFilter);
      return list;
    },
    [tasks, packageFilter],
  );

  const handleChartDrillDown = useCallback((payload) => {
    if (payload?.clear) {
      setChartFilter(null);
      return;
    }
    const next = {};
    if (payload.taskStatus) next.taskStatus = payload.taskStatus;
    if (payload.packageId) next.packageId = payload.packageId;
    if (payload.assigneeKey) {
      next.assigneeKey = payload.assigneeKey;
      next.assigneeLabel = payload.assigneeLabel;
    }
    if (payload.healthKey) next.healthKey = payload.healthKey;
    setChartFilter(Object.keys(next).length ? next : null);
    if (payload.packageId) setPackageFilter(String(payload.packageId));
    if (payload.tab) changeTab(payload.tab);
  }, [changeTab]);

  const overdueTasks = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return leafTasks.filter(
      (t) => t.planned_end_date && t.planned_end_date < today && (t.status || 'new') !== 'done',
    );
  }, [leafTasks]);

  const deadline = useMemo(
    () => (project ? deadlineSummary(project.end_date, project.status) : null),
    [project],
  );

  const tabCounts = useMemo(() => ({
    packages: workPackages.length || null,
    tasks: leafTasks.length,
    people: project?.members?.length ?? 0,
    backlog: backlogItems.filter((b) => OPEN_BACKLOG_STATUSES.has(b.status) && (!packageFilter || b.work_package_id === +packageFilter)).length,
    delivery: phases.filter((p) => p.status !== 'completed' && (!packageFilter || p.work_package_id === +packageFilter)).length,
  }), [leafTasks, project, backlogItems, phases, workPackages, packageFilter]);

  const workspaceTabs = useMemo(() => WORKSPACE_TABS.map((tab) => ({
    id: tab.id,
    label: tab.label,
    badge: tab.id === 'packages' ? (tabCounts.packages || null)
      : tab.id === 'tasks' ? (tabCounts.tasks || null)
      : tab.id === 'backlog' ? (tabCounts.backlog || null)
      : tab.id === 'delivery' ? (tabCounts.delivery || null)
      : tab.id === 'people' ? (tabCounts.people || null)
      : null,
  })), [tabCounts]);

  const saveCover = async (cover_image_url) => {
    await run(async () => {
      const updated = await api.projects.update(id, { cover_image_url });
      setProject(updated);
    });
  };

  if (loadError) return <PageLoadError message={loadError} onRetry={load} />;
  if (loading || !project) return <div className="page-loading">Loading project…</div>;

  return (
    <div className="page-module project-workspace">
      <Link to="/projects" className="page-breadcrumb">← Projects</Link>

      {project.cover_image_url ? (
        <div
          className="project-cover-banner"
          style={{ backgroundImage: `url(${project.cover_image_url})` }}
          role="img"
          aria-label={`${project.name} cover`}
        />
      ) : null}

      <PageHeader
        compact={false}
        title={project.name}
        badge={projectHealth && (
          <span className={`pmo-health-badge pmo-health-${projectHealth.health}`}>
            {healthLabel(projectHealth.health)}
          </span>
        )}
        subtitle={
          <div className="project-header-meta">
            {project.description && <p className="project-header-desc">{project.description}</p>}
            <div className="project-meta-chips">
              <span className={`dashboard-badge dashboard-badge-${project.status}`}>{project.status}</span>
              {project.engagement_type && (
                <span className="project-meta-chip">{engagementTypeLabel(project.engagement_type)}</span>
              )}
              {project.classification && workPackages.length === 0 && (
                <span className="project-meta-chip" title="Primary delivery scope">{deliveryScopeLabel(project.classification)}</span>
              )}
              {workPackages.map((wp) => (
                <span key={wp.id} className="project-meta-chip project-meta-chip--package" title={deliveryScopeLabel(wp.classification)}>
                  {wp.name}
                </span>
              ))}
              {project.client_name && (
                <span className="project-meta-chip">Client: {project.client_name}</span>
              )}
              {(project.start_date || project.end_date) && (
                <span className="project-meta-chip">
                  {formatProjectDate(project.start_date) || '—'} → {formatProjectDate(project.end_date) || 'Open'}
                </span>
              )}
              {deadline && (
                <span className={`project-deadline project-deadline--${deadline.tone}`}>{deadline.label}</span>
              )}
            </div>
          </div>
        }
        actions={
          <>
            <Link to="/gantt" className="btn btn-secondary">Gantt</Link>
            <button type="button" className="btn btn-primary" onClick={() => { changeTab('people'); setAssignOpen(true); }} disabled={busy}>
              + Assign team
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => { changeTab('overview'); setEditOpen(!editOpen); }} disabled={busy}>
              {editOpen ? 'Cancel edit' : 'Edit'}
            </button>
          </>
        }
      />

      <ModuleTabs
        tabs={workspaceTabs}
        active={activeTab}
        onChange={changeTab}
        ariaLabel="Project workspace"
      />
      <div className="project-workspace-links">
        <Link to="/calendar" className="btn btn-secondary btn-sm">Activities</Link>
      </div>

      {workPackages.length > 0 && activeTab !== 'packages' && activeTab !== 'overview' && (
        <div className="card section-card module-toolbar-card">
          <div className="module-toolbar">
            <div className="module-toolbar__field">
              <span className="module-toolbar__label">Work package</span>
              <div className="chip-group">
                <button type="button" className={`chip-filter ${!packageFilter ? 'active' : ''}`} onClick={() => setPackageFilter('')}>All packages</button>
                {workPackages.map((wp) => (
                  <button key={wp.id} type="button" className={`chip-filter ${packageFilter === String(wp.id) ? 'active' : ''}`} onClick={() => setPackageFilter(String(wp.id))}>
                    {wp.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'packages' && (
        <div className="ui-card section-card">
          <ProjectWorkPackagesPanel
            projectId={+id}
            canManage={canManage}
            onPackagesChange={setWorkPackages}
            onFocusPackage={(wpId) => {
              setPackageFilter(String(wpId));
              changeTab('tasks');
            }}
          />
        </div>
      )}

      {activeTab === 'overview' && projectHealth && (
        <>
        <div className="pmo-overview-kpis project-workspace-kpis">
          <div className="pmo-overview-kpi">
            <span className="pmo-overview-kpi-label">Completion</span>
            <span className="pmo-overview-kpi-value">{projectHealth.progress}%</span>
            <div className="pmo-progress-bar project-workspace-progress" aria-hidden>
              <div
                className="pmo-progress-fill"
                style={{ width: `${projectHealth.progress}%`, background: projectHealth.health === 'blocked' ? 'var(--danger)' : projectHealth.health === 'at_risk' ? 'var(--warning)' : 'var(--success)' }}
              />
            </div>
          </div>
          <div className="pmo-overview-kpi">
            <span className="pmo-overview-kpi-label">Tasks</span>
            <span className="pmo-overview-kpi-value">{projectHealth.taskCount}</span>
          </div>
          <div className={`pmo-overview-kpi ${projectHealth.overdueTasks ? 'pmo-overview-kpi--warn' : ''}`}>
            <span className="pmo-overview-kpi-label">Overdue</span>
            <span className="pmo-overview-kpi-value">{projectHealth.overdueTasks}</span>
          </div>
          <div className="pmo-overview-kpi">
            <span className="pmo-overview-kpi-label">Team</span>
            <span className="pmo-overview-kpi-value">{project.members?.length ?? 0}</span>
          </div>
        </div>

        <ProjectOverviewCharts
          tasks={tasks}
          workPackages={workPackages}
          phases={phases}
          backlogItems={backlogItems}
          progress={projectHealth.progress}
          health={projectHealth.health}
          onDrillDown={handleChartDrillDown}
        />
        </>
      )}

      {activeTab === 'overview' && (
        <div className="project-overview-grid">
          {overdueTasks.length > 0 && (
            <div className="ui-card section-card project-attention-card">
              <div className="section-card__header section-card__header--compact">
                <h2 className="section-card__title">Needs attention</h2>
                <p className="section-card__desc">{overdueTasks.length} overdue task{overdueTasks.length === 1 ? '' : 's'}</p>
              </div>
              <ul className="project-attention-list">
                {overdueTasks.slice(0, 6).map((t) => (
                  <li key={t.id}>
                    <button type="button" className="project-attention-item" onClick={() => changeTab('tasks')}>
                      <span className="project-attention-name">{t.name}</span>
                      <span className="project-attention-due">Due {formatProjectDate(t.planned_end_date)}</span>
                      {t.assignee_name && <span className="project-attention-assignee">{t.assignee_name}</span>}
                    </button>
                  </li>
                ))}
              </ul>
              {overdueTasks.length > 6 && (
                <div className="project-attention-more">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => changeTab('tasks')}>
                    View all tasks
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="ui-card section-card">
            <div className="section-card__header section-card__header--compact">
              <h2 className="section-card__title">Timeline preview</h2>
              <p className="section-card__desc">Planned vs actual at a glance</p>
            </div>
            <div className="project-overview-timeline">
              <ProjectMiniTimeline tasks={tasks} projectName={project.name} compact />
            </div>
            <div className="project-overview-actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => changeTab('timeline')}>Full timeline</button>
              <Link to="/gantt" className="btn btn-secondary btn-sm">Portfolio Gantt</Link>
            </div>
          </div>

          <div className="ui-card section-card">
            <div className="section-card__header section-card__header--compact">
              <h2 className="section-card__title">Team</h2>
              <p className="section-card__desc">{project.members?.length ?? 0} assigned</p>
            </div>
            {!project.members?.length ? (
              <p className="project-overview-empty">No one assigned yet.</p>
            ) : (
              <ul className="project-team-preview">
                {project.members.slice(0, 5).map((m) => (
                  <li key={m.id} className="project-team-preview__row">
                    <span className="project-team-preview__name">{m.name}</span>
                    <span className="project-team-preview__role">{m.role_in_project || 'Member'}</span>
                    <span className="project-team-preview__alloc">{m.allocation_percent ?? 100}%</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="project-overview-actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => changeTab('people')}>Manage team</button>
            </div>
          </div>

          <div className="ui-card section-card project-cover-panel">
            <div className="section-card__header section-card__header--compact">
              <h2 className="section-card__title">Project cover</h2>
              <p className="section-card__desc">Optional banner for this workspace</p>
            </div>
            <div className="project-cover-panel__body">
              <ImageUploadField
                value={project.cover_image_url}
                onChange={saveCover}
                onError={(m) => alert(m)}
                preset={IMAGE_PRESETS.projectCover}
                variant="banner"
                placeholder="Add project cover"
                busy={busy}
              />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'overview' && editOpen && (
        <div className="ui-card section-card">
          <h2 style={{ margin: '0 0 1rem', fontSize: '1.1rem' }}>Edit project</h2>
          <form onSubmit={saveProjectEdit} style={{ display: 'grid', gap: '0.75rem', maxWidth: 520 }}>
            <label>
              Name <span style={{ color: 'var(--danger)' }}>*</span>
              <input
                type="text"
                value={editForm.name}
                onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                required
                className="ui-input form-field__input"
              />
            </label>
            <label>
              Description
              <textarea
                value={editForm.description}
                onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                rows={2}
                className="ui-input form-field__input"
              />
            </label>
            <label>
              Engagement type
              <select
                value={editForm.engagement_type}
                onChange={e => setEditForm(f => ({ ...f, engagement_type: e.target.value }))}
                className="ui-input form-field__input"
              >
                <option value="">Not set</option>
                {PROJECT_ENGAGEMENT_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select
                value={editForm.status}
                onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
                className="ui-input form-field__input"
              >
                <option value="active">Active</option>
                <option value="on-hold">On hold</option>
                <option value="completed">Completed</option>
              </select>
            </label>
            <label>
              Clients (companies involved)
              <ClientMultiSelect
                clients={clients}
                value={editForm.client_ids}
                onChange={(client_ids) => setEditForm((f) => ({ ...f, client_ids }))}
                idPrefix="project-edit-client"
              />
            </label>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
              <button type="button" className="btn btn-secondary" onClick={() => setEditOpen(false)} disabled={busy}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {activeTab === 'people' && assignOpen && (
        <div className="ui-card section-card" style={{ marginBottom: '1rem' }}>
          <h3 style={{ margin: '0 0 1rem' }}>Assign team member</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
            Pick someone from the list. You can manage the full team on <Link to="/team">Team</Link>.
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
            Email notify: add an email on Team for this person, or use the same full name as their system user account so we can resolve their login email.
          </p>
          <form onSubmit={addAssignment} style={{ display: 'grid', gap: '0.75rem', maxWidth: 400 }}>
            <label>
              Person
              <select value={assignForm.person_id} onChange={e => setAssignForm(f => ({ ...f, person_id: e.target.value }))} required className="ui-input form-field__input">
                <option value="">Select...</option>
                {people.map(p => (
                  <option key={p.id} value={p.id}>{p.name} {p.project_count > 0 ? `(${p.project_count} projects)` : ''}</option>
                ))}
              </select>
            </label>
            <label>
              Role in project
              <input type="text" value={assignForm.role_in_project} onChange={e => setAssignForm(f => ({ ...f, role_in_project: e.target.value }))} placeholder="e.g. Developer, Lead" className="ui-input form-field__input" />
            </label>
            <label>
              Allocation %
              <input
                type="number"
                min={1}
                max={100}
                value={assignForm.allocation_percent}
                onChange={(e) => setAssignForm((f) => ({ ...f, allocation_percent: +e.target.value || 100 }))}
                className="ui-input form-field__input"
              />
            </label>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Assigning…' : 'Assign'}</button>
            </div>
          </form>
        </div>
      )}

      {activeTab === 'people' && (
      <div className="ui-card section-card">
        <h2 style={{ margin: '0 0 1rem', fontSize: '1.1rem' }}>Team assigned to this project</h2>
        {!project.members?.length ? (
          <p style={{ color: 'var(--text-muted)' }}>No one assigned yet. Use &quot;Assign team member&quot; to add people.</p>
        ) : (
          <div className="table-wrap pmo-data-list-wrap pmo-data-list-wrap--sticky pmo-data-list-wrap--comfortable">
          <table className="pmo-data-list pmo-portfolio-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Allocation %</th>
                <th className="table-actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {project.members.map(m => (
                <tr key={m.id}>
                  <td>
                    <Link to="/team" className="pmo-link-strong">{m.name}</Link>
                  </td>
                  <td>{m.role_in_project || '–'}</td>
                  <td>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      defaultValue={m.allocation_percent ?? 100}
                      onBlur={(e) => updateAllocation(m.id, e.target.value)}
                      className="ui-input"
                      style={{ width: '5rem', padding: '0.35rem 0.5rem' }}
                      aria-label={`Allocation for ${m.name}`}
                    />
                  </td>
                  <td className="table-actions-col pmo-row-actions">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => removeAssignment(m.id)} disabled={busy}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
      )}

      {activeTab === 'backlog' && (
        <div className="ui-card section-card">
          <ProjectBacklogPanel
            projectId={+id}
            people={allPeople}
            workPackages={workPackages}
            workPackageFilter={packageFilter}
            canManage={canManage}
            openBacklogId={searchParams.get('backlog')}
          />
        </div>
      )}

      {activeTab === 'delivery' && (
        <div className="ui-card section-card">
          <ProjectDeliveryPanel
            projectId={+id}
            classification={project.classification}
            workPackages={workPackages}
            workPackageFilter={packageFilter}
            canManage={canManage}
            canFinance={canFinance}
          />
        </div>
      )}

      {activeTab === 'timeline' && (
        <div className="ui-card section-card project-timeline-page">
          <ProjectTimelinePanel
            project={project}
            tasks={tasks}
            phases={phases}
            workPackages={workPackages}
            workPackageFilter={packageFilter}
            onGoToTasks={() => changeTab('tasks')}
          />
        </div>
      )}

      {activeTab === 'tasks' && (
        <ProjectTasksPanel
          projectId={id}
          tasks={tasks}
          workPackages={workPackages}
          packageFilter={packageFilter}
          allPeople={allPeople}
          chartFilter={chartFilter}
          onClearChartFilter={() => handleChartDrillDown({ clear: true })}
          canManage={canManage}
          onReload={load}
        />
      )}

    </div>
  );
}


export default ProjectDetail;
