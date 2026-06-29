import { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { canAssignIssues, personIdForUser } from '../../lib/permissions.js';
import PageHeader from '../components/PageHeader';
import UiEmptyState from '../components/UiEmptyState';
import PageLoadError from '../components/PageLoadError';
import PageLoadingState from '../components/PageLoadingState';
import EntityAttachments from '../components/EntityAttachments';
import { useSubmitLock } from '../hooks/useSubmitLock';
import { priorityClass, levelClass } from '../utils/issueUi';
import {
  ISSUE_STATUSES,
  ISSUE_PRIORITIES,
  ISSUE_CATEGORIES,
  HELPDESK_LEVEL_FILTERS,
  ISSUE_RESOLUTION_METHODS,
  ISSUE_INCIDENT_TYPES,
  ISSUE_INTAKE_CHANNELS,
  EPBT_MODULES,
  resolutionMethodLabel,
  incidentTypeLabel,
  intakeChannelLabel,
} from '../../lib/issueConstants.js';
import {
  OPEN_ISSUE_STATUSES,
  nextSupportLevel,
  supportLevelLabel,
} from '../../lib/issueWorkflow.js';

function statusLabel(id) {
  return ISSUE_STATUSES.find((s) => s.id === id)?.label || id;
}

function helpdeskStageShortLabel(issue) {
  return issue.helpdesk_stage_label
    || (issue.helpdesk_stage === 'backlog' ? 'Backlog' : (issue.helpdesk_stage || issue.support_level || 'L1'));
}

export default function Issues() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const mayAssign = canAssignIssues(user);
  const [issues, setIssues] = useState([]);
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [people, setPeople] = useState([]);
  const [backlogs, setBacklogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [filter, setFilter] = useState('open');
  const [levelFilter, setLevelFilter] = useState('all');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [incidentFilter, setIncidentFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [mineOnly, setMineOnly] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [promoteIssue, setPromoteIssue] = useState(null);
  const [promoteProjectId, setPromoteProjectId] = useState('');
  const [promoteAssignee, setPromoteAssignee] = useState('');
  const [escalateIssue, setEscalateIssue] = useState(null);
  const [escalateAssignee, setEscalateAssignee] = useState('');
  const [escalateNote, setEscalateNote] = useState('');
  const [resolveIssue, setResolveIssue] = useState(null);
  const [resolveMethod, setResolveMethod] = useState('whatsapp');
  const [resolveNotes, setResolveNotes] = useState('');
  const [resolveAction, setResolveAction] = useState('');
  const [form, setForm] = useState({
    title: '',
    description: '',
    priority: 'medium',
    category: 'support',
    incident_type: 'issue',
    module_code: 'CK',
    intake_channel: 'helpdesk',
    client_pic: '',
    project_id: '',
    client_id: '',
    assignee_person_id: '',
    external_ticket_ref: '',
    backlog_ref: '',
    issue_attachment_ref: '',
  });
  const { pending: saving, run } = useSubmitLock();

  const myPersonId = useMemo(() => personIdForUser(user, people), [user, people]);

  const isAssignee = (issue) => myPersonId != null && issue.assignee_person_id === myPersonId;

  const canEscalate = (issue) => {
    if ((issue.helpdesk_stage || issue.support_level || 'L1') !== 'L1') return false;
    if (!OPEN_ISSUE_STATUSES.has(issue.status)) return false;
    return mayAssign || isAssignee(issue);
  };

  const canResolve = (issue) => {
    if (!OPEN_ISSUE_STATUSES.has(issue.status)) return false;
    return mayAssign || isAssignee(issue);
  };

  const load = () => {
    setLoading(true);
    setLoadError(null);
    Promise.all([
      api.issues.list(mineOnly ? { mine: '1' } : {}),
      api.projects.list(),
      api.clients.list(),
      api.people.list(),
      api.backlogs.list(),
    ])
      .then(([iss, pr, cl, pe, bl]) => {
        setIssues(iss);
        setProjects(pr);
        setClients(cl);
        setPeople(pe);
        setBacklogs(bl);
      })
      .catch((err) => setLoadError(err.message || 'Failed to load helpdesk'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [mineOnly]);

  const selectedIssueId = searchParams.get('issue') ? +searchParams.get('issue') : null;
  const selectedIssue = useMemo(
    () => issues.find((i) => i.id === selectedIssueId) || null,
    [issues, selectedIssueId],
  );

  const openIssue = (issue) => {
    const next = new URLSearchParams(searchParams);
    next.set('issue', String(issue.id));
    setSearchParams(next, { replace: true });
  };

  const closeIssue = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('issue');
    setSearchParams(next, { replace: true });
  };

  const stats = useMemo(() => {
    const open = issues.filter((i) => OPEN_ISSUE_STATUSES.has(i.status));
    return {
      open: open.length,
      critical: open.filter((i) => i.priority === 'critical').length,
      waiting: issues.filter((i) => i.status === 'waiting_agency').length,
      resolved: issues.filter((i) => i.status === 'resolved' || i.status === 'closed').length,
      l1: open.filter((i) => i.helpdesk_stage === 'L1').length,
      l2: open.filter((i) => i.helpdesk_stage === 'L2').length,
      backlog: open.filter((i) => i.helpdesk_stage === 'backlog').length,
    };
  }, [issues]);

  const visible = useMemo(() => {
    let list = issues;
    if (filter === 'open') list = list.filter((i) => OPEN_ISSUE_STATUSES.has(i.status));
    else if (filter !== 'all') list = list.filter((i) => i.status === filter);
    if (levelFilter !== 'all') list = list.filter((i) => i.helpdesk_stage === levelFilter);
    if (moduleFilter !== 'all') list = list.filter((i) => (i.module_code || 'XXX') === moduleFilter);
    if (incidentFilter !== 'all') list = list.filter((i) => i.incident_type === incidentFilter);
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((i) => (
        String(i.ticket_no || '').toLowerCase().includes(q)
        || String(i.title || '').toLowerCase().includes(q)
        || String(i.external_ticket_ref || '').toLowerCase().includes(q)
        || String(i.backlog_ref || '').toLowerCase().includes(q)
        || String(i.client_name || '').toLowerCase().includes(q)
      ));
    }
    return list;
  }, [issues, filter, levelFilter, moduleFilter, incidentFilter, searchQuery]);

  const hasExtraFilters = levelFilter !== 'all'
    || moduleFilter !== 'all'
    || incidentFilter !== 'all'
    || filter !== 'open'
    || searchQuery.trim() !== '';

  const resetFilters = () => {
    setFilter('open');
    setLevelFilter('all');
    setModuleFilter('all');
    setIncidentFilter('all');
    setSearchQuery('');
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    await run(async () => {
      try {
        await api.issues.create({
          ...form,
          project_id: form.project_id || null,
          client_id: form.client_id || null,
          assignee_person_id: form.assignee_person_id || null,
          external_ticket_ref: form.external_ticket_ref || null,
        });
        setShowForm(false);
        setForm({
          title: '', description: '', priority: 'medium', category: 'support',
          incident_type: 'issue', module_code: 'CK', intake_channel: 'helpdesk', client_pic: '',
          project_id: '', client_id: '', assignee_person_id: '', external_ticket_ref: '',
          issue_attachment_ref: '', backlog_ref: '',
        });
        load();
      } catch (err) {
        alert(err.message);
      }
    });
  };

  const backlogByIssue = useMemo(() => {
    const map = new Map();
    backlogs.forEach((b) => {
      if (b.issue_id) map.set(b.issue_id, b);
    });
    return map;
  }, [backlogs]);

  const promoteToBacklog = (issue) => {
    if (!issue.can_promote_backlog) {
      alert('This issue cannot be promoted (closed or already in backlog).');
      return;
    }
    setPromoteIssue(issue);
    setPromoteProjectId(
      issue.project_id ? String(issue.project_id) : (projects[0]?.id ? String(projects[0].id) : ''),
    );
    setPromoteAssignee(issue.assignee_person_id ? String(issue.assignee_person_id) : '');
  };

  const runPromote = async (issue, projectId, assigneePersonId) => {
    await run(async () => {
      try {
        const res = await api.issues.promoteToBacklog(issue.id, {
          project_id: projectId,
          assignee_person_id: assigneePersonId,
        });
        setPromoteIssue(null);
        closeIssue();
        const msg = res.created === false
          ? `Linked to existing backlog: ${res.backlog?.ref_no}`
          : `Backlog created: ${res.backlog?.ref_no}`;
        alert(msg);
        load();
      } catch (err) {
        alert(err.message);
      }
    });
  };

  const confirmPromote = (e) => {
    e.preventDefault();
    if (!promoteIssue || !promoteProjectId || !promoteAssignee) return;
    runPromote(promoteIssue, +promoteProjectId, +promoteAssignee);
  };

  const openEscalate = (issue) => {
    setEscalateIssue(issue);
    setEscalateAssignee('');
    setEscalateNote('');
  };

  const confirmEscalate = async (e) => {
    e.preventDefault();
    if (!escalateIssue || !escalateAssignee) return;
    await run(async () => {
      try {
        await api.issues.escalate(escalateIssue.id, {
          assignee_person_id: +escalateAssignee,
          note: escalateNote || undefined,
        });
        setEscalateIssue(null);
        closeIssue();
        load();
      } catch (err) {
        alert(err.message);
      }
    });
  };

  const openResolve = (issue) => {
    setResolveIssue(issue);
    setResolveMethod(issue.intake_channel === 'call' ? 'call' : (issue.intake_channel || 'whatsapp'));
    setResolveNotes('');
    setResolveAction(issue.action_taken || '');
  };

  const runImportEticket = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setImporting(true);
      try {
        const csv = await file.text();
        const res = await api.issues.importEticket(csv);
        alert(`Import selesai: ${res.imported} rekod, ${res.skipped} dilangkau.`);
        load();
      } catch (err) {
        alert(err.message);
      } finally {
        setImporting(false);
      }
    };
    input.click();
  };

  const confirmResolve = async (e) => {
    e.preventDefault();
    if (!resolveIssue || !resolveMethod) return;
    await run(async () => {
      try {
        await api.issues.resolve(resolveIssue.id, {
          resolution_method: resolveMethod,
          resolution_notes: resolveNotes || undefined,
          action_taken: resolveAction || undefined,
        });
        setResolveIssue(null);
        closeIssue();
        load();
      } catch (err) {
        alert(err.message);
      }
    });
  };

  const patchIssue = async (id, partial) => {
    try {
      await api.issues.update(id, partial);
      load();
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading) return <PageLoadingState message="Loading helpdesk…" />;
  if (loadError) return <PageLoadError message={loadError} onRetry={load} />;

  const nextLevelFor = (issue) => nextSupportLevel(issue.support_level);

  return (
    <div className="page-module helpdesk-page">
      <PageHeader
        eyebrow="Service desk"
        title="Helpdesk"
        badge={stats.open > 0 ? `${stats.open} open` : null}
        subtitle="Track client tickets from external QA helpdesk. Resolve at L1 or L2, or promote to product backlog when dev/data work is needed."
        actions={
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {mayAssign && (
              <button type="button" className="btn btn-secondary" onClick={runImportEticket} disabled={importing || saving}>
                {importing ? 'Importing…' : 'Import eTicket CSV'}
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={() => setShowForm(true)}>
              + Log ticket
            </button>
          </div>
        }
      />

      <div className="helpdesk-workflow-banner card section-card" role="note">
        <p>
          <strong>Support flow:</strong>{' '}
          <span className={levelClass('L1')}>1st level</span>
          {' → '}
          <span className={levelClass('L2')}>2nd level</span>
          {' → '}
          <span className={levelClass('backlog')}>Backlog</span>
          . Resolve at L1/L2, or use <strong>→ Backlog</strong> when dev/data work is needed.
        </p>
      </div>

      <section className="dashboard-stats kpi-strip helpdesk-kpis" aria-label="Helpdesk summary">
        <div className="dashboard-stat-card">
          <span className="dashboard-stat-label">Open</span>
          <span className="dashboard-stat-value">{stats.open}</span>
          <span className="dashboard-stat-hint">Needs action</span>
        </div>
        <div className={`dashboard-stat-card ${stats.critical ? 'has-issue' : ''}`}>
          <span className="dashboard-stat-label">Critical</span>
          <span className="dashboard-stat-value pmo-stat-danger">{stats.critical}</span>
          <span className="dashboard-stat-hint">Highest priority</span>
        </div>
        <div className="dashboard-stat-card">
          <span className="dashboard-stat-label">1st level</span>
          <span className="dashboard-stat-value">{stats.l1}</span>
          <span className="dashboard-stat-hint">Frontline</span>
        </div>
        <div className="dashboard-stat-card">
          <span className="dashboard-stat-label">2nd level</span>
          <span className="dashboard-stat-value">{stats.l2}</span>
          <span className="dashboard-stat-hint">Escalated support</span>
        </div>
        <div className="dashboard-stat-card">
          <span className="dashboard-stat-label">Backlog</span>
          <span className="dashboard-stat-value pmo-stat-warning">{stats.backlog}</span>
          <span className="dashboard-stat-hint">Dev / data</span>
        </div>
      </section>

      <div className="card section-card helpdesk-toolbar-card">
        <div className="module-toolbar helpdesk-toolbar helpdesk-toolbar--compact">
          <label className="module-toolbar__field module-toolbar__field--grow">
            <span className="module-toolbar__label">Search</span>
            <input
              type="search"
              className="form-field__input helpdesk-filter-input"
              placeholder="Ticket, title, client ref, PBLID…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </label>
          <label className="module-toolbar__field">
            <span className="module-toolbar__label">Status</span>
            <select className="form-field__input helpdesk-filter-input" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="open">Open (active)</option>
              <option value="all">All statuses</option>
              {ISSUE_STATUSES.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </label>
          <label className="module-toolbar__field">
            <span className="module-toolbar__label">Level</span>
            <select className="form-field__input helpdesk-filter-input" value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)}>
              <option value="all">All levels</option>
              {HELPDESK_LEVEL_FILTERS.map((l) => (
                <option key={l.id} value={l.id}>{l.label}</option>
              ))}
            </select>
          </label>
          <label className="module-toolbar__field">
            <span className="module-toolbar__label">Module</span>
            <select className="form-field__input helpdesk-filter-input" value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)}>
              <option value="all">All modules</option>
              {EPBT_MODULES.map((m) => (
                <option key={m.code} value={m.code}>{m.code} — {m.label}</option>
              ))}
            </select>
          </label>
          <label className="module-toolbar__field">
            <span className="module-toolbar__label">Type</span>
            <select className="form-field__input helpdesk-filter-input" value={incidentFilter} onChange={(e) => setIncidentFilter(e.target.value)}>
              <option value="all">All types</option>
              {ISSUE_INCIDENT_TYPES.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </label>
          <label className="module-toolbar__field">
            <span className="module-toolbar__label">View</span>
            <select
              className="form-field__input helpdesk-filter-input"
              value={mineOnly ? 'mine' : 'all'}
              onChange={(e) => setMineOnly(e.target.value === 'mine')}
            >
              <option value="all">All tickets</option>
              <option value="mine">My tickets</option>
            </select>
          </label>
          {hasExtraFilters && (
            <button type="button" className="btn btn-ghost btn-sm helpdesk-filter-reset" onClick={resetFilters}>
              Reset filters
            </button>
          )}
        </div>
        <p className="helpdesk-filter-summary" aria-live="polite">
          Showing {visible.length} of {issues.length} tickets
        </p>
      </div>

      <div className="card section-card pmo-data-list-card pmo-data-list-card--fluid">
        {visible.length === 0 ? (
          <UiEmptyState
            title="No issues match this filter"
            action={<button type="button" className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>+ Log ticket</button>}
          />
        ) : (
          <>
          <div className="table-wrap pmo-data-list-wrap pmo-data-list-wrap--sticky pmo-data-list-wrap--comfortable">
            <table className="pmo-data-list pmo-portfolio-table helpdesk-table">
              <colgroup>
                <col className="col-ticket" />
                <col className="col-narrow" />
                <col className="col-narrow" />
                <col className="col-issue" />
                <col className="col-priority" />
                <col className="col-status" />
                <col className="col-dates hide-mobile" />
                <col className="col-package hide-mobile" />
                <col className="col-assignee" />
                <col className="col-actions" />
              </colgroup>
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Mod</th>
                  <th>Level</th>
                  <th className="pmo-data-list__col-primary">Issue</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th className="hide-mobile">Client ref</th>
                  <th className="hide-mobile">Project</th>
                  <th>Assignee</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((issue) => (
                  <tr key={issue.id} className={selectedIssueId === issue.id ? 'helpdesk-row--selected' : ''}>
                    <td className="helpdesk-ticket">{issue.ticket_no}</td>
                    <td>
                      <span className="project-meta-chip" title={issue.epbt_module_label || issue.epbt_module}>
                        {issue.module_code || '—'}
                      </span>
                    </td>
                    <td>
                      <span className={levelClass(issue.helpdesk_stage)} title={issue.helpdesk_stage_label || supportLevelLabel(issue.support_level)}>
                        {helpdeskStageShortLabel(issue)}
                      </span>
                    </td>
                    <td className="pmo-data-list__primary">
                      <button type="button" className="helpdesk-title helpdesk-title--link" onClick={() => openIssue(issue)}>
                        {issue.title}
                      </button>
                      <div className="pmo-table-muted">
                        {incidentTypeLabel(issue.incident_type) || ISSUE_CATEGORIES.find((c) => c.id === issue.category)?.label}
                        {issue.intake_channel && ` · ${intakeChannelLabel(issue.intake_channel)}`}
                        {issue.client_name && ` · ${issue.client_name}`}
                      </div>
                    </td>
                    <td>
                      <span className={`issue-priority ${priorityClass(issue.priority)}`}>{issue.priority}</span>
                    </td>
                    <td>
                      {mayAssign ? (
                        <select
                          className="pmo-cell-select gantt-input gantt-input--select helpdesk-select"
                          value={issue.status}
                          onChange={(e) => patchIssue(issue.id, { status: e.target.value })}
                        >
                          {ISSUE_STATUSES.map((s) => (
                            <option key={s.id} value={s.id}>{s.label}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="project-meta-chip">{statusLabel(issue.status)}</span>
                      )}
                    </td>
                    <td className="hide-mobile helpdesk-ext-ref">
                      {issue.external_ticket_ref || '—'}
                    </td>
                    <td className="hide-mobile">
                      {issue.project_id ? (
                        <Link to={`/projects/${issue.project_id}`} className="pmo-link-strong">{issue.project_name}</Link>
                      ) : '—'}
                    </td>
                    <td>
                      {mayAssign ? (
                        <select
                          className="pmo-cell-select gantt-input gantt-input--select helpdesk-select"
                          value={issue.assignee_person_id || ''}
                          onChange={(e) => patchIssue(issue.id, {
                            assignee_person_id: e.target.value ? +e.target.value : null,
                          })}
                        >
                          <option value="">Unassigned</option>
                          {people.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      ) : (
                        issue.assignee_name || '—'
                      )}
                    </td>
                    <td className="table-actions-col pmo-row-actions">
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => openIssue(issue)}>View</button>
                      {backlogByIssue.has(issue.id) ? (
                        <Link
                          to={`/projects/${backlogByIssue.get(issue.id).project_id}?tab=backlog`}
                          className="btn btn-ghost btn-sm"
                        >
                          {backlogByIssue.get(issue.id).ref_no}
                        </Link>
                      ) : (
                        <>
                          {canResolve(issue) && (
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => openResolve(issue)} disabled={saving}>
                              Solved
                            </button>
                          )}
                          {canEscalate(issue) && (
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEscalate(issue)} disabled={saving}>
                              → {nextLevelFor(issue)}
                            </button>
                          )}
                          {issue.can_promote_backlog && (
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => promoteToBacklog(issue)}
                              disabled={saving}
                            >
                              → Backlog
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="pmo-data-list-footer pmo-data-list-footer--scroll-hint" aria-live="polite">
            Showing {visible.length} of {issues.length} tickets
          </p>
          </>
        )}
      </div>

      {selectedIssue && (
        <div className="modal-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && closeIssue()}>
          <div className="modal-dialog modal-dialog--project-create helpdesk-detail-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modal-dialog-header project-create-header">
              <div>
                <p className="project-create-eyebrow">{selectedIssue.ticket_no}</p>
                <h2 className="modal-dialog-title">{selectedIssue.title}</h2>
                <p className="project-create-subtitle">
                  <span className={levelClass(selectedIssue.helpdesk_stage)}>{selectedIssue.helpdesk_stage_label || supportLevelLabel(selectedIssue.support_level)}</span>
                  {' · '}
                  {statusLabel(selectedIssue.status)}
                  {selectedIssue.project_name && ` · ${selectedIssue.project_name}`}
                </p>
              </div>
              <button type="button" className="modal-dialog-close" onClick={closeIssue} aria-label="Close">×</button>
            </div>
            <div className="project-create-panel helpdesk-detail-body">
              <div className="helpdesk-detail-meta helpdesk-detail-meta--top">
                {selectedIssue.module_code && (
                  <span className="project-meta-chip" title={selectedIssue.epbt_module_label || selectedIssue.epbt_module}>
                    {selectedIssue.module_code}
                    {selectedIssue.epbt_module && selectedIssue.epbt_module !== selectedIssue.module_code
                      ? ` · ${selectedIssue.epbt_module}`
                      : ''}
                  </span>
                )}
                {selectedIssue.incident_type && (
                  <span className="project-meta-chip">{incidentTypeLabel(selectedIssue.incident_type)}</span>
                )}
                {selectedIssue.intake_channel && (
                  <span className="project-meta-chip">{intakeChannelLabel(selectedIssue.intake_channel)}</span>
                )}
              </div>
              {selectedIssue.external_ticket_ref && (
                <div className="form-field">
                  <span className="form-field__label">External helpdesk ref</span>
                  <p className="helpdesk-detail-desc helpdesk-ext-ref">{selectedIssue.external_ticket_ref}</p>
                </div>
              )}
              {(selectedIssue.client_pic || selectedIssue.l1_assignee_label || selectedIssue.l2_assignee_label) && (
                <div className="form-row form-row-2">
                  {selectedIssue.client_pic && (
                    <div className="form-field">
                      <span className="form-field__label">Client PIC</span>
                      <p className="helpdesk-detail-desc">{selectedIssue.client_pic}</p>
                    </div>
                  )}
                  {selectedIssue.l1_assignee_label && (
                    <div className="form-field">
                      <span className="form-field__label">1st level (eTicket)</span>
                      <p className="helpdesk-detail-desc">{selectedIssue.l1_assignee_label}</p>
                    </div>
                  )}
                  {selectedIssue.l2_assignee_label && (
                    <div className="form-field">
                      <span className="form-field__label">2nd level (eTicket)</span>
                      <p className="helpdesk-detail-desc">{selectedIssue.l2_assignee_label}</p>
                    </div>
                  )}
                </div>
              )}
              {selectedIssue.description && (
                <div className="form-field">
                  <span className="form-field__label">Description</span>
                  <p className="helpdesk-detail-desc">{selectedIssue.description}</p>
                </div>
              )}
              {(selectedIssue.resolution_method || selectedIssue.resolution_notes || selectedIssue.action_taken) && (
                <div className="form-field">
                  <span className="form-field__label">Resolution</span>
                  <p className="helpdesk-detail-desc">
                    {resolutionMethodLabel(selectedIssue.resolution_method)}
                    {selectedIssue.resolution_notes && ` — ${selectedIssue.resolution_notes}`}
                  </p>
                  {selectedIssue.action_taken && (
                    <p className="helpdesk-detail-desc helpdesk-detail-desc--sub">
                      <strong>Action taken:</strong> {selectedIssue.action_taken}
                    </p>
                  )}
                </div>
              )}
              {(selectedIssue.backlog_ref || selectedIssue.issue_attachment_ref || selectedIssue.resolution_attachment_ref) && (
                <div className="form-row form-row-2">
                  {selectedIssue.backlog_ref && (
                    <div className="form-field">
                      <span className="form-field__label">Product backlog (PBLID)</span>
                      <p className="helpdesk-detail-desc">
                        {selectedIssue.backlog_project_id ? (
                          <Link
                            to={`/projects/${selectedIssue.backlog_project_id}?tab=backlog`}
                            className="pmo-link-strong"
                          >
                            {selectedIssue.backlog_ref}
                          </Link>
                        ) : (
                          selectedIssue.backlog_ref
                        )}
                      </p>
                    </div>
                  )}
                  {selectedIssue.issue_attachment_ref && (
                    <div className="form-field">
                      <span className="form-field__label">Issue attachment</span>
                      <p className="helpdesk-detail-desc helpdesk-ext-ref">{selectedIssue.issue_attachment_ref}</p>
                    </div>
                  )}
                  {selectedIssue.resolution_attachment_ref && (
                    <div className="form-field">
                      <span className="form-field__label">Resolution attachment</span>
                      <p className="helpdesk-detail-desc helpdesk-ext-ref">{selectedIssue.resolution_attachment_ref}</p>
                    </div>
                  )}
                </div>
              )}
              <EntityAttachments entityType="issue" entityId={selectedIssue.id} title="Attachments & references" />
              <div className="helpdesk-detail-meta">
                <span className={`issue-priority ${priorityClass(selectedIssue.priority)}`}>{selectedIssue.priority}</span>
                <span className="project-meta-chip">{ISSUE_CATEGORIES.find((c) => c.id === selectedIssue.category)?.label}</span>
                {selectedIssue.assignee_name && <span className="project-meta-chip">Assignee: {selectedIssue.assignee_name}</span>}
                {selectedIssue.client_name && <span className="project-meta-chip">{selectedIssue.client_name}</span>}
              </div>
              {mayAssign && (
                <div className="form-row form-row-2 helpdesk-detail-edit">
                  <div className="form-field">
                    <label className="form-field__label">Project</label>
                    <select
                      className="form-field__input"
                      value={selectedIssue.project_id || ''}
                      onChange={(e) => patchIssue(selectedIssue.id, {
                        project_id: e.target.value ? +e.target.value : null,
                      })}
                    >
                      <option value="">— None —</option>
                      {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="form-field">
                    <label className="form-field__label">Client</label>
                    <select
                      className="form-field__input"
                      value={selectedIssue.client_id || ''}
                      onChange={(e) => patchIssue(selectedIssue.id, {
                        client_id: e.target.value ? +e.target.value : null,
                      })}
                    >
                      <option value="">— None —</option>
                      {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="form-field">
                    <label className="form-field__label">External ticket ref</label>
                    <input
                      className="form-field__input"
                      defaultValue={selectedIssue.external_ticket_ref || ''}
                      placeholder="QA helpdesk ticket no."
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v !== (selectedIssue.external_ticket_ref || '')) {
                          patchIssue(selectedIssue.id, { external_ticket_ref: v || null });
                        }
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
            <div className="project-create-footer">
              {selectedIssue.project_id && (
                <Link to={`/projects/${selectedIssue.project_id}`} className="btn btn-secondary">Open project</Link>
              )}
              {canResolve(selectedIssue) && (
                <button type="button" className="btn btn-secondary" onClick={() => openResolve(selectedIssue)} disabled={saving}>
                  Mark solved
                </button>
              )}
              {canEscalate(selectedIssue) && (
                <button type="button" className="btn btn-secondary" onClick={() => openEscalate(selectedIssue)} disabled={saving}>
                  Escalate to {nextLevelFor(selectedIssue)}
                </button>
              )}
              {selectedIssue.can_promote_backlog && !backlogByIssue.has(selectedIssue.id) && (
                <button type="button" className="btn btn-primary" onClick={() => promoteToBacklog(selectedIssue)} disabled={saving}>
                  Promote to backlog
                </button>
              )}
              {backlogByIssue.has(selectedIssue.id) && (
                <Link to={`/projects/${backlogByIssue.get(selectedIssue.id).project_id}?tab=backlog`} className="btn btn-primary">
                  {backlogByIssue.get(selectedIssue.id).ref_no}
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {escalateIssue && (
        <div className="modal-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && setEscalateIssue(null)}>
          <div className="modal-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modal-dialog-header project-create-header">
              <h2 className="modal-dialog-title">Escalate to {nextLevelFor(escalateIssue)}</h2>
              <p className="project-create-subtitle">
                Pass "{escalateIssue.title}" from {supportLevelLabel(escalateIssue.support_level)} to {supportLevelLabel(nextLevelFor(escalateIssue))}.
              </p>
            </div>
            <form className="project-create-form" onSubmit={confirmEscalate}>
              <div className="project-create-panel">
                <div className="form-field">
                  <label className="form-field__label" htmlFor="escalate-assignee">Assign to <span className="form-field__required">*</span></label>
                  <select id="escalate-assignee" className="form-field__input" value={escalateAssignee} onChange={(e) => setEscalateAssignee(e.target.value)} required>
                    <option value="">— Select team member —</option>
                    {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="form-field">
                  <label className="form-field__label" htmlFor="escalate-note">Handover note</label>
                  <textarea id="escalate-note" className="form-field__input form-field__textarea" rows={2} value={escalateNote} onChange={(e) => setEscalateNote(e.target.value)} placeholder="What was tried, client context…" />
                </div>
              </div>
              <div className="project-create-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setEscalateIssue(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving || !escalateAssignee}>Escalate</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {resolveIssue && (
        <div className="modal-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && setResolveIssue(null)}>
          <div className="modal-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modal-dialog-header project-create-header">
              <h2 className="modal-dialog-title">Mark issue solved</h2>
              <p className="project-create-subtitle">Record how "{resolveIssue.title}" was resolved at {resolveIssue.helpdesk_stage_label || supportLevelLabel(resolveIssue.support_level)}.</p>
            </div>
            <form className="project-create-form" onSubmit={confirmResolve}>
              <div className="project-create-panel">
                <div className="form-field">
                  <label className="form-field__label" htmlFor="resolve-method">Resolution method <span className="form-field__required">*</span></label>
                  <select id="resolve-method" className="form-field__input" value={resolveMethod} onChange={(e) => setResolveMethod(e.target.value)} required>
                    {ISSUE_RESOLUTION_METHODS.map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-field">
                  <label className="form-field__label" htmlFor="resolve-action">Action taken</label>
                  <textarea id="resolve-action" className="form-field__input form-field__textarea" rows={3} value={resolveAction} onChange={(e) => setResolveAction(e.target.value)} placeholder="Steps taken, fix applied, or guidance given to client…" />
                </div>
                <div className="form-field">
                  <label className="form-field__label" htmlFor="resolve-notes">Notes</label>
                  <textarea id="resolve-notes" className="form-field__input form-field__textarea" rows={2} value={resolveNotes} onChange={(e) => setResolveNotes(e.target.value)} placeholder="Internal summary (optional)…" />
                </div>
              </div>
              <div className="project-create-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setResolveIssue(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>Mark solved</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {promoteIssue && (
        <div className="modal-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && setPromoteIssue(null)}>
          <div className="modal-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modal-dialog-header project-create-header">
              <h2 className="modal-dialog-title">Promote to product backlog</h2>
              <p className="project-create-subtitle">"{promoteIssue.title}" — select project and assign staff for the backlog item.</p>
            </div>
            <form className="project-create-form" onSubmit={confirmPromote}>
              <div className="project-create-panel">
                <div className="form-field">
                  <label className="form-field__label" htmlFor="promote-project">Project <span className="form-field__required">*</span></label>
                  <select id="promote-project" className="form-field__input" value={promoteProjectId} onChange={(e) => setPromoteProjectId(e.target.value)} required>
                    <option value="">— Select project —</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="form-field">
                  <label className="form-field__label" htmlFor="promote-assignee">Assign to staff <span className="form-field__required">*</span></label>
                  <select id="promote-assignee" className="form-field__input" value={promoteAssignee} onChange={(e) => setPromoteAssignee(e.target.value)} required>
                    <option value="">— Select team member —</option>
                    {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="project-create-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setPromoteIssue(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving || !promoteProjectId || !promoteAssignee}>Promote</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showForm && (
        <div className="modal-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && !saving && setShowForm(false)}>
          <div className="modal-dialog modal-dialog--project-create" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modal-dialog-header project-create-header">
              <div>
                <p className="project-create-eyebrow">Helpdesk · 1st level</p>
                <h2 className="modal-dialog-title">Log client ticket</h2>
                <p className="project-create-subtitle">New tickets start at L1. Link the external QA helpdesk reference if available.</p>
              </div>
              <button type="button" className="modal-dialog-close" onClick={() => setShowForm(false)} aria-label="Close">×</button>
            </div>
            <form className="project-create-form" onSubmit={submit}>
              <div className="project-create-panel">
                <div className="form-field">
                  <label className="form-field__label" htmlFor="issue-title">Issue title <span className="form-field__required">*</span></label>
                  <input id="issue-title" className="form-field__input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required placeholder="e.g. API login fails after deploy" />
                </div>
                <div className="form-field">
                  <label className="form-field__label" htmlFor="issue-ext-ref">External helpdesk ref (No Tiket)</label>
                  <input id="issue-ext-ref" className="form-field__input" value={form.external_ticket_ref} onChange={(e) => setForm((f) => ({ ...f, external_ticket_ref: e.target.value }))} placeholder="e.g. 13203 or QA-HD-2026-0142" />
                </div>
                <div className="form-field">
                  <label className="form-field__label" htmlFor="issue-pblid">Product backlog ref (PBLID)</label>
                  <input id="issue-pblid" className="form-field__input" value={form.backlog_ref} onChange={(e) => setForm((f) => ({ ...f, backlog_ref: e.target.value }))} placeholder="e.g. ABB-1351 — auto-links if exists" />
                </div>
                <div className="form-field">
                  <label className="form-field__label" htmlFor="issue-desc">Description</label>
                  <textarea id="issue-desc" className="form-field__input form-field__textarea" rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Steps to reproduce, impact, references…" />
                </div>
                <div className="form-row form-row-2">
                  <div className="form-field">
                    <label className="form-field__label">ePBTP module</label>
                    <select className="form-field__input" value={form.module_code} onChange={(e) => setForm((f) => ({ ...f, module_code: e.target.value }))}>
                      {EPBT_MODULES.map((m) => (
                        <option key={m.code} value={m.code}>{m.code} — {m.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field">
                    <label className="form-field__label">Incident type</label>
                    <select className="form-field__input" value={form.incident_type} onChange={(e) => setForm((f) => ({ ...f, incident_type: e.target.value }))}>
                      {ISSUE_INCIDENT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-row form-row-2">
                  <div className="form-field">
                    <label className="form-field__label">Intake channel</label>
                    <select className="form-field__input" value={form.intake_channel} onChange={(e) => setForm((f) => ({ ...f, intake_channel: e.target.value }))}>
                      {ISSUE_INTAKE_CHANNELS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                  </div>
                  <div className="form-field">
                    <label className="form-field__label" htmlFor="issue-pic">Client PIC</label>
                    <input id="issue-pic" className="form-field__input" value={form.client_pic} onChange={(e) => setForm((f) => ({ ...f, client_pic: e.target.value }))} placeholder="Name / contact at client" />
                  </div>
                </div>
                <div className="form-field">
                  <label className="form-field__label" htmlFor="issue-attach">Issue attachment ref</label>
                  <input id="issue-attach" className="form-field__input" value={form.issue_attachment_ref} onChange={(e) => setForm((f) => ({ ...f, issue_attachment_ref: e.target.value }))} placeholder="File name or link from client" />
                </div>
                <div className="form-row form-row-2">
                  <div className="form-field">
                    <label className="form-field__label">Category</label>
                    <select className="form-field__input" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                      {ISSUE_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                  </div>
                  <div className="form-field">
                    <label className="form-field__label">Priority</label>
                    <select className="form-field__input" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>
                      {ISSUE_PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-row form-row-2">
                  <div className="form-field">
                    <label className="form-field__label">Project</label>
                    <select className="form-field__input" value={form.project_id} onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value }))}>
                      <option value="">— None / general —</option>
                      {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="form-field">
                    <label className="form-field__label">Client</label>
                    <select className="form-field__input" value={form.client_id} onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}>
                      <option value="">— Select client —</option>
                      {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>
                {mayAssign && (
                  <div className="form-field">
                    <label className="form-field__label">Assign to (L1)</label>
                    <select className="form-field__input" value={form.assignee_person_id} onChange={(e) => setForm((f) => ({ ...f, assignee_person_id: e.target.value }))}>
                      <option value="">— Later —</option>
                      {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <div className="project-create-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)} disabled={saving}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Submitting…' : 'Log ticket'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
