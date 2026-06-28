import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useSubmitLock } from '../hooks/useSubmitLock';
import { useAuth } from '../AuthContext';
import UiEmptyState from './UiEmptyState';
import KpiStrip from './KpiStrip';
import DataListShell from './DataListShell';
import EntityAttachments from './EntityAttachments';
import BacklogDetailModal from './BacklogDetailModal';
import HoursField from './HoursField';
import {
  BACKLOG_TYPES,
  BACKLOG_SOURCES,
  BACKLOG_STATUSES,
  BACKLOG_PRIORITIES,
  OPEN_BACKLOG_STATUSES,
  backlogStatusLabel,
  backlogStatusTone,
} from '../../lib/backlogConstants.js';
import { personIdForUser } from '../../lib/permissions.js';
import { sumHours, formatHours } from '../../lib/hoursUtils.js';

function typeLabel(id) {
  return BACKLOG_TYPES.find((t) => t.id === id)?.label || id;
}

function sourceLabel(id) {
  return BACKLOG_SOURCES.find((s) => s.id === id)?.label || id;
}

function statusLabel(id) {
  return backlogStatusLabel(id);
}

export default function ProjectBacklogPanel({
  projectId,
  people = [],
  workPackages = [],
  workPackageFilter = '',
  canManage = false,
  openBacklogId = null,
}) {
  const { user } = useAuth();
  const myPersonId = personIdForUser(user, people);
  const [items, setItems] = useState([]);
  const [phases, setPhases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('all');
  const [filterSource, setFilterSource] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [attachItem, setAttachItem] = useState(null);
  const [detailItem, setDetailItem] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    item_type: 'scope',
    source: 'manual',
    priority: 'medium',
    assignee_person_id: '',
    estimated_hours: '',
    actual_hours: '',
    phase_id: '',
    work_package_id: '',
  });
  const { pending: busy, run } = useSubmitLock();

  const load = () => {
    setLoading(true);
    Promise.all([
      api.backlogs.list({ project_id: projectId }),
      api.projectPhases.list({ project_id: projectId }),
    ])
      .then(([bl, ph]) => {
        setItems(bl);
        setPhases(ph);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [projectId, workPackageFilter]);

  useEffect(() => {
    if (!openBacklogId || !items.length) return;
    const found = items.find((b) => b.id === +openBacklogId);
    if (found) setDetailItem(found);
  }, [openBacklogId, items]);

  const canUpdateItem = (item) => canManage || (myPersonId != null && item.assignee_person_id === myPersonId);

  const packagePhases = useMemo(() => {
    if (!workPackageFilter) return phases;
    return phases.filter((p) => p.work_package_id === +workPackageFilter);
  }, [phases, workPackageFilter]);

  const stats = useMemo(() => {
    const openItems = items.filter((b) => OPEN_BACKLOG_STATUSES.has(b.status));
    return {
      open: openItems.length,
      cr: items.filter((b) => b.item_type === 'cr' && OPEN_BACKLOG_STATUSES.has(b.status)).length,
      bugs: items.filter((b) => ['bug', 'defect'].includes(b.item_type) && OPEN_BACKLOG_STATUSES.has(b.status)).length,
      recurring: items.filter((b) => b.item_type === 'recurring' || b.source === 'recurring').length,
      estHours: Math.round(sumHours(openItems, 'estimated_hours') * 10) / 10,
      actHours: Math.round(sumHours(openItems, 'actual_hours') * 10) / 10,
    };
  }, [items]);

  const visible = useMemo(() => {
    let list = items;
    if (workPackageFilter) list = list.filter((b) => b.work_package_id === +workPackageFilter);
    if (filterType !== 'all') list = list.filter((b) => b.item_type === filterType);
    if (filterSource !== 'all') list = list.filter((b) => b.source === filterSource);
    if (filterStatus !== 'all') list = list.filter((b) => b.status === filterStatus);
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((b) => (
        String(b.ref_no || '').toLowerCase().includes(q)
        || String(b.title || '').toLowerCase().includes(q)
        || String(b.issue_ticket_no || '').toLowerCase().includes(q)
        || String(b.issue_external_ticket_ref || '').toLowerCase().includes(q)
      ));
    }
    return list;
  }, [items, filterType, filterSource, filterStatus, workPackageFilter, searchQuery]);

  const handleItemUpdated = (updated) => {
    setItems((prev) => prev.map((b) => (b.id === updated.id ? { ...b, ...updated } : b)));
    setDetailItem((prev) => (prev?.id === updated.id ? { ...prev, ...updated } : prev));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    await run(async () => {
      try {
        await api.backlogs.create({
          project_id: +projectId,
          title: form.title.trim(),
          description: form.description || null,
          item_type: form.item_type,
          source: form.source,
          priority: form.priority,
          assignee_person_id: form.assignee_person_id || null,
          estimated_hours: form.estimated_hours || null,
          actual_hours: form.actual_hours || null,
          phase_id: form.phase_id || null,
          work_package_id: form.work_package_id || workPackageFilter || null,
        });
        setShowForm(false);
        setForm({
          title: '', description: '', item_type: 'scope', source: 'manual',
          priority: 'medium', assignee_person_id: '', estimated_hours: '', actual_hours: '', phase_id: '', work_package_id: workPackageFilter || '',
        });
        load();
      } catch (err) {
        alert(err.message);
      }
    });
  };

  const patchItem = async (id, partial) => {
    try {
      const updated = await api.backlogs.update(id, partial);
      handleItemUpdated(updated);
    } catch (err) {
      alert(err.message);
    }
  };

  const promoteTask = async (item) => {
    if (!confirm(`Promote "${item.title}" to task?`)) return;
    await run(async () => {
      try {
        const res = await api.backlogs.promoteToTask(item.id, {
          assignee_id: item.assignee_person_id || null,
        });
        alert(`Task created: ${res.task?.name || 'OK'}`);
        load();
      } catch (err) {
        alert(err.message);
      }
    });
  };

  if (loading) return <div className="page-loading">Loading backlog…</div>;

  return (
    <div className="project-backlog-panel">
      <KpiStrip
        aria-label="Backlog summary"
        items={[
          { id: 'open', label: 'Open backlog', value: stats.open },
          { id: 'cr', label: 'Open CR', value: stats.cr, valueClass: 'pmo-stat-warning' },
          { id: 'bugs', label: 'Open bugs', value: stats.bugs, valueClass: 'pmo-stat-danger' },
          { id: 'est', label: 'Est hours (open)', value: formatHours(stats.estHours) },
          { id: 'act', label: 'Actual hours (open)', value: formatHours(stats.actHours) },
        ]}
      />

      <div className="section-card__header section-card__header--compact">
        <div>
          <h2 className="section-card__title">Product backlog</h2>
          <p className="section-card__desc">
            Prioritized work items — Open → In progress → Fixed → Closed. Assignees update status; creators receive notifications. Use discussion to @mention the team.
          </p>
        </div>
        {canManage && (
          <div className="card-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>+ Backlog item</button>
          </div>
        )}
      </div>

      <div className="card section-card helpdesk-toolbar-card">
        <div className="module-toolbar helpdesk-toolbar helpdesk-toolbar--compact">
          <label className="module-toolbar__field module-toolbar__field--grow">
            <span className="module-toolbar__label">Search</span>
            <input
              type="search"
              className="form-field__input helpdesk-filter-input"
              placeholder="Ref, title, helpdesk ticket…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </label>
          <label className="module-toolbar__field">
            <span className="module-toolbar__label">Type</span>
            <select className="form-field__input helpdesk-filter-input" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="all">All types</option>
              {BACKLOG_TYPES.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </label>
          <label className="module-toolbar__field">
            <span className="module-toolbar__label">Source</span>
            <select className="form-field__input helpdesk-filter-input" value={filterSource} onChange={(e) => setFilterSource(e.target.value)}>
              <option value="all">All sources</option>
              {BACKLOG_SOURCES.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </label>
          <label className="module-toolbar__field">
            <span className="module-toolbar__label">Status</span>
            <select className="form-field__input helpdesk-filter-input" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="all">All statuses</option>
              {BACKLOG_STATUSES.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="helpdesk-filter-summary" aria-live="polite">
          Showing {visible.length} of {items.length} items
        </p>
      </div>

      {visible.length === 0 ? (
        <UiEmptyState
          title="No backlog items yet"
          description={<>Promote an issue from <Link to="/helpdesk">Helpdesk</Link> or add a new item.</>}
        />
      ) : (
        <DataListShell count={visible.length} total={items.length} comfortable fluid aria-label="Backlog items">
          <table className="pmo-data-list pmo-portfolio-table helpdesk-table">
            <colgroup>
              <col className="col-ticket" />
              <col className="col-issue" />
              <col className="col-narrow" />
              {workPackages.length > 0 && <col className="col-package hide-mobile" />}
              <col className="col-status" />
              <col className="col-narrow hide-mobile" />
              <col className="col-assignee" />
              <col className="col-hours" />
              <col className="col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th>Ref</th>
                <th>Item</th>
                <th>Type</th>
                {workPackages.length > 0 && <th className="hide-mobile">Work package</th>}
                <th>Status</th>
                <th className="hide-mobile">Source</th>
                <th>Assignee</th>
                <th title="Estimated / actual hours">Hours</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => (
                <tr key={item.id}>
                  <td className="helpdesk-ticket">{item.ref_no}</td>
                  <td className="pmo-data-list__primary">
                    <button type="button" className="helpdesk-title helpdesk-title--link" onClick={() => setDetailItem(item)}>
                      {item.title}
                    </button>
                    <div className="pmo-table-muted">
                      {item.issue_ticket_no && (
                        <Link to={`/helpdesk?issue=${item.issue_id}`} className="pmo-link-strong">
                          Helpdesk {item.issue_ticket_no}
                        </Link>
                      )}
                      {item.issue_external_ticket_ref && (
                        <span>{item.issue_ticket_no ? ' · ' : ''}Client ref {item.issue_external_ticket_ref}</span>
                      )}
                      {item.client_name && ` · ${item.client_name}`}
                      {item.module_code && ` · ${item.module_code}`}
                      {item.task_name && ` · Task: ${item.task_name}`}
                      {item.phase_name && ` · Phase: ${item.phase_name}`}
                    </div>
                  </td>
                  <td><span className="project-meta-chip">{typeLabel(item.item_type)}</span></td>
                  {workPackages.length > 0 && (
                    <td className="hide-mobile pmo-table-muted">{item.work_package_name || '—'}</td>
                  )}
                  <td>
                    {canUpdateItem(item) ? (
                      <select
                        className="pmo-cell-select gantt-input gantt-input--select helpdesk-select"
                        value={item.status}
                        onChange={(e) => patchItem(item.id, { status: e.target.value })}
                      >
                        {BACKLOG_STATUSES.map((s) => (
                          <option key={s.id} value={s.id}>{s.label}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={`backlog-status-badge backlog-status-badge--${backlogStatusTone(item.status)}`}>
                        {statusLabel(item.status)}
                      </span>
                    )}
                  </td>
                  <td className="hide-mobile">{sourceLabel(item.source)}</td>
                  <td>
                    {canManage ? (
                      <select
                        className="pmo-cell-select gantt-input gantt-input--select helpdesk-select"
                        value={item.assignee_person_id || ''}
                        onChange={(e) => patchItem(item.id, {
                          assignee_person_id: e.target.value ? +e.target.value : null,
                        })}
                      >
                        <option value="">—</option>
                        {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    ) : (item.assignee_name || '—')}
                  </td>
                  <td>
                    <HoursField
                      estimated={item.estimated_hours}
                      actual={item.actual_hours}
                      compact
                      disabled={!canManage && !canUpdateItem(item)}
                      onEstimatedChange={canManage ? (v) => patchItem(item.id, { estimated_hours: v }) : undefined}
                      onActualChange={canUpdateItem(item) ? (v) => patchItem(item.id, { actual_hours: v }) : undefined}
                    />
                  </td>
                    <td className="table-actions-col pmo-row-actions">
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDetailItem(item)} title="Discussion">
                        💬{item.comment_count > 0 ? ` ${item.comment_count}` : ''}
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAttachItem(item)} title="Attachments">
                        📎
                      </button>
                      {canManage && !item.task_id && item.status !== 'closed' && (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => promoteTask(item)} disabled={busy}>
                        → Task
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataListShell>
      )}

      {showForm && (
        <div className="modal-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && !busy && setShowForm(false)}>
          <div className="modal-dialog modal-dialog--project-create" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modal-dialog-header project-create-header">
              <h2 className="modal-dialog-title">New backlog item</h2>
              <button type="button" className="modal-dialog-close" onClick={() => setShowForm(false)} aria-label="Close">×</button>
            </div>
            <form className="project-create-form" onSubmit={submit}>
              <div className="project-create-panel">
                <div className="form-field">
                  <label className="form-field__label">Title <span className="form-field__required">*</span></label>
                  <input className="form-field__input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required />
                </div>
                <div className="form-field">
                  <label className="form-field__label">Description</label>
                  <textarea className="form-field__input form-field__textarea" rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
                </div>
                <div className="form-row form-row-2">
                  <div className="form-field">
                    <label className="form-field__label">Type</label>
                    <select className="form-field__input" value={form.item_type} onChange={(e) => setForm((f) => ({ ...f, item_type: e.target.value }))}>
                      {BACKLOG_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                  </div>
                  <div className="form-field">
                    <label className="form-field__label">Source</label>
                    <select className="form-field__input" value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}>
                      {BACKLOG_SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-field">
                  <label className="form-field__label">Priority</label>
                  <select className="form-field__input" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>
                    {BACKLOG_PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </div>
                <div className="form-row form-row-2">
                  <div className="form-field">
                    <label className="form-field__label">Estimated hours</label>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      className="form-field__input"
                      value={form.estimated_hours}
                      onChange={(e) => setForm((f) => ({ ...f, estimated_hours: e.target.value }))}
                      placeholder="e.g. 16"
                    />
                  </div>
                  <div className="form-field">
                    <label className="form-field__label">Actual hours</label>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      className="form-field__input"
                      value={form.actual_hours}
                      onChange={(e) => setForm((f) => ({ ...f, actual_hours: e.target.value }))}
                      placeholder="When done"
                    />
                  </div>
                </div>
                <div className="form-row form-row-2">
                  {workPackages.length > 0 && (
                    <div className="form-field">
                      <label className="form-field__label">Work package</label>
                      <select
                        className="form-field__input"
                        value={form.work_package_id || workPackageFilter || ''}
                        onChange={(e) => setForm((f) => ({ ...f, work_package_id: e.target.value, phase_id: '' }))}
                      >
                        <option value="">— None —</option>
                        {workPackages.map((wp) => (
                          <option key={wp.id} value={wp.id}>{wp.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="form-field">
                    <label className="form-field__label">Project phase</label>
                    <select className="form-field__input" value={form.phase_id} onChange={(e) => setForm((f) => ({ ...f, phase_id: e.target.value }))}>
                      <option value="">— None —</option>
                      {(form.work_package_id || workPackageFilter
                        ? packagePhases.filter((ph) => ph.work_package_id === +(form.work_package_id || workPackageFilter))
                        : phases
                      ).map((ph) => <option key={ph.id} value={ph.id}>{ph.name}</option>)}
                    </select>
                  </div>
                  <div className="form-field">
                    <label className="form-field__label">Assignee</label>
                    <select className="form-field__input" value={form.assignee_person_id} onChange={(e) => setForm((f) => ({ ...f, assignee_person_id: e.target.value }))}>
                      <option value="">— Later —</option>
                      {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              <div className="project-create-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)} disabled={busy}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {detailItem && (
        <BacklogDetailModal
          item={detailItem}
          people={people}
          user={user}
          canManage={canManage}
          onClose={() => setDetailItem(null)}
          onUpdated={handleItemUpdated}
        />
      )}

      {attachItem && (
        <div className="modal-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && setAttachItem(null)}>
          <div className="modal-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modal-dialog-header project-create-header">
              <h2 className="modal-dialog-title">{attachItem.ref_no} — attachments</h2>
              <p className="project-create-subtitle">{attachItem.title}</p>
              <button type="button" className="modal-dialog-close" onClick={() => setAttachItem(null)} aria-label="Close">×</button>
            </div>
            <div className="project-create-panel">
              <EntityAttachments entityType="backlog" entityId={attachItem.id} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
