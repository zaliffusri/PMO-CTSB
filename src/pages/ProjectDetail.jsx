import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, Link, useSearchParams, useNavigate } from 'react-router-dom';
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
import { canCreateProject, canDeleteProject, canViewFinance } from '../../lib/permissions.js';
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
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const canManage = canCreateProject(user);
  const canRemoveProject = canDeleteProject(user);
  const canFinance = canViewFinance(user);
  const [project, setProject] = useState(null);
  const [people, setPeople] = useState([]);
  const [allPeople, setAllPeople] = useState([]);
  const [clients, setClients] = useState([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientsError, setClientsError] = useState('');
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

  const loadClients = useCallback(() => {
    setClientsLoading(true);
    setClientsError('');
    return api.clients
      .list()
      .then((rows) => {
        setClients(Array.isArray(rows) ? rows : []);
      })
      .catch((err) => {
        console.error(err);
        setClients([]);
        setClientsError(err?.message || 'Could not load companies');
      })
      .finally(() => setClientsLoading(false));
  }, []);

  const load = () => {
    if (!id) return;
    setLoadError(null);
    setLoading(true);

    // Critical path: open workspace as soon as the project shell is available.
    api.projects.get(id)
      .then((p) => {
        if (!p || p.error) throw new Error(p?.error || 'Project not found');
        setProject(p);
        setEditForm({
          name: p?.name || '',
          description: p?.description || '',
          status: p?.status || 'active',
          engagement_type: p?.engagement_type || '',
          client_ids: Array.isArray(p?.client_ids)
            ? p.client_ids.map((cid) => Number(cid)).filter((cid) => Number.isFinite(cid))
            : p?.client_id
              ? [Number(p.client_id)]
              : [],
        });
        setLoading(false);

        // Clients are needed for Edit project — load independently (do not bury failures).
        loadClients();

        // Stagger secondary loads — parallel fan-out was causing Vercel 504s (auth + heavy enrich).
        const loadWorkspaceSecondary = async () => {
          try {
            const [taskList, packageList] = await Promise.all([
              api.projectTasks.list({ project_id: id }).catch(() => []),
              api.workPackages.list({ project_id: id }).catch(() => []),
            ]);
            setTasks(Array.isArray(taskList) ? taskList : []);
            setWorkPackages(Array.isArray(packageList) ? packageList : []);
          } catch (e) {
            console.warn('workspace tasks/packages:', e?.message || e);
          }

          try {
            const [backlogList, phaseList] = await Promise.all([
              api.backlogs.list({ project_id: id }).catch(() => []),
              api.projectPhases.list({ project_id: id }).catch(() => []),
            ]);
            setBacklogItems(Array.isArray(backlogList) ? backlogList : []);
            setPhases(Array.isArray(phaseList) ? phaseList : []);
          } catch (e) {
            console.warn('workspace backlog/phases:', e?.message || e);
          }

          try {
            const peopleList = await api.people.list().catch(() => []);
            const peopleRows = Array.isArray(peopleList) ? peopleList : [];
            setAllPeople(peopleRows);
            setPeople(peopleRows.filter((pe) => !p.members?.some((m) => Number(m.person_id) === Number(pe.id))));
          } catch (e) {
            console.warn('workspace people:', e?.message || e);
          }
        };
        return loadWorkspaceSecondary();
      })
      .catch((err) => {
        setProject(null);
        setLoadError(err.message || 'Failed to load project');
        setLoading(false);
      });
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
        setProject((prev) => ({
          ...updated,
          // Keep workspace-only fields the lightweight update response omits.
          members: updated.members ?? prev?.members,
          cover_image_url: updated.cover_image_url ?? prev?.cover_image_url,
          engagement_type: updated?.engagement_type ?? editForm.engagement_type ?? null,
        }));
        setEditForm({
          name: updated?.name || '',
          description: updated?.description || '',
          status: updated?.status || 'active',
          engagement_type: updated?.engagement_type ?? editForm.engagement_type ?? '',
          client_ids: Array.isArray(updated?.client_ids)
            ? updated.client_ids.map((cid) => Number(cid)).filter((cid) => Number.isFinite(cid))
            : [],
        });
        setEditOpen(false);
      } catch (err) {
        alert(err.message);
      }
    });
  };

  const startProjectEdit = () => {
    changeTab('overview');
    setEditForm({
      name: project?.name || '',
      description: project?.description || '',
      status: project?.status || 'active',
      engagement_type: project?.engagement_type || '',
      client_ids: Array.isArray(project?.client_ids)
        ? project.client_ids.map((cid) => Number(cid)).filter((cid) => Number.isFinite(cid))
        : project?.client_id
          ? [Number(project.client_id)]
          : [],
    });
    setEditOpen(true);
    if (!clients.length || clientsError) loadClients();
  };

  const cancelProjectEdit = () => {
    setEditOpen(false);
    setEditForm({
      name: project?.name || '',
      description: project?.description || '',
      status: project?.status || 'active',
      engagement_type: project?.engagement_type || '',
      client_ids: Array.isArray(project?.client_ids)
        ? project.client_ids.map((cid) => Number(cid)).filter((cid) => Number.isFinite(cid))
        : project?.client_id
          ? [Number(project.client_id)]
          : [],
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

  const projectClientNames = useMemo(() => {
    if (!project) return [];
    if (Array.isArray(project.clients) && project.clients.length) {
      return project.clients.map((c) => c.name).filter(Boolean);
    }
    if (project.client_name) {
      return String(project.client_name)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    const ids = new Set(
      (Array.isArray(project.client_ids) ? project.client_ids : [])
        .map((cid) => Number(cid))
        .filter((cid) => Number.isFinite(cid)),
    );
    if (!ids.size) return [];
    return clients.filter((c) => ids.has(Number(c.id))).map((c) => c.name).filter(Boolean);
  }, [project, clients]);

  const statusLabel = (status) => {
    if (status === 'on-hold') return 'On hold';
    if (status === 'completed') return 'Completed';
    if (status === 'active') return 'Active';
    return status || '—';
  };

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

  const deleteProject = async () => {
    if (!canRemoveProject || !project?.id) return;
    const ok = confirm(
      `Delete project "${project.name}"?\n\nThis permanently removes the project and linked team, tasks, backlog, work packages, phases, and attachments. Calendar activities and helpdesk tickets stay, but are unlinked.`,
    );
    if (!ok) return;
    const typed = window.prompt(`Type DELETE to confirm deleting "${project.name}".`);
    if (String(typed || '').trim().toUpperCase() !== 'DELETE') {
      if (typed != null) alert('Delete cancelled — confirmation text did not match.');
      return;
    }
    await run(async () => {
      try {
        await api.projects.delete(project.id);
        navigate('/projects', { replace: true, state: { projectDeleted: project.id } });
      } catch (err) {
        alert(err.message || 'Failed to delete project');
      }
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
            {canRemoveProject && (
              <button
                type="button"
                className="btn btn-secondary project-delete-btn"
                onClick={deleteProject}
                disabled={busy}
              >
                Delete project
              </button>
            )}
          </>
        }
      />

      <div className="project-workspace-nav">
        <ModuleTabs
          tabs={workspaceTabs}
          active={activeTab}
          onChange={changeTab}
          ariaLabel="Project workspace"
          badgeTone="count"
        />
        <div className="project-workspace-nav__actions">
          <Link to="/calendar" className="btn btn-secondary btn-sm">Activities</Link>
        </div>
      </div>

      <div className="project-workspace-panels">
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

      {activeTab === 'overview' && (
        <div className={`ui-card section-card project-details-card${editOpen ? ' project-details-card--editing' : ''}`}>
          <div className="section-card__header section-card__header--compact">
            <div>
              <h2 className="section-card__title">Project details</h2>
              <p className="section-card__desc">
                {editOpen
                  ? 'Update name, description, engagement, status, and clients'
                  : 'Core identity for this workspace — quick reference while you work'}
              </p>
            </div>
            {canManage && !editOpen && (
              <div className="card-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={startProjectEdit}
                  disabled={busy}
                >
                  Edit details
                </button>
              </div>
            )}
          </div>

          {editOpen ? (
            <form onSubmit={saveProjectEdit} className="project-details-edit">
              <div className="project-details-grid project-details-grid--edit">
                <label className="project-details-item">
                  <span className="project-details-item__label">
                    Name <span className="project-details-item__req">*</span>
                  </span>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                    required
                    className="ui-input form-field__input"
                  />
                </label>
                <label className="project-details-item project-details-item--wide">
                  <span className="project-details-item__label">Description</span>
                  <textarea
                    value={editForm.description}
                    onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                    rows={3}
                    className="ui-input form-field__input"
                  />
                </label>
                <label className="project-details-item">
                  <span className="project-details-item__label">Engagement type</span>
                  <select
                    value={editForm.engagement_type}
                    onChange={(e) => setEditForm((f) => ({ ...f, engagement_type: e.target.value }))}
                    className="ui-input form-field__input"
                  >
                    <option value="">Not set</option>
                    {PROJECT_ENGAGEMENT_TYPES.map((t) => (
                      <option key={t.id} value={t.id}>{t.label}</option>
                    ))}
                  </select>
                </label>
                <label className="project-details-item">
                  <span className="project-details-item__label">Status</span>
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                    className="ui-input form-field__input"
                  >
                    <option value="active">Active</option>
                    <option value="on-hold">On hold</option>
                    <option value="completed">Completed</option>
                  </select>
                </label>
                <div className="project-details-item project-details-item--wide">
                  <span className="project-details-item__label">Clients</span>
                  <ClientMultiSelect
                    clients={clients}
                    value={editForm.client_ids}
                    onChange={(client_ids) => setEditForm((f) => ({ ...f, client_ids }))}
                    idPrefix="project-edit-client"
                    loading={clientsLoading}
                    error={clientsError}
                    onRetry={loadClients}
                  />
                </div>
              </div>
              <div className="project-details-edit__actions form-actions">
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? 'Saving…' : 'Save changes'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={cancelProjectEdit} disabled={busy}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <dl className="project-details-grid">
              <div className="project-details-item">
                <dt>Name</dt>
                <dd>{project.name || '—'}</dd>
              </div>
              <div className="project-details-item project-details-item--wide">
                <dt>Description</dt>
                <dd className={project.description ? '' : 'project-details-item__muted'}>
                  {project.description?.trim() || 'No description provided'}
                </dd>
              </div>
              <div className="project-details-item">
                <dt>Engagement type</dt>
                <dd>
                  {project.engagement_type
                    ? engagementTypeLabel(project.engagement_type)
                    : <span className="project-details-item__muted">Not set</span>}
                </dd>
              </div>
              <div className="project-details-item">
                <dt>Status</dt>
                <dd>
                  <span className={`dashboard-badge dashboard-badge-${project.status}`}>
                    {statusLabel(project.status)}
                  </span>
                </dd>
              </div>
              <div className="project-details-item project-details-item--wide">
                <dt>Clients</dt>
                <dd>
                  {projectClientNames.length ? (
                    <ul className="project-details-clients">
                      {projectClientNames.map((name) => (
                        <li key={name}>
                          <Link to="/clients" className="pmo-link-strong">{name}</Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="project-details-item__muted">No companies linked</span>
                  )}
                </dd>
              </div>
            </dl>
          )}
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

      {activeTab === 'people' && assignOpen && (
        <div className="ui-card section-card project-people-assign">
          <div className="section-card__header section-card__header--compact">
            <div>
              <h3 className="section-card__title">Assign team member</h3>
              <p className="section-card__desc">
                Pick someone from the roster. Manage the full directory on <Link to="/team">Team</Link>.
              </p>
            </div>
            <div className="card-actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAssignOpen(false)} disabled={busy}>
                Close
              </button>
            </div>
          </div>
          <div className="project-people-body">
            <p className="project-people-hint">
              Email notify: add an email on Team for this person, or use the same full name as their system user account.
            </p>
            <form onSubmit={addAssignment} className="project-people-form">
              <label className="form-field">
                <span className="form-field__label">Person</span>
                <select
                  value={assignForm.person_id}
                  onChange={(e) => setAssignForm((f) => ({ ...f, person_id: e.target.value }))}
                  required
                  className="ui-input form-field__input"
                >
                  <option value="">Select...</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.project_count > 0 ? ` (${p.project_count} projects)` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                <span className="form-field__label">Role in project</span>
                <input
                  type="text"
                  value={assignForm.role_in_project}
                  onChange={(e) => setAssignForm((f) => ({ ...f, role_in_project: e.target.value }))}
                  placeholder="e.g. Developer, Lead"
                  className="ui-input form-field__input"
                />
              </label>
              <label className="form-field">
                <span className="form-field__label">Allocation %</span>
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
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? 'Assigning…' : 'Assign'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'people' && (
        <div className="ui-card section-card project-people-panel">
          <div className="section-card__header section-card__header--compact">
            <div>
              <h2 className="section-card__title">Team assigned to this project</h2>
              <p className="section-card__desc">
                {project.members?.length
                  ? `${project.members.length} member${project.members.length === 1 ? '' : 's'} on this delivery team`
                  : 'No one assigned yet — add people to track ownership and capacity.'}
              </p>
            </div>
            <div className="card-actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setAssignOpen(true)}
                disabled={busy}
              >
                + Assign member
              </button>
            </div>
          </div>
          {!project.members?.length ? (
            <div className="project-people-empty">
              <p>No team members on this project yet.</p>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setAssignOpen(true)}
                disabled={busy}
              >
                Assign team member
              </button>
            </div>
          ) : (
            <div className="table-wrap pmo-data-list-wrap pmo-data-list-wrap--sticky pmo-data-list-wrap--comfortable project-people-table">
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
                  {project.members.map((m) => (
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
                          className="ui-input project-people-alloc"
                          aria-label={`Allocation for ${m.name}`}
                        />
                      </td>
                      <td className="table-actions-col pmo-row-actions">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => removeAssignment(m.id)}
                          disabled={busy}
                        >
                          Remove
                        </button>
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
    </div>
  );
}


export default ProjectDetail;
