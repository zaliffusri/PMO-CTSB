import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useSubmitLock } from '../hooks/useSubmitLock';
import UiEmptyState from './UiEmptyState';
import KpiStrip from './KpiStrip';
import DataListShell from './DataListShell';
import EntityAttachments from './EntityAttachments';
import ChartCard from './charts/ChartCard';
import DonutChart from './charts/DonutChart';
import HBarChart from './charts/HBarChart';
import HoursField from './HoursField';
import { formatProjectDate } from '../../lib/pmoMetrics.js';
import { chartProjectTaskStatus, chartProjectAssigneeLoad } from '../../lib/projectCharts.js';
import { sumHours, formatHours } from '../../lib/hoursUtils.js';

const SORT_OPTIONS = [
  { id: 'group', label: 'Group order' },
  { id: 'due', label: 'Due date' },
  { id: 'status', label: 'Status' },
  { id: 'name', label: 'Name' },
];

const STATUS_ORDER = { new: 0, ongoing: 1, done: 2 };

const EMPTY_ADD_DRAFT = {
  kind: 'task',
  name: '',
  parent_id: '',
  assignee_id: '',
  planned_end_date: '',
  planned_start_date: '',
  estimated_hours: '',
  work_package_id: '',
  showMore: false,
  addAnother: false,
};

function createAddDraft(overrides = {}, packageFilter = '') {
  return {
    ...EMPTY_ADD_DRAFT,
    work_package_id: packageFilter || '',
    ...overrides,
  };
}

function taskDueMeta(t) {
  if (!t.planned_end_date || t.task_kind === 'group') return null;
  const today = new Date().toISOString().slice(0, 10);
  const status = String(t.status || 'new').toLowerCase();
  if (status === 'done') return { tone: 'ok', label: 'Completed' };
  if (t.planned_end_date < today) return { tone: 'danger', label: 'Overdue' };
  const days = Math.round((new Date(t.planned_end_date) - new Date(today)) / 86400000);
  if (days <= 7) return { tone: 'warning', label: `${days}d left` };
  return { tone: 'ok', label: formatProjectDate(t.planned_end_date) };
}

function TaskStatusBadge({ status }) {
  const s = String(status || 'new').toLowerCase();
  return <span className={`project-task-status project-task-status--${s}`}>{s}</span>;
}

function TaskProgressBar({ value, onChange, disabled }) {
  const v = Math.min(100, Math.max(0, Number(value) || 0));
  return (
    <div className="project-task-progress">
      <div className="pmo-progress-bar project-task-progress__track" aria-hidden>
        <div className="pmo-progress-fill" style={{ width: `${v}%` }} />
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={v}
        disabled={disabled}
        className="project-task-progress__slider"
        aria-label="Progress percent"
        onChange={(e) => onChange?.(+e.target.value)}
      />
      <span className="project-task-progress__value">{v}%</span>
    </div>
  );
}

export default function ProjectTasksPanel({
  projectId,
  tasks = [],
  workPackages = [],
  packageFilter = '',
  allPeople = [],
  chartFilter,
  onClearChartFilter,
  canManage = true,
  onReload,
}) {
  const [taskSearch, setTaskSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [sortBy, setSortBy] = useState('group');
  const [viewMode, setViewMode] = useState('table');
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [addDraft, setAddDraft] = useState(() => createAddDraft());
  const [quickName, setQuickName] = useState('');
  const [attachTask, setAttachTask] = useState(null);
  const nameInputRef = useRef(null);
  const { pending: busy, run } = useSubmitLock();

  const taskGroups = useMemo(() => tasks.filter((t) => t.task_kind === 'group'), [tasks]);
  const leafTasks = useMemo(() => {
    let list = tasks.filter((t) => t.task_kind !== 'group');
    if (packageFilter) list = list.filter((t) => t.work_package_id === +packageFilter);
    return list;
  }, [tasks, packageFilter]);

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return {
      total: leafTasks.length,
      groups: taskGroups.length,
      new: leafTasks.filter((t) => (t.status || 'new') === 'new').length,
      ongoing: leafTasks.filter((t) => t.status === 'ongoing').length,
      done: leafTasks.filter((t) => t.status === 'done').length,
      overdue: leafTasks.filter(
        (t) => t.planned_end_date && t.planned_end_date < today && (t.status || 'new') !== 'done',
      ).length,
      avgProgress: leafTasks.length
        ? Math.round(leafTasks.reduce((s, t) => s + (Number(t.progress_percent) || 0), 0) / leafTasks.length)
        : 0,
      estHours: Math.round(sumHours(leafTasks, 'estimated_hours') * 10) / 10,
      actHours: Math.round(sumHours(leafTasks, 'actual_hours') * 10) / 10,
    };
  }, [leafTasks, taskGroups]);

  const statusChart = useMemo(() => chartProjectTaskStatus(tasks), [tasks]);
  const assigneeChart = useMemo(() => chartProjectAssigneeLoad(tasks, 6), [tasks]);

  const visibleTasks = useMemo(() => {
    let list = tasks;
    if (packageFilter) {
      list = list.filter(
        (t) => t.task_kind === 'group' || t.work_package_id === +packageFilter || t.work_package_id == null,
      );
    }
    if (chartFilter?.taskStatus) {
      const status = chartFilter.taskStatus;
      const matchingIds = new Set(
        list
          .filter((t) => t.task_kind !== 'group' && String(t.status || 'new').toLowerCase() === status)
          .map((t) => t.parent_id || t.id),
      );
      list = list.filter((t) => {
        if (t.task_kind === 'group') return matchingIds.has(t.id);
        return String(t.status || 'new').toLowerCase() === status;
      });
    }
    if (chartFilter?.assigneeKey) {
      const key = chartFilter.assigneeKey;
      const matchingIds = new Set(
        list
          .filter((t) => {
            if (t.task_kind === 'group') return false;
            const k = String(t.assignee_id ?? t.assignee_name ?? 'Unassigned');
            return k === key;
          })
          .map((t) => t.parent_id || t.id),
      );
      list = list.filter((t) => {
        if (t.task_kind === 'group') return matchingIds.has(t.id);
        const k = String(t.assignee_id ?? t.assignee_name ?? 'Unassigned');
        return k === key;
      });
    }
    if (chartFilter?.healthKey) {
      const today = new Date().toISOString().slice(0, 10);
      const matchesHealth = (t) => {
        const st = String(t.status || 'new').toLowerCase();
        if (st === 'done') return chartFilter.healthKey === 'on_track';
        const overdue = t.planned_end_date && t.planned_end_date < today;
        const stalled = st === 'ongoing' && (Number(t.progress_percent) || 0) < 25 && overdue;
        if (chartFilter.healthKey === 'blocked') return stalled;
        if (chartFilter.healthKey === 'at_risk') return overdue && !stalled;
        return !overdue && !stalled;
      };
      const matchingIds = new Set(
        list.filter((t) => t.task_kind !== 'group' && matchesHealth(t)).map((t) => t.parent_id || t.id),
      );
      list = list.filter((t) => {
        if (t.task_kind === 'group') return matchingIds.has(t.id);
        return matchesHealth(t);
      });
    }

    const q = taskSearch.trim().toLowerCase();
    if (q) {
      const matchIds = new Set();
      list.forEach((t) => {
        const hit =
          String(t.name || '').toLowerCase().includes(q)
          || String(t.assignee_name || '').toLowerCase().includes(q)
          || String(t.parent_name || '').toLowerCase().includes(q);
        if (hit) {
          matchIds.add(t.id);
          if (t.parent_id) matchIds.add(t.parent_id);
        }
      });
      list = list.filter((t) => matchIds.has(t.id) || (t.parent_id && matchIds.has(t.parent_id)));
    }

    if (statusFilter !== 'all') {
      const matchingIds = new Set(
        list
          .filter((t) => t.task_kind !== 'group' && String(t.status || 'new') === statusFilter)
          .map((t) => t.parent_id || t.id),
      );
      list = list.filter((t) => {
        if (t.task_kind === 'group') return matchingIds.has(t.id);
        return String(t.status || 'new') === statusFilter;
      });
    }

    if (assigneeFilter) {
      const assigneeKey = (t) => String(t.assignee_id ?? t.assignee_name ?? 'Unassigned');
      const matchingIds = new Set(
        list
          .filter((t) => t.task_kind !== 'group' && assigneeKey(t) === assigneeFilter)
          .map((t) => t.parent_id || t.id),
      );
      list = list.filter((t) => {
        if (t.task_kind === 'group') return matchingIds.has(t.id);
        return assigneeKey(t) === assigneeFilter;
      });
    }

    list = list.filter((t) => {
      if (t.task_kind !== 'group' && t.parent_id && collapsedGroups.has(t.parent_id)) return false;
      return true;
    });

    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sortBy === 'name') return String(a.name).localeCompare(String(b.name));
      if (sortBy === 'status') {
        const sa = STATUS_ORDER[String(a.status || 'new')] ?? 9;
        const sb = STATUS_ORDER[String(b.status || 'new')] ?? 9;
        return sa - sb || String(a.name).localeCompare(String(b.name));
      }
      if (sortBy === 'due') {
        const da = a.planned_end_date || '9999';
        const db = b.planned_end_date || '9999';
        return da.localeCompare(db);
      }
      if (a.task_kind === 'group' && b.task_kind !== 'group') return -1;
      if (a.task_kind !== 'group' && b.task_kind === 'group') return 1;
      if (a.parent_id !== b.parent_id) return (a.parent_id || 0) - (b.parent_id || 0);
      return (a.id ?? 0) - (b.id ?? 0);
    });
    return sorted;
  }, [tasks, packageFilter, chartFilter, taskSearch, statusFilter, assigneeFilter, sortBy, collapsedGroups]);

  const openAddModal = useCallback((preset = {}) => {
    setAddDraft(createAddDraft(preset, packageFilter));
    setAddOpen(true);
  }, [packageFilter]);

  const closeAddModal = useCallback(() => {
    setAddOpen(false);
    setAddDraft(createAddDraft({}, packageFilter));
  }, [packageFilter]);

  useEffect(() => {
    if (addOpen) nameInputRef.current?.focus();
  }, [addOpen, addDraft.kind]);

  const patchTask = async (taskId, partial) => {
    try {
      await api.projectTasks.update(taskId, partial);
      onReload?.();
    } catch (err) {
      alert(err.message);
    }
  };

  const deleteTask = async (taskId, taskKind) => {
    const msg = taskKind === 'group'
      ? 'Delete this task group and all of its subtasks?'
      : 'Delete this task?';
    if (!confirm(msg)) return;
    await run(async () => {
      try {
        await api.projectTasks.delete(taskId);
        onReload?.();
      } catch (err) {
        alert(err.message);
      }
    });
  };

  const markDone = (t) => {
    patchTask(t.id, {
      status: 'done',
      progress_percent: 100,
      actual_end_date: t.actual_end_date || new Date().toISOString().slice(0, 10),
    });
  };

  const createTaskPayload = (draft) => {
    const pkgId = draft.work_package_id || packageFilter || undefined;
    const name = draft.name.trim();
    if (draft.kind === 'group') {
      return {
        project_id: +projectId,
        name,
        task_kind: 'group',
        planned_start_date: draft.planned_start_date || undefined,
        planned_end_date: draft.planned_end_date || undefined,
        work_package_id: pkgId,
      };
    }
    const parentId = draft.parent_id ? +draft.parent_id : null;
    return {
      project_id: +projectId,
      name,
      task_kind: 'task',
      parent_id: parentId || undefined,
      planned_start_date: draft.planned_start_date || undefined,
      planned_end_date: draft.planned_end_date || undefined,
      progress_percent: 0,
      status: 'new',
      assignee_id: draft.assignee_id ? +draft.assignee_id : null,
      work_package_id: pkgId,
      estimated_hours: draft.estimated_hours !== '' && draft.estimated_hours != null
        ? +draft.estimated_hours
        : undefined,
    };
  };

  const submitAdd = async (e) => {
    e.preventDefault();
    if (!addDraft.name.trim()) return;
    await run(async () => {
      try {
        await api.projectTasks.create(createTaskPayload(addDraft));
        onReload?.();
        if (addDraft.addAnother) {
          const keep = {
            kind: addDraft.kind,
            parent_id: addDraft.parent_id,
            assignee_id: addDraft.assignee_id,
            estimated_hours: addDraft.estimated_hours,
            work_package_id: addDraft.work_package_id,
            showMore: addDraft.showMore,
            addAnother: true,
          };
          setAddDraft(createAddDraft(keep, packageFilter));
        } else {
          closeAddModal();
        }
      } catch (err) {
        alert(err.message);
      }
    });
  };

  const quickAdd = async (e) => {
    e?.preventDefault();
    const name = quickName.trim();
    if (!name) return;
    await run(async () => {
      try {
        const parentId = taskGroups.length === 1 ? taskGroups[0].id : null;
        await api.projectTasks.create({
          project_id: +projectId,
          name,
          task_kind: 'task',
          parent_id: parentId || undefined,
          progress_percent: 0,
          status: 'new',
          work_package_id: packageFilter || undefined,
        });
        setQuickName('');
        onReload?.();
      } catch (err) {
        alert(err.message);
      }
    });
  };

  const toggleGroup = (groupId) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const groupChildStats = (groupId) => {
    const kids = tasks.filter((t) => t.parent_id === groupId);
    const done = kids.filter((t) => t.status === 'done').length;
    const progress = kids.length
      ? Math.round(kids.reduce((s, t) => s + (Number(t.progress_percent) || 0), 0) / kids.length)
      : 0;
    return { count: kids.length, done, progress };
  };

  const renderTaskRow = (t) => {
    const isGroup = t.task_kind === 'group';
    const isChild = t.parent_id != null;
    const due = taskDueMeta(t);
    const collapsed = isGroup && collapsedGroups.has(t.id);
    const gStats = isGroup ? groupChildStats(t.id) : null;

    return (
      <tr
        key={t.id}
        className={`project-task-row ${isGroup ? 'project-task-row--group' : ''} ${isChild ? 'project-task-row--child' : ''} ${due?.tone === 'danger' ? 'project-task-row--overdue' : ''}`}
      >
        <td className="project-task-row__name pmo-data-list__primary">
          <div className="project-task-row__name-inner">
          {isGroup && (
            <button type="button" className="project-task-group-toggle" onClick={() => toggleGroup(t.id)} aria-expanded={!collapsed}>
              <span className="project-task-group-toggle__icon">{collapsed ? '▸' : '▾'}</span>
            </button>
          )}
          <div className="project-task-name-block">
            {isGroup ? (
              <>
                <span className="project-task-name project-task-name--group">{t.name}</span>
                <span className="project-task-group-meta">
                  {gStats?.count ?? 0} subtasks · {gStats?.done ?? 0} done · {gStats?.progress ?? 0}%
                </span>
              </>
            ) : isChild ? (
              <>
                <span className="project-task-parent-label">{t.parent_name || 'Group'}</span>
                <span className="project-task-name">{t.name}</span>
              </>
            ) : (
              <span className="project-task-name">{t.name}</span>
            )}
          </div>
          </div>
        </td>
        {workPackages.length > 0 && (
          <td className="hide-mobile">
            {isGroup ? (
              <span className="project-task-muted">—</span>
            ) : (
              <select
              className="pmo-cell-select project-task-inline-select"
              value={t.work_package_id != null ? String(t.work_package_id) : ''}
                onChange={(e) => patchTask(t.id, { work_package_id: e.target.value === '' ? null : +e.target.value })}
              >
                <option value="">—</option>
                {workPackages.map((wp) => (
                  <option key={wp.id} value={wp.id}>{wp.name}</option>
                ))}
              </select>
            )}
          </td>
        )}
        <td>
          {isGroup ? (
            <span className="project-task-muted">—</span>
          ) : (
            <select
              className="pmo-cell-select project-task-inline-select"
              value={t.assignee_id != null ? String(t.assignee_id) : ''}
              onChange={(e) => patchTask(t.id, { assignee_id: e.target.value === '' ? null : +e.target.value })}
              aria-label={`Assignee for ${t.name}`}
            >
              <option value="">Unassigned</option>
              {allPeople.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
        </td>
        <td>
          {isGroup ? (
            <span className="project-task-muted">—</span>
          ) : (
            <select
              className={`pmo-cell-select project-task-inline-select project-task-inline-select--status pmo-cell-select--status-${String(t.status || 'new').toLowerCase()}`}
              value={t.status || 'new'}
              onChange={(e) => patchTask(t.id, { status: e.target.value })}
            >
              <option value="new">New</option>
              <option value="ongoing">Ongoing</option>
              <option value="done">Done</option>
            </select>
          )}
        </td>
        <td className="project-task-dates hide-mobile">
          <div className="project-task-dates__range">
            <span>{formatProjectDate(t.planned_start_date) || '—'}</span>
            <span className="project-task-dates__sep">→</span>
            <span>{formatProjectDate(t.planned_end_date) || '—'}</span>
          </div>
          {due && <span className={`project-task-due project-task-due--${due.tone}`}>{due.label}</span>}
        </td>
        <td className="project-task-dates project-task-dates--muted hide-lg">
          {isGroup ? (
            <span className="project-task-muted">—</span>
          ) : (
            <div className="project-task-dates__range">
              <span>{formatProjectDate(t.actual_start_date) || '—'}</span>
              <span className="project-task-dates__sep">→</span>
              <span>{formatProjectDate(t.actual_end_date) || '—'}</span>
            </div>
          )}
        </td>
        <td className="project-task-hours">
          {isGroup ? (
            <HoursField estimated={t.estimated_hours} actual={t.actual_hours} readOnly compact />
          ) : (
            <HoursField
              estimated={t.estimated_hours}
              actual={t.actual_hours}
              compact
              disabled={!canManage}
              onEstimatedChange={(v) => patchTask(t.id, { estimated_hours: v })}
              onActualChange={(v) => patchTask(t.id, { actual_hours: v })}
            />
          )}
        </td>
        <td>
          {isGroup ? (
            <div className="project-task-progress project-task-progress--readonly">
              <div className="pmo-progress-bar project-task-progress__track">
                <div className="pmo-progress-fill" style={{ width: `${gStats?.progress ?? 0}%` }} />
              </div>
              <span className="project-task-progress__value">{gStats?.progress ?? 0}%</span>
            </div>
          ) : (
            <TaskProgressBar
              value={t.progress_percent}
              onChange={(v) => patchTask(t.id, { progress_percent: v })}
            />
          )}
        </td>
        <td className="project-task-actions">
          <div className="project-task-actions-inner pmo-row-actions">
          {!isGroup && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAttachTask(t)} title="Attachments">📎</button>
          )}
          {canManage && !isGroup && t.status !== 'done' && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => markDone(t)} disabled={busy}>
              Done
            </button>
          )}
          {canManage && isGroup && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => openAddModal({ kind: 'task', parent_id: String(t.id) })} disabled={busy}>
              + Add
            </button>
          )}
          {canManage && (
            <button type="button" className="btn btn-ghost btn-sm project-task-delete" onClick={() => deleteTask(t.id, t.task_kind)} disabled={busy}>
              Delete
            </button>
          )}
          </div>
        </td>
      </tr>
    );
  };

  const renderTaskCard = (t) => {
    const isGroup = t.task_kind === 'group';
    const due = taskDueMeta(t);
    const gStats = isGroup ? groupChildStats(t.id) : null;

    return (
      <article key={t.id} className={`project-task-card ${isGroup ? 'project-task-card--group' : ''} ${due?.tone === 'danger' ? 'project-task-card--overdue' : ''}`}>
        <div className="project-task-card__head">
          <div>
            {isGroup ? (
              <span className="project-task-card__kind">Task group</span>
            ) : (
              <TaskStatusBadge status={t.status} />
            )}
            <h3 className="project-task-card__title">{t.name}</h3>
            {!isGroup && t.parent_name && <p className="project-task-card__parent">{t.parent_name}</p>}
          </div>
          {due && <span className={`project-task-due project-task-due--${due.tone}`}>{due.label}</span>}
        </div>
        {!isGroup && (
          <p className="project-task-card__assignee">{t.assignee_name || 'Unassigned'}</p>
        )}
        {isGroup && (
          <p className="project-task-card__assignee">{gStats?.count ?? 0} subtasks · {gStats?.done ?? 0} done</p>
        )}
        <HoursField
          estimated={t.estimated_hours}
          actual={t.actual_hours}
          readOnly={isGroup}
          disabled={!canManage || isGroup}
          onEstimatedChange={isGroup ? undefined : (v) => patchTask(t.id, { estimated_hours: v })}
          onActualChange={isGroup ? undefined : (v) => patchTask(t.id, { actual_hours: v })}
        />
        <TaskProgressBar
          value={isGroup ? gStats?.progress : t.progress_percent}
          onChange={isGroup ? undefined : (v) => patchTask(t.id, { progress_percent: v })}
          disabled={isGroup}
        />
        <div className="project-task-card__dates">
          <span>Plan: {formatProjectDate(t.planned_start_date) || '—'} – {formatProjectDate(t.planned_end_date) || '—'}</span>
        </div>
        <div className="project-task-card__actions">
          {!isGroup && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAttachTask(t)} title="Attachments">📎</button>
          )}
          {canManage && !isGroup && t.status !== 'done' && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => markDone(t)} disabled={busy}>Mark done</button>
          )}
          {canManage && isGroup && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => openAddModal({ kind: 'task', parent_id: String(t.id) })} disabled={busy}>+ Add</button>
          )}
          {canManage && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => deleteTask(t.id, t.task_kind)} disabled={busy}>Delete</button>
          )}
        </div>
      </article>
    );
  };

  return (
    <div className="project-tasks-panel">
      {(chartFilter || statusFilter !== 'all' || assigneeFilter || taskSearch) && (
        <div className="project-charts-filter-bar project-charts-filter-bar--inline">
          <span>
            Active filters
            {chartFilter?.taskStatus && <> · status <strong>{chartFilter.taskStatus}</strong></>}
            {chartFilter?.assigneeLabel && <> · <strong>{chartFilter.assigneeLabel}</strong></>}
            {statusFilter !== 'all' && <> · <strong>{statusFilter}</strong></>}
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setStatusFilter('all');
              setAssigneeFilter('');
              setTaskSearch('');
              onClearChartFilter?.();
            }}
          >
            Clear all
          </button>
        </div>
      )}

      <KpiStrip
        aria-label="Task summary"
        items={[
          {
            id: 'all',
            label: 'Tasks',
            value: stats.total,
            onClick: () => setStatusFilter('all'),
            className: statusFilter === 'all' ? 'kpi-strip-item--active' : '',
          },
          {
            id: 'new',
            label: 'New',
            value: stats.new,
            onClick: () => setStatusFilter('new'),
            className: statusFilter === 'new' ? 'kpi-strip-item--active' : '',
          },
          {
            id: 'ongoing',
            label: 'Ongoing',
            value: stats.ongoing,
            onClick: () => setStatusFilter('ongoing'),
            className: statusFilter === 'ongoing' ? 'kpi-strip-item--active' : '',
          },
          {
            id: 'done',
            label: 'Done',
            value: stats.done,
            onClick: () => setStatusFilter('done'),
            className: statusFilter === 'done' ? 'kpi-strip-item--active' : '',
          },
          {
            id: 'overdue',
            label: 'Overdue',
            value: stats.overdue,
            className: stats.overdue ? 'kpi-strip-item--warn' : '',
          },
          { id: 'est', label: 'Est hours', value: formatHours(stats.estHours) },
          { id: 'act', label: 'Actual hours', value: formatHours(stats.actHours) },
        ]}
      />

      {leafTasks.length > 0 && (
        <div className="project-tasks-charts">
          <ChartCard title="By status" subtitle="Click to filter">
            <DonutChart
              data={statusChart.length ? statusChart : [{ key: 'empty', label: 'None', value: 1, color: 'var(--border)' }]}
              centerValue={stats.total}
              centerLabel="tasks"
              interactive={statusChart.length > 0}
              activeKey={statusFilter !== 'all' ? statusFilter : null}
              onSegmentClick={(seg) => setStatusFilter(seg.key)}
            />
          </ChartCard>
          {assigneeChart.length > 0 && (
            <ChartCard title="By assignee" subtitle="Workload distribution">
              <HBarChart
                data={assigneeChart}
                max={Math.max(...assigneeChart.map((d) => d.value), 1)}
                unit=""
                interactive
                activeKey={assigneeFilter || null}
                onBarClick={(bar) => setAssigneeFilter(String(bar.key) === assigneeFilter ? '' : String(bar.key))}
              />
            </ChartCard>
          )}
        </div>
      )}

      <div className="card section-card module-filter-card project-tasks-toolbar">
        <div className="module-toolbar helpdesk-toolbar helpdesk-toolbar--compact project-tasks-toolbar__main">
          <label className="module-toolbar__field module-toolbar__field--grow">
            <span className="module-toolbar__label">Search</span>
            <input
              type="search"
              className="form-field__input pmo-filter-input"
              placeholder="Task name or assignee…"
              value={taskSearch}
              onChange={(e) => setTaskSearch(e.target.value)}
            />
          </label>
          <label className="module-toolbar__field">
            <span className="module-toolbar__label">Sort</span>
            <select className="form-field__input pmo-filter-input" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              {SORT_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
          <label className="module-toolbar__field">
            <span className="module-toolbar__label">View</span>
            <select className="form-field__input pmo-filter-input" value={viewMode} onChange={(e) => setViewMode(e.target.value)}>
              <option value="table">Table</option>
              <option value="board">Cards</option>
            </select>
          </label>
          <div className="module-toolbar__actions project-tasks-toolbar__actions">
            <Link to="/gantt" className="btn btn-secondary btn-sm">Gantt</Link>
            <Link to={`/projects/${projectId}?tab=timeline`} className="btn btn-secondary btn-sm">Timeline</Link>
            {canManage && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => openAddModal()} disabled={busy}>
                + Add task
              </button>
            )}
          </div>
        </div>
        {canManage && (
          <form className="project-tasks-quick-add" onSubmit={quickAdd}>
            <input
              type="text"
              className="form-field__input pmo-filter-input project-tasks-quick-add__input"
              placeholder={taskGroups.length === 1
                ? `Quick add under “${taskGroups[0].name}”…`
                : 'Quick add — type name and press Enter'}
              value={quickName}
              onChange={(e) => setQuickName(e.target.value)}
              disabled={busy}
            />
            <button type="submit" className="btn btn-secondary btn-sm" disabled={busy || !quickName.trim()}>
              Add
            </button>
          </form>
        )}
        <p className="pmo-filter-summary" aria-live="polite">
          {visibleTasks.length} of {tasks.length} rows · {viewMode === 'table' ? 'Table' : 'Cards'} view
        </p>
      </div>

      {addOpen && (
        <div className="modal-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && !busy && closeAddModal()}>
          <div className="modal-dialog project-task-add-modal" role="dialog" aria-modal="true" aria-labelledby="project-task-add-title">
            <div className="modal-dialog-header">
              <div>
                <p className="project-create-eyebrow">Tasks</p>
                <h2 id="project-task-add-title" className="modal-dialog-title">
                  {addDraft.kind === 'group' ? 'New group' : 'New task'}
                </h2>
              </div>
              <button type="button" className="modal-dialog-close" onClick={closeAddModal} aria-label="Close" disabled={busy}>×</button>
            </div>
            <form className="project-task-add-form" onSubmit={submitAdd}>
              <div className="project-task-add-kind" role="group" aria-label="Type">
                <button
                  type="button"
                  className={`chip-filter ${addDraft.kind === 'task' ? 'active' : ''}`}
                  onClick={() => setAddDraft((d) => ({ ...d, kind: 'task' }))}
                >
                  Task
                </button>
                <button
                  type="button"
                  className={`chip-filter ${addDraft.kind === 'group' ? 'active' : ''}`}
                  onClick={() => setAddDraft((d) => ({ ...d, kind: 'group', parent_id: '', assignee_id: '' }))}
                >
                  Group
                </button>
              </div>

              <label className="form-field">
                <span className="form-field__label">{addDraft.kind === 'group' ? 'Group name' : 'Task name'} *</span>
                <input
                  ref={nameInputRef}
                  type="text"
                  className="ui-input"
                  value={addDraft.name}
                  onChange={(e) => setAddDraft((d) => ({ ...d, name: e.target.value }))}
                  required
                  placeholder={addDraft.kind === 'group' ? 'e.g. Phase 1 — Discovery' : 'e.g. Draft requirements doc'}
                />
              </label>

              {addDraft.kind === 'task' && (
                <>
                  {taskGroups.length > 0 && (
                    <label className="form-field">
                      <span className="form-field__label">Under group</span>
                      <select
                        className="ui-input"
                        value={addDraft.parent_id}
                        onChange={(e) => setAddDraft((d) => ({ ...d, parent_id: e.target.value }))}
                      >
                        <option value="">None — standalone task</option>
                        {taskGroups.map((g) => (
                          <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  <div className="form-row form-row-2">
                    <label className="form-field">
                      <span className="form-field__label">Assignee</span>
                      <select
                        className="ui-input"
                        value={addDraft.assignee_id}
                        onChange={(e) => setAddDraft((d) => ({ ...d, assignee_id: e.target.value }))}
                      >
                        <option value="">Unassigned</option>
                        {allPeople.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="form-field">
                      <span className="form-field__label">Due date</span>
                      <input
                        type="date"
                        className="ui-input"
                        value={addDraft.planned_end_date}
                        onChange={(e) => setAddDraft((d) => ({ ...d, planned_end_date: e.target.value }))}
                      />
                    </label>
                  </div>
                  <label className="form-field">
                    <span className="form-field__label">Estimated hours</span>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      className="ui-input"
                      value={addDraft.estimated_hours}
                      onChange={(e) => setAddDraft((d) => ({ ...d, estimated_hours: e.target.value }))}
                      placeholder="e.g. 8"
                    />
                  </label>
                </>
              )}

              {addDraft.kind === 'group' && (
                <div className="form-row form-row-2">
                  <label className="form-field">
                    <span className="form-field__label">Start</span>
                    <input
                      type="date"
                      className="ui-input"
                      value={addDraft.planned_start_date}
                      onChange={(e) => setAddDraft((d) => ({ ...d, planned_start_date: e.target.value }))}
                    />
                  </label>
                  <label className="form-field">
                    <span className="form-field__label">End</span>
                    <input
                      type="date"
                      className="ui-input"
                      value={addDraft.planned_end_date}
                      onChange={(e) => setAddDraft((d) => ({ ...d, planned_end_date: e.target.value }))}
                    />
                  </label>
                </div>
              )}

              <button
                type="button"
                className="project-task-add-more-toggle"
                onClick={() => setAddDraft((d) => ({ ...d, showMore: !d.showMore }))}
                aria-expanded={addDraft.showMore}
              >
                {addDraft.showMore ? '▾ Less options' : '▸ More options'}
              </button>

              {addDraft.showMore && (
                <div className="project-task-add-more">
                  {addDraft.kind === 'task' && (
                    <label className="form-field">
                      <span className="form-field__label">Start date</span>
                      <input
                        type="date"
                        className="ui-input"
                        value={addDraft.planned_start_date}
                        onChange={(e) => setAddDraft((d) => ({ ...d, planned_start_date: e.target.value }))}
                      />
                    </label>
                  )}
                  {workPackages.length > 0 && (
                    <label className="form-field">
                      <span className="form-field__label">Work package</span>
                      <select
                        className="ui-input"
                        value={addDraft.work_package_id || packageFilter || ''}
                        onChange={(e) => setAddDraft((d) => ({ ...d, work_package_id: e.target.value }))}
                      >
                        <option value="">— None —</option>
                        {workPackages.map((wp) => (
                          <option key={wp.id} value={wp.id}>{wp.name}</option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              )}

              <div className="project-task-add-footer">
                <label className="project-task-add-another">
                  <input
                    type="checkbox"
                    checked={addDraft.addAnother}
                    onChange={(e) => setAddDraft((d) => ({ ...d, addAnother: e.target.checked }))}
                  />
                  Add another
                </label>
                <div className="project-task-add-footer__actions">
                  <button type="button" className="btn btn-secondary" onClick={closeAddModal} disabled={busy}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={busy}>
                    {busy ? 'Saving…' : addDraft.kind === 'group' ? 'Create group' : 'Create task'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {tasks.length === 0 ? (
        <UiEmptyState
          title="No tasks yet"
          description="Use quick add for fast entry, or open Add task for assignee, dates, and groups."
          action={canManage && (
            <button type="button" className="btn btn-primary" onClick={() => openAddModal()}>+ Add task</button>
          )}
        />
      ) : visibleTasks.length === 0 ? (
        <UiEmptyState
          title="No tasks match filters"
          description="Try clearing search or status filters."
          action={<button type="button" className="btn btn-secondary" onClick={() => { setStatusFilter('all'); setTaskSearch(''); onClearChartFilter?.(); }}>Clear filters</button>}
        />
      ) : viewMode === 'board' ? (
        <div className="project-task-board">
          {visibleTasks.map(renderTaskCard)}
        </div>
      ) : (
        <DataListShell
          count={visibleTasks.length}
          total={tasks.length}
          stickyHeader
          comfortable
          fluid
          scrollHint
          className="project-tasks-table-card"
          aria-label="Task list"
        >
          <table className="pmo-data-list project-tasks-table pmo-data-list--tasks">
            <colgroup>
              <col className="col-primary" />
              {workPackages.length > 0 && <col className="col-package hide-mobile" />}
              <col className="col-assignee" />
              <col className="col-status" />
              <col className="col-dates hide-mobile" />
              <col className="col-dates hide-lg" />
              <col className="col-hours" />
              <col className="col-progress" />
              <col className="col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th className="pmo-data-list__col-primary">Task</th>
                {workPackages.length > 0 && <th className="hide-mobile">Package</th>}
                <th>Assignee</th>
                <th>Status</th>
                <th className="hide-mobile">Planned</th>
                <th className="hide-lg">Actual</th>
                <th title="Estimated / actual hours">Hours</th>
                <th>Progress</th>
                <th className="table-actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>{visibleTasks.map(renderTaskRow)}</tbody>
          </table>
        </DataListShell>
      )}

      {attachTask && (
        <div className="modal-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && setAttachTask(null)}>
          <div className="modal-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modal-dialog-header project-create-header">
              <h2 className="modal-dialog-title">Task attachments</h2>
              <p className="project-create-subtitle">{attachTask.name}</p>
              <button type="button" className="modal-dialog-close" onClick={() => setAttachTask(null)} aria-label="Close">×</button>
            </div>
            <div className="project-create-panel">
              <EntityAttachments entityType="task" entityId={attachTask.id} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
