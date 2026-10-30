import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, Link, useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { inputStyle, tdStyle, thStyle } from '../styles/commonStyles';
import { useSubmitLock } from '../hooks/useSubmitLock';
import ClientMultiSelect from '../components/ClientMultiSelect';
import ProjectMiniTimeline from '../components/ProjectMiniTimeline';
import ProjectTimelinePanel from '../components/ProjectTimelinePanel';
import PageHeader from '../components/PageHeader';
import { computeProjectHealth, healthLabel, formatProjectDate, deadlineSummary } from '../../lib/pmoMetrics.js';
import { useAuth } from '../AuthContext';
import { canCreateProject, canDeleteProject, canViewFinance } from '../../lib/permissions.js';
import ProjectBacklogPanel from '../components/ProjectBacklogPanel';
import ProjectDeliveryPanel from '../components/ProjectDeliveryPanel';
import ProjectOverviewCharts from '../components/ProjectOverviewCharts';
import ProjectTasksPanel from '../components/ProjectTasksPanel';
import ProjectWorkPackagesPanel from '../components/ProjectWorkPackagesPanel';
import ProjectEotPanel from '../components/ProjectEotPanel';
import ModuleTabs from '../components/ModuleTabs';
import PageLoadError from '../components/PageLoadError';
import {
  PROJECT_ENGAGEMENT_TYPES,
  PROJECT_ASSIGNMENT_ROLES,
  PROJECT_ASSIGNMENT_ROLE_SET,
  PHASE_UI,
  engagementTypeLabel,
  deliveryScopeLabel,
  normalizeProjectAssignmentRole,
} from '../../lib/projectConstants.js';
import { OPEN_BACKLOG_STATUSES } from '../../lib/backlogConstants.js';
import ProjectRaidPanel from '../components/ProjectRaidPanel';
import ProjectActivityFeed from '../components/ProjectActivityFeed';
import { earnedValueFromTasks } from '../../lib/earnedValue.js';
import { useLocale } from '../context/LocaleContext';

const WORKSPACE_TABS = [
  { id: 'overview', key: 'tab.overview' },
  { id: 'packages', key: 'tab.phases' },
  { id: 'backlog', key: 'tab.backlog' },
  { id: 'tasks', key: 'tab.tasks' },
  { id: 'delivery', key: 'tab.delivery' },
  { id: 'timeline', key: 'tab.timeline' },
  { id: 'people', key: 'tab.people' },
  { id: 'raid', key: 'tab.raid' },
  { id: 'activities', key: 'tab.activities' },
];

function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { t: tr } = useLocale();
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
  /** When set, modal edits this assignment's role instead of creating. */
  const [editingAssignment, setEditingAssignment] = useState(null);
  const [assignForm, setAssignForm] = useState({ person_id: '', role_in_project: '', custom_role: '' });

  const closeAssignModal = ({ force = false } = {}) => {
    if (busy && !force) return;
    setAssignOpen(false);
    setEditingAssignment(null);
    setAssignForm({ person_id: '', role_in_project: '', custom_role: '' });
  };

  const openAssignModal = () => {
    setEditingAssignment(null);
    setAssignForm({ person_id: '', role_in_project: '', custom_role: '' });
    setAssignOpen(true);
  };

  const openEditRoleModal = (member) => {
    const rawRole = String(member.role_in_project || '').trim();
    const normalized = normalizeProjectAssignmentRole(rawRole, { allowCustom: true });
    const listed = normalized && PROJECT_ASSIGNMENT_ROLE_SET.has(normalized);
    setEditingAssignment({
      ...member,
      role_in_project: rawRole || normalized || '',
    });
    setAssignForm({
      person_id: String(member.person_id || ''),
      role_in_project: listed ? normalized : (rawRole || normalized ? '__custom__' : ''),
      custom_role: listed ? '' : (normalized || rawRole),
    });
    setAssignOpen(true);
  };
  const [activeTab, setActiveTab] = useState(() => {
    const t = searchParams.get('tab');
    if (!t || t === 'activities') return 'overview';
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
    program_name: '',
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
          program_name: p?.program_name || '',
          client_ids: Array.isArray(p?.client_ids)
            ? p.client_ids.map((cid) => Number(cid)).filter((cid) => Number.isFinite(cid)).slice(0, 1)
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
            const backlogList = await api.backlogs.list({ project_id: id }).catch(() => []);
            setBacklogItems(Array.isArray(backlogList) ? backlogList : []);
          } catch (e) {
            console.warn('workspace backlog:', e?.message || e);
          }

          try {
            const phaseList = await api.projectPhases.list({ project_id: id }).catch(() => []);
            setPhases(Array.isArray(phaseList) ? phaseList : []);
          } catch (e) {
            console.warn('workspace phases:', e?.message || e);
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
    if (tab === 'activities') {
      navigate(`/calendar?project=${encodeURIComponent(id)}`);
      return;
    }
    setActiveTab(tab);
    const next = new URLSearchParams(searchParams);
    if (!tab || tab === 'overview') next.delete('tab');
    else next.set('tab', tab);
    setSearchParams(next, { replace: true });
  }, [id, navigate, searchParams, setSearchParams]);

  useEffect(() => {
    const t = searchParams.get('tab');
    if (t === 'activities') {
      navigate(`/calendar?project=${encodeURIComponent(id)}`, { replace: true });
      return;
    }
    const next = (!t || t === 'activities')
      ? 'overview'
      : (WORKSPACE_TABS.some((x) => x.id === t) ? t : 'overview');
    setActiveTab(next);
  }, [searchParams, id, navigate]);

  const addAssignment = async (e) => {
    e.preventDefault();
    if (!editingAssignment && !assignForm.person_id) return;
    const role =
      assignForm.role_in_project === '__custom__'
        ? String(assignForm.custom_role || '').trim()
        : String(assignForm.role_in_project || '').trim();
    if (!role) {
      alert(assignForm.role_in_project === '__custom__'
        ? 'Please enter a custom role name.'
        : 'Please select a role in project.');
      return;
    }
    await run(async () => {
      try {
        let result;
        if (editingAssignment) {
          result = await api.assignments.update(editingAssignment.id, { role_in_project: role });
        } else {
          result = await api.assignments.create({
            project_id: +id,
            person_id: +assignForm.person_id,
            role_in_project: role,
          });
        }
        closeAssignModal({ force: true });
        load();
        const en = result?.email_notification;
        if (en && en !== 'sent') {
          const hint = {
            no_recipient:
              'Saved. No notification email: add an email for this person on Team, or use the same name as their system user account.',
            smtp_not_configured: 'Saved. Email is not available until SMTP is configured on the server.',
            failed: 'Saved, but the notification email could not be sent. Ask an admin to check server logs.',
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
          program_name: editForm.program_name || null,
          client_ids: editForm.client_ids,
        });
        setProject((prev) => ({
          ...updated,
          // Keep workspace-only fields the lightweight update response omits.
          members: updated.members ?? prev?.members,
          engagement_type: updated?.engagement_type ?? editForm.engagement_type ?? null,
          program_name: updated?.program_name ?? editForm.program_name ?? null,
        }));
        setEditForm({
          name: updated?.name || '',
          description: updated?.description || '',
          status: updated?.status || 'active',
          engagement_type: updated?.engagement_type ?? editForm.engagement_type ?? '',
          program_name: updated?.program_name ?? editForm.program_name ?? '',
          client_ids: Array.isArray(updated?.client_ids)
            ? updated.client_ids.map((cid) => Number(cid)).filter((cid) => Number.isFinite(cid)).slice(0, 1)
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
      program_name: project?.program_name || '',
      client_ids: Array.isArray(project?.client_ids)
        ? project.client_ids.map((cid) => Number(cid)).filter((cid) => Number.isFinite(cid)).slice(0, 1)
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
      program_name: project?.program_name || '',
      client_ids: Array.isArray(project?.client_ids)
        ? project.client_ids.map((cid) => Number(cid)).filter((cid) => Number.isFinite(cid)).slice(0, 1)
        : project?.client_id
          ? [Number(project.client_id)]
          : [],
    });
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

  /** People assigned to this project — used for task/backlog assignee pickers. */
  const projectAssignees = useMemo(() => {
    const byId = new Map((allPeople || []).map((p) => [Number(p.id), p]));
    const seen = new Set();
    const rows = [];
    for (const m of project?.members || []) {
      const pid = Number(m.person_id);
      if (!Number.isFinite(pid) || seen.has(pid)) continue;
      seen.add(pid);
      const roster = byId.get(pid);
      rows.push({
        id: pid,
        name: m.name || roster?.name || `Person #${pid}`,
        email: m.email || roster?.email || null,
        user_id: roster?.user_id ?? null,
      });
    }
    rows.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    return rows;
  }, [project?.members, allPeople]);

  const earnedValue = useMemo(() => earnedValueFromTasks(tasks), [tasks]);

  const tabCounts = useMemo(() => ({
    packages: workPackages.length || null,
    tasks: leafTasks.length,
    people: project?.members?.length ?? 0,
    backlog: backlogItems.filter((b) => OPEN_BACKLOG_STATUSES.has(b.status) && (!packageFilter || b.work_package_id === +packageFilter)).length,
    delivery: phases.filter((p) => p.status !== 'completed' && (!packageFilter || p.work_package_id === +packageFilter)).length,
  }), [leafTasks, project, backlogItems, phases, workPackages, packageFilter]);

  const workspaceTabs = useMemo(() => WORKSPACE_TABS.map((tab) => ({
    id: tab.id,
    label: tr(tab.key),
    badge: tab.id === 'packages' ? (tabCounts.packages || null)
      : tab.id === 'tasks' ? (tabCounts.tasks || null)
      : tab.id === 'backlog' ? (tabCounts.backlog || null)
      : tab.id === 'delivery' ? (tabCounts.delivery || null)
      : tab.id === 'people' ? (tabCounts.people || null)
      : null,
  })), [tabCounts, tr]);

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
  if (loading || !project) return <div className="page-loading">{tr('project.loading')}</div>;

  return (
    <div className="page-module project-workspace">
      <Link to="/projects" className="page-breadcrumb">{tr('project.back')}</Link>

      <PageHeader
        compact={false}
        title={project.name}
        badge={projectHealth && (
          <span className={`pmo-health-badge pmo-health-${projectHealth.health}`}>
            {tr(`health.${projectHealth.health}`) || healthLabel(projectHealth.health)}
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
              {project.program_name && (
                <span className="project-meta-chip">{tr('project.program', { name: project.program_name })}</span>
              )}
              {project.classification && (
                <span className="project-meta-chip" title="Primary delivery scope">{deliveryScopeLabel(project.classification)}</span>
              )}
              {project.client_name && (
                <span className="project-meta-chip">Client: {project.client_name}</span>
              )}
              {(project.start_date || project.end_date) && (
                <span className="project-meta-chip">
                  {formatProjectDate(project.start_date) || '—'} → {formatProjectDate(project.end_date) || 'Open'}
                </span>
              )}
              {project.is_extended && (
                <span className="project-meta-chip project-meta-chip--eot" title="Extension of Time recorded">
                  EOT ×{project.eot_count || 1}
                  {project.eot_total_days != null ? ` (+${project.eot_total_days}d)` : ''}
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
            {canRemoveProject && (
              <button
                type="button"
                className="btn btn-secondary project-delete-btn"
                onClick={deleteProject}
                disabled={busy}
              >
                {tr('action.deleteProject')}
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
      </div>

      <div className="project-workspace-panels">
      {workPackages.length > 0 && activeTab !== 'packages' && activeTab !== 'overview' && activeTab !== 'delivery' && (
        <div className="card section-card module-toolbar-card">
          <div className="module-toolbar">
            <div className="module-toolbar__field">
              <span className="module-toolbar__label">{PHASE_UI.singular}</span>
              <div className="chip-group">
                <button type="button" className={`chip-filter ${!packageFilter ? 'active' : ''}`} onClick={() => setPackageFilter('')}>{PHASE_UI.filterAll}</button>
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
        <div className="ui-card section-card" style={{ padding: '1rem 1.15rem', marginBottom: '1rem' }}>
          <h2 className="section-card__title">Activity</h2>
          <ProjectActivityFeed projectId={id} />
        </div>
      )}

      {activeTab === 'overview' && (
        <ProjectEotPanel
          project={project}
          canManage={canManage}
          onUpdated={(updated) => {
            setProject((prev) => ({
              ...prev,
              ...updated,
              members: updated.members ?? prev?.members,
            }));
          }}
        />
      )}

      {activeTab === 'overview' && (
        <div className={`ui-card section-card project-details-card${editOpen ? ' project-details-card--editing' : ''}`}>
          <div className="section-card__header section-card__header--compact">
            <div>
              <h2 className="section-card__title">Project details</h2>
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
                  <span className="project-details-item__label">Program</span>
                  <input
                    type="text"
                    value={editForm.program_name}
                    onChange={(e) => setEditForm((f) => ({ ...f, program_name: e.target.value }))}
                    className="ui-input form-field__input"
                    placeholder="e.g. Digital transformation"
                  />
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
                  <span className="project-details-item__label">Client</span>
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
                <dt>Program</dt>
                <dd>
                  {project.program_name
                    ? project.program_name
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
                <dt>Client</dt>
                <dd>
                  {projectClientNames.length ? (
                    <Link to="/clients" className="pmo-link-strong">{projectClientNames[0]}</Link>
                  ) : (
                    <span className="project-details-item__muted">No company linked</span>
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
          <div className="pmo-overview-kpi" title="Earned value from task hours">
            <span className="pmo-overview-kpi-label">CPI / SPI</span>
            <span className="pmo-overview-kpi-value">
              {earnedValue.cpi != null ? earnedValue.cpi : '—'} / {earnedValue.spi != null ? earnedValue.spi : '—'}
            </span>
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
                  </li>
                ))}
              </ul>
            )}
            <div className="project-overview-actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => changeTab('people')}>Manage team</button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'people' && (
        <div className="ui-card section-card project-people-panel">
          <div className="section-card__header section-card__header--compact">
            <div>
              <h2 className="section-card__title">Team assigned to this project</h2>
              {project.members?.length > 0 && (
                <p className="section-card__desc">
                  {project.members.length} member{project.members.length === 1 ? '' : 's'}
                </p>
              )}
            </div>
            {canManage && (
              <div className="card-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={openAssignModal}
                  disabled={busy}
                >
                  + Assign member
                </button>
              </div>
            )}
          </div>
          {!project.members?.length ? (
            <div className="project-people-empty">
              <p>No team members on this project yet.</p>
            </div>
          ) : (
            <div className="table-wrap pmo-data-list-wrap pmo-data-list-wrap--sticky pmo-data-list-wrap--comfortable project-people-table">
              <table className="pmo-data-list pmo-portfolio-table project-people-table__grid">
                <colgroup>
                  <col className="col-name" />
                  <col className="col-role" />
                  {canManage && <col className="col-actions" />}
                </colgroup>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Role</th>
                    {canManage && <th className="table-actions-col">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {project.members.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <Link to="/team" className="pmo-link-strong">{m.name}</Link>
                      </td>
                      <td>{m.role_in_project || '–'}</td>
                      {canManage && (
                        <td className="table-actions-col">
                          <div className="pmo-row-actions">
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm project-people-edit"
                              onClick={() => openEditRoleModal(m)}
                              disabled={busy}
                              aria-label={`Edit role for ${m.name}`}
                              title="Edit role"
                            >
                              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                <path d="M12 20h9" />
                                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm project-people-remove"
                              onClick={() => removeAssignment(m.id)}
                              disabled={busy}
                              aria-label={`Remove ${m.name}`}
                              title={`Remove ${m.name}`}
                            >
                              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                <path d="M10 11v6" />
                                <path d="M14 11v6" />
                                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {assignOpen && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="project-assign-title"
          >
            <div className="modal-dialog-header project-create-header">
              <h2 id="project-assign-title" className="modal-dialog-title">
                {editingAssignment ? 'Edit role' : 'Assign team member'}
              </h2>
              <button
                type="button"
                className="modal-dialog-close"
                onClick={closeAssignModal}
                disabled={busy}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <form className="project-create-form" onSubmit={addAssignment}>
              <div className="project-create-panel form-stack">
                {editingAssignment ? (
                  <>
                    <div className="form-field">
                      <span className="form-field__label">Person</span>
                      <p className="form-field__static">{editingAssignment.name}</p>
                    </div>
                    <div className="form-field">
                      <span className="form-field__label">Current role</span>
                      <p className="form-field__static">
                        {editingAssignment.role_in_project || '—'}
                      </p>
                    </div>
                  </>
                ) : (
                  <label className="form-field">
                    <span className="form-field__label">Person <span className="form-field__required">*</span></span>
                    <select
                      value={assignForm.person_id}
                      onChange={(e) => setAssignForm((f) => ({ ...f, person_id: e.target.value }))}
                      required
                      className="form-field__input ui-input"
                      autoFocus
                    >
                      <option value="">Select...</option>
                      {people.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}{p.project_count > 0 ? ` (${p.project_count} projects)` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="form-field">
                  <span className="form-field__label">
                    {editingAssignment ? 'Change role to' : 'Role in project'}{' '}
                    <span className="form-field__required">*</span>
                  </span>
                  <select
                    value={assignForm.role_in_project}
                    onChange={(e) => setAssignForm((f) => ({
                      ...f,
                      role_in_project: e.target.value,
                      custom_role: e.target.value === '__custom__' ? f.custom_role : '',
                    }))}
                    required
                    className="form-field__input ui-input"
                    autoFocus={!!editingAssignment}
                  >
                    <option value="">Select role…</option>
                    {PROJECT_ASSIGNMENT_ROLES.map((role) => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                    <option value="__custom__">Other (create new role)…</option>
                  </select>
                </label>
                {assignForm.role_in_project === '__custom__' && (
                  <label className="form-field">
                    <span className="form-field__label">
                      {editingAssignment ? 'Role name' : 'New role name'}{' '}
                      <span className="form-field__required">*</span>
                    </span>
                    <input
                      type="text"
                      value={assignForm.custom_role}
                      onChange={(e) => setAssignForm((f) => ({ ...f, custom_role: e.target.value }))}
                      placeholder="e.g. Scrum Master, DevOps"
                      maxLength={80}
                      required
                      className="form-field__input ui-input"
                    />
                  </label>
                )}
                <div className="form-actions">
                  <button type="button" className="btn btn-secondary" onClick={closeAssignModal} disabled={busy}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={busy}>
                    {busy
                      ? (editingAssignment ? 'Saving…' : 'Assigning…')
                      : (editingAssignment ? 'Save role' : 'Assign')}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'backlog' && (
        <div className="ui-card section-card">
          <ProjectBacklogPanel
            projectId={+id}
            people={projectAssignees}
            workPackages={workPackages}
            workPackageFilter={packageFilter}
            canManage={canManage}
            openBacklogId={searchParams.get('backlog')}
            onPromoted={async (task) => {
              try {
                const [taskList, backlogList] = await Promise.all([
                  api.projectTasks.list({ project_id: id }).catch(() => []),
                  api.backlogs.list({ project_id: id }).catch(() => []),
                ]);
                setTasks(Array.isArray(taskList) ? taskList : []);
                setBacklogItems(Array.isArray(backlogList) ? backlogList : []);
              } catch (e) {
                console.warn('reload after promote:', e?.message || e);
              }
              // Clear phase filter so the new task is not hidden.
              if (packageFilter) setPackageFilter('');
              changeTab('tasks');
              const label = task?.name || 'Task';
              const when = task?.planned_start_date && task?.planned_end_date
                ? `\nPlan: ${task.planned_start_date} → ${task.planned_end_date}`
                : '';
              alert(`Task created: ${label}${when}\n\nSwitched to the Tasks tab.`);
            }}
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

      {activeTab === 'raid' && (
        <div className="ui-card section-card" style={{ padding: '1rem 1.15rem' }}>
          <ProjectRaidPanel projectId={id} people={projectAssignees} canManage={canManage} />
        </div>
      )}

      {activeTab === 'tasks' && (
        <ProjectTasksPanel
          projectId={id}
          tasks={tasks}
          workPackages={workPackages}
          packageFilter={packageFilter}
          allPeople={projectAssignees}
          rosterPeople={allPeople}
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
