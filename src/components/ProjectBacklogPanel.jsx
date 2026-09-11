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
  backlogTypeLabel,
  normalizeBacklogType,
} from '../../lib/backlogConstants.js';
import { ATTACHMENT_ACCEPT } from '../../lib/attachmentConstants.js';
import { prepareAttachmentUpload } from '../lib/attachmentUpload.js';
import { personIdForUser } from '../../lib/permissions.js';
import { sumHours, formatHours } from '../../lib/hoursUtils.js';
import { moduleLabelForCode } from '../../lib/epbtModules.js';
import { useEpbtModules } from '../hooks/useEpbtModules.js';

function typeLabel(id) {
  return backlogTypeLabel(id);
}

function sourceLabel(id) {
  return BACKLOG_SOURCES.find((s) => s.id === id)?.label || id;
}

function statusLabel(id) {
  return backlogStatusLabel(id);
}

function emptyBacklogForm(workPackageFilter = '') {
  return {
    title: '',
    description: '',
    item_type: 'inquiry',
    module_code: 'XXX',
    menu: '',
    submenu: '',
    url: '',
    notes: '',
    status: 'open',
    priority: 'medium',
    assignee_person_id: '',
    source: 'manual',
    estimated_hours: '',
    actual_hours: '',
    phase_id: '',
    work_package_id: workPackageFilter || '',
  };
}

function formatPendingBytes(n) {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageFile(file) {
  if (file?.type?.startsWith('image/')) return true;
  return /\.(png|jpe?g|gif|webp)$/i.test(String(file?.name || ''));
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
  const { modules: epbtModules } = useEpbtModules();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('all');
  const [filterSource, setFilterSource] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [attachItem, setAttachItem] = useState(null);
  const [detailItem, setDetailItem] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(() => emptyBacklogForm(workPackageFilter));
  const [pendingFiles, setPendingFiles] = useState([]);
  const [pendingPreviews, setPendingPreviews] = useState([]);
  const { pending: busy, run } = useSubmitLock();

  useEffect(() => {
    const next = pendingFiles.map((file, idx) => {
      const image = isImageFile(file);
      return {
        idx,
        file,
        image,
        url: image ? URL.createObjectURL(file) : null,
      };
    });
    setPendingPreviews(next);
    return () => {
      next.forEach((p) => {
        if (p.url) URL.revokeObjectURL(p.url);
      });
    };
  }, [pendingFiles]);

  const load = () => {
    setLoading(true);
    api.backlogs.list({ project_id: projectId })
      .then(setItems)
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
  const stats = useMemo(() => {
    const openItems = items.filter((b) => OPEN_BACKLOG_STATUSES.has(b.status));
    const typeOf = (b) => normalizeBacklogType(b.item_type);
    return {
      open: openItems.length,
      cr: items.filter((b) => typeOf(b) === 'cr' && OPEN_BACKLOG_STATUSES.has(b.status)).length,
      bugs: items.filter((b) => typeOf(b) === 'bug_defect' && OPEN_BACKLOG_STATUSES.has(b.status)).length,
      changes: items.filter((b) => typeOf(b) === 'changes' && OPEN_BACKLOG_STATUSES.has(b.status)).length,
      estHours: Math.round(sumHours(openItems, 'estimated_hours') * 10) / 10,
      actHours: Math.round(sumHours(openItems, 'actual_hours') * 10) / 10,
    };
  }, [items]);

  const visible = useMemo(() => {
    let list = items;
    if (workPackageFilter) list = list.filter((b) => b.work_package_id === +workPackageFilter);
    if (filterType !== 'all') {
      list = list.filter((b) => normalizeBacklogType(b.item_type) === filterType);
    }
    if (filterSource !== 'all') list = list.filter((b) => b.source === filterSource);
    if (filterStatus !== 'all') list = list.filter((b) => b.status === filterStatus);
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((b) => (
        String(b.ref_no || '').toLowerCase().includes(q)
        || String(b.title || '').toLowerCase().includes(q)
        || String(b.menu || '').toLowerCase().includes(q)
        || String(b.submenu || '').toLowerCase().includes(q)
        || String(b.module_code || '').toLowerCase().includes(q)
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

  const openCreateForm = () => {
    setForm(emptyBacklogForm(workPackageFilter));
    setPendingFiles([]);
    setShowForm(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    if (!form.assignee_person_id) {
      alert('Assignee is required.');
      return;
    }
    await run(async () => {
      try {
        const created = await api.backlogs.create({
          project_id: +projectId,
          title: form.title.trim(),
          description: form.description || null,
          item_type: form.item_type,
          module_code: form.module_code || null,
          menu: form.menu || null,
          submenu: form.submenu || null,
          url: form.url || null,
          notes: form.notes || null,
          status: form.status,
          priority: form.priority,
          source: form.source || 'manual',
          assignee_person_id: +form.assignee_person_id,
          estimated_hours: form.estimated_hours || null,
          actual_hours: form.actual_hours || null,
          phase_id: form.phase_id || null,
          work_package_id: form.work_package_id || workPackageFilter || null,
        });
        const backlogId = created?.id;
        if (backlogId && pendingFiles.length) {
          for (const file of pendingFiles) {
            try {
              const prepared = await prepareAttachmentUpload(file);
              await api.attachments.create({
                entity_type: 'backlog',
                entity_id: backlogId,
                kind: 'file',
                file_name: prepared.file_name,
                mime_type: prepared.mime_type,
                data_url: prepared.data_url,
              });
            } catch (attachErr) {
              console.warn('backlog attachment upload failed', attachErr);
              alert(attachErr?.message || 'Attachment upload failed');
            }
          }
        }
        setShowForm(false);
        setPendingFiles([]);
        setForm(emptyBacklogForm(workPackageFilter));
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

  const deleteItem = async (item) => {
    if (!item?.id) return;
    const label = item.ref_no ? `${item.ref_no}: ${item.title}` : item.title;
    if (!confirm(`Delete backlog item "${label}"?\n\nThis removes comments and attachments. Linked helpdesk refs are cleared.`)) {
      return;
    }
    await run(async () => {
      try {
        await api.backlogs.delete(item.id);
        if (detailItem?.id === item.id) setDetailItem(null);
        if (attachItem?.id === item.id) setAttachItem(null);
        setItems((prev) => prev.filter((b) => Number(b.id) !== Number(item.id)));
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
          { id: 'changes', label: 'Open changes', value: stats.changes },
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
            <button type="button" className="btn btn-primary btn-sm" onClick={openCreateForm}>+ Backlog item</button>
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
          <table className="pmo-data-list pmo-portfolio-table backlog-table">
            <colgroup>
              <col className="col-ticket" />
              <col className="col-module" />
              <col className="col-issue" />
              <col className="col-type" />
              {workPackages.length > 0 && <col className="col-package hide-mobile" />}
              <col className="col-status" />
              <col className="col-source hide-mobile" />
              <col className="col-assignee" />
              <col className="col-hours" />
              <col className="col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">Ref</th>
                <th scope="col">Module</th>
                <th scope="col" className="pmo-data-list__col-primary">Item</th>
                <th scope="col">Type</th>
                {workPackages.length > 0 && <th scope="col" className="hide-mobile">Work package</th>}
                <th scope="col">Status</th>
                <th scope="col" className="hide-mobile">Source</th>
                <th scope="col">Assignee</th>
                <th scope="col" className="backlog-table__th-hours" title="Estimated / actual hours">
                  <span className="backlog-table__th-stack">
                    <span>Hours</span>
                    <span className="backlog-table__th-sub">Est / Act</span>
                  </span>
                </th>
                <th scope="col" className="backlog-table__th-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => {
                const metaBits = [];
                if (item.menu || item.submenu) {
                  metaBits.push({
                    key: 'menu',
                    label: [item.menu, item.submenu].filter(Boolean).join(' / '),
                    tone: 'path',
                  });
                }
                if (item.client_name) metaBits.push({ key: 'client', label: item.client_name, tone: 'plain' });
                if (item.task_name) metaBits.push({ key: 'task', label: `Task: ${item.task_name}`, tone: 'plain' });
                if (item.phase_name) metaBits.push({ key: 'phase', label: `Phase: ${item.phase_name}`, tone: 'plain' });
                const moduleCode = item.module_code || '';
                const moduleTitle = moduleCode
                  ? moduleLabelForCode(moduleCode, epbtModules)
                  : '';

                return (
                <tr key={item.id} className="backlog-table__row">
                  <td className="helpdesk-ticket backlog-table__ref">
                    <span className="backlog-table__ref-code">{item.ref_no || '—'}</span>
                  </td>
                  <td className="backlog-table__module">
                    {moduleCode ? (
                      <span className="project-meta-chip backlog-module-chip" title={moduleTitle}>
                        {moduleCode}
                      </span>
                    ) : (
                      <span className="backlog-table__cell-text">—</span>
                    )}
                  </td>
                  <td className="pmo-data-list__primary backlog-table__item">
                    <button type="button" className="helpdesk-title helpdesk-title--link" onClick={() => setDetailItem(item)}>
                      {item.title}
                    </button>
                    {(item.issue_ticket_no || item.issue_external_ticket_ref || metaBits.length > 0) && (
                      <div className="backlog-item-meta">
                        {item.issue_ticket_no && (
                          <Link
                            to={`/helpdesk?issue=${item.issue_id}`}
                            className="backlog-item-meta__chip backlog-item-meta__chip--link"
                          >
                            Helpdesk {item.issue_ticket_no}
                          </Link>
                        )}
                        {item.issue_external_ticket_ref && (
                          <span className="backlog-item-meta__chip" title="Client ticket ref">
                            Client {item.issue_external_ticket_ref}
                          </span>
                        )}
                        {metaBits.map((bit) => (
                          <span
                            key={bit.key}
                            className={`backlog-item-meta__chip backlog-item-meta__chip--${bit.tone}`}
                          >
                            {bit.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="backlog-table__type">
                    <span className="project-meta-chip backlog-type-chip">{typeLabel(item.item_type)}</span>
                  </td>
                  {workPackages.length > 0 && (
                    <td className="hide-mobile backlog-table__package">
                      <span className="backlog-table__cell-text">{item.work_package_name || '—'}</span>
                    </td>
                  )}
                  <td className="backlog-table__status">
                    {canUpdateItem(item) ? (
                      <select
                        className="pmo-cell-select gantt-input gantt-input--select helpdesk-select"
                        value={item.status}
                        onChange={(e) => patchItem(item.id, { status: e.target.value })}
                        aria-label={`Status for ${item.ref_no || item.title}`}
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
                  <td className="hide-mobile backlog-table__source">
                    <span className="backlog-table__cell-text">{sourceLabel(item.source)}</span>
                  </td>
                  <td className="backlog-table__assignee">
                    {canManage ? (
                      <select
                        className="pmo-cell-select gantt-input gantt-input--select helpdesk-select"
                        value={item.assignee_person_id || ''}
                        required
                        aria-label={`Assignee for ${item.ref_no || item.title}`}
                        onChange={(e) => {
                          if (!e.target.value) {
                            alert('Assignee is required.');
                            return;
                          }
                          patchItem(item.id, { assignee_person_id: +e.target.value });
                        }}
                      >
                        {!item.assignee_person_id && <option value="">Select assignee…</option>}
                        {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    ) : (
                      <span className="backlog-table__cell-text">{item.assignee_name || '—'}</span>
                    )}
                  </td>
                  <td className="backlog-table__hours">
                    <HoursField
                      estimated={item.estimated_hours}
                      actual={item.actual_hours}
                      compact
                      disabled={!canManage && !canUpdateItem(item)}
                      onEstimatedChange={canManage ? (v) => patchItem(item.id, { estimated_hours: v }) : undefined}
                      onActualChange={canUpdateItem(item) ? (v) => patchItem(item.id, { actual_hours: v }) : undefined}
                    />
                  </td>
                  <td className="table-actions-col backlog-table__actions">
                    <div className="backlog-row-actions">
                      <div className="backlog-row-actions__icons" role="group" aria-label="Quick actions">
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDetailItem(item)} title="Discussion">
                          💬{item.comment_count > 0 ? ` ${item.comment_count}` : ''}
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAttachItem(item)} title="Attachments">
                          📎
                        </button>
                      </div>
                      {canManage && (
                        <div className="backlog-row-actions__primary">
                          {!item.task_id && item.status !== 'closed' && (
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => promoteTask(item)} disabled={busy}>
                              → Task
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm backlog-row-actions__danger"
                            onClick={() => deleteItem(item)}
                            disabled={busy}
                            title="Delete backlog item"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
                );
              })}
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
                <div className="form-row form-row-2">
                  <div className="form-field">
                    <label className="form-field__label">Type <span className="form-field__required">*</span></label>
                    <select
                      className="form-field__input"
                      value={form.item_type}
                      onChange={(e) => setForm((f) => ({ ...f, item_type: e.target.value }))}
                      required
                    >
                      {BACKLOG_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                  </div>
                  <div className="form-field">
                    <label className="form-field__label">Module <span className="form-field__required">*</span></label>
                    <select
                      className="form-field__input"
                      value={form.module_code}
                      onChange={(e) => setForm((f) => ({ ...f, module_code: e.target.value }))}
                      required
                    >
                      {epbtModules.map((m) => (
                        <option key={m.code} value={m.code}>{m.code} — {m.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-field">
                  <label className="form-field__label">Backlog item <span className="form-field__required">*</span></label>
                  <input
                    className="form-field__input"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    required
                    placeholder="Short name for this backlog item"
                  />
                </div>
                <div className="form-row form-row-2">
                  <div className="form-field">
                    <label className="form-field__label">Menu</label>
                    <input
                      className="form-field__input"
                      value={form.menu}
                      onChange={(e) => setForm((f) => ({ ...f, menu: e.target.value }))}
                      placeholder="e.g. Cukai"
                    />
                  </div>
                  <div className="form-field">
                    <label className="form-field__label">Submenu</label>
                    <input
                      className="form-field__input"
                      value={form.submenu}
                      onChange={(e) => setForm((f) => ({ ...f, submenu: e.target.value }))}
                      placeholder="e.g. Bil Cukai"
                    />
                  </div>
                </div>
                <div className="form-field">
                  <label className="form-field__label">Description</label>
                  <textarea
                    className="form-field__input form-field__textarea"
                    rows={3}
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="What needs to be done…"
                  />
                </div>
                <div className="form-field">
                  <label className="form-field__label">Attachment</label>
                  {pendingPreviews.length > 0 && (
                    <ul className="entity-attachments__list backlog-pending-attachments">
                      {pendingPreviews.map(({ idx, file, image, url }) => (
                        <li key={`${file.name}-${idx}-${file.size}`} className="entity-attachments__item">
                          {image && url ? (
                            <img className="entity-attachments__thumb" src={url} alt={file.name} />
                          ) : (
                            <span className="entity-attachments__icon" aria-hidden>📎</span>
                          )}
                          <div className="entity-attachments__meta">
                            <span className="pmo-link-strong">{file.name}</span>
                            <span className="pmo-table-muted">{formatPendingBytes(file.size)}</span>
                          </div>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setPendingFiles((prev) => prev.filter((_, i) => i !== idx))}
                            title="Remove"
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <label className="btn btn-secondary btn-sm entity-attachments__upload-btn" style={{ marginTop: pendingPreviews.length ? '0.5rem' : 0 }}>
                    + Add file
                    <input
                      type="file"
                      accept={ATTACHMENT_ACCEPT}
                      multiple
                      className="sr-only"
                      onChange={(e) => {
                        const files = [...(e.target.files || [])];
                        e.target.value = '';
                        if (!files.length) return;
                        setPendingFiles((prev) => [...prev, ...files]);
                      }}
                    />
                  </label>
                  {!pendingPreviews.length && (
                    <p className="pmo-table-muted" style={{ margin: '0.35rem 0 0', fontSize: '0.82rem' }}>
                      Screenshots, PDF, Office, or zip — max 2.5 MB (images are compressed automatically).
                    </p>
                  )}
                </div>
                <div className="form-field">
                  <label className="form-field__label">URL</label>
                  <input
                    className="form-field__input"
                    type="text"
                    value={form.url}
                    onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                    placeholder="https://…"
                  />
                </div>
                <div className="form-row form-row-2">
                  <div className="form-field">
                    <label className="form-field__label">Assignee <span className="form-field__required">*</span></label>
                    <select
                      className="form-field__input"
                      value={form.assignee_person_id}
                      onChange={(e) => setForm((f) => ({ ...f, assignee_person_id: e.target.value }))}
                      required
                    >
                      <option value="">Select assignee…</option>
                      {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="form-field">
                    <label className="form-field__label">Status <span className="form-field__required">*</span></label>
                    <select
                      className="form-field__input"
                      value={form.status}
                      onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                      required
                    >
                      {BACKLOG_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-field">
                  <label className="form-field__label">Priority <span className="form-field__required">*</span></label>
                  <select
                    className="form-field__input"
                    value={form.priority}
                    onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                    required
                  >
                    {BACKLOG_PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </div>
                <div className="form-field">
                  <label className="form-field__label">Notes</label>
                  <textarea
                    className="form-field__input form-field__textarea"
                    rows={2}
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder="Internal notes…"
                  />
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
          onDeleted={(id) => {
            setDetailItem(null);
            setItems((prev) => prev.filter((b) => Number(b.id) !== Number(id)));
            load();
          }}
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
