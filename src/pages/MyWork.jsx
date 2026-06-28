import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import PageHeader from '../components/PageHeader';
import UiEmptyState from '../components/UiEmptyState';
import PageLoadError from '../components/PageLoadError';
import { useSubmitLock } from '../hooks/useSubmitLock';
import { OPEN_BACKLOG_STATUSES, BACKLOG_TYPES, BACKLOG_STATUSES } from '../../lib/backlogConstants.js';
import { ISSUE_STATUSES } from '../../lib/issueConstants.js';
import { supportLevelLabel } from '../../lib/issueWorkflow.js';
import {
  resolveMyPerson,
  isMyTask,
  isMyBacklog,
  taskDueMeta,
  priorityWeight,
  sortWorkItems,
  formatDueDate,
  formatActivityTime,
} from '../../lib/myWorkUtils.js';

const OPEN_ISSUE_STATUSES = new Set(['open', 'in_progress', 'waiting_agency']);

const SORT_OPTIONS = [
  { id: 'urgency', label: 'Urgency' },
  { id: 'due', label: 'Due date' },
  { id: 'priority', label: 'Priority' },
];

const QUEUE_TABS = [
  { id: 'all', label: 'All work', short: 'All' },
  { id: 'tasks', label: 'Tasks', short: 'Tasks' },
  { id: 'backlog', label: 'Backlog', short: 'Backlog' },
  { id: 'helpdesk', label: 'Helpdesk', short: 'Helpdesk' },
];

const GROUP_META = {
  task: { label: 'Tasks', desc: 'Delivery work assigned to you' },
  backlog: { label: 'Backlog', desc: 'Change requests, bugs, and enhancements' },
  helpdesk: { label: 'Helpdesk', desc: 'Support tickets awaiting your action' },
};

function labelFrom(list, id) {
  return list.find((x) => x.id === id)?.label || id;
}

function formatTodayLong(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function greetingForUser(name) {
  const hour = new Date().getHours();
  const first = name?.split(' ')[0] || '';
  const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return first ? `${timeGreeting}, ${first}` : timeGreeting;
}

function priorityClass(p) {
  if (p === 'critical') return 'issue-priority--critical';
  if (p === 'high') return 'issue-priority--high';
  if (p === 'medium') return 'issue-priority--medium';
  return 'issue-priority--low';
}

function QueueIcon({ kind }) {
  const paths = {
    all: 'M4 6h16M4 12h10M4 18h14',
    tasks: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
    backlog: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10',
    helpdesk: 'M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z',
    schedule: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  };
  return (
    <svg className="my-work-queue-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={paths[kind] || paths.all} />
    </svg>
  );
}

function MyWorkSkeleton() {
  return (
    <div className="page-module my-work-page" aria-busy="true" aria-label="Loading your work">
      <div className="my-work-skeleton-panel my-work-workspace">
        <div className="my-work-skeleton-hero" />
        <div className="my-work-skeleton-layout">
          <div className="my-work-skeleton-main">
            <div className="my-work-skeleton-toolbar" />
            {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="my-work-skeleton-row" />)}
          </div>
          <div className="my-work-skeleton-aside" />
        </div>
      </div>
    </div>
  );
}

function QueueBreakdown({ stats, activeTab, onSelect }) {
  const rows = [
    { id: 'tasks', label: 'Tasks', count: stats.tasks, tone: 'task' },
    { id: 'backlog', label: 'Backlog', count: stats.backlog, tone: 'backlog' },
    { id: 'helpdesk', label: 'Helpdesk', count: stats.helpdesk, tone: 'helpdesk' },
  ];
  const max = Math.max(stats.total, 1);

  return (
    <div className="my-work-queue-mix" aria-label="Queue breakdown">
      {rows.map((row) => (
        <button
          key={row.id}
          type="button"
          className={`my-work-queue-mix__row${activeTab === row.id ? ' my-work-queue-mix__row--active' : ''}`}
          onClick={() => onSelect(row.id)}
        >
          <span className="my-work-queue-mix__label">{row.label}</span>
          <span className="my-work-queue-mix__track" aria-hidden>
            <span
              className={`my-work-queue-mix__fill my-work-queue-mix__fill--${row.tone}`}
              style={{ width: `${Math.round((row.count / max) * 100)}%` }}
            />
          </span>
          <span className="my-work-queue-mix__count">{row.count}</span>
        </button>
      ))}
    </div>
  );
}

function WorkTableHead({ showProgress }) {
  return (
    <div className="my-work-table__head" aria-hidden>
      <span>Type</span>
      <span>Work item</span>
      <span>Status</span>
      <span>Due</span>
      {showProgress && <span>Progress</span>}
      <span className="my-work-table__head-actions">Action</span>
    </div>
  );
}

function WorkItemRow({ item, onMarkDone, busy, showProgress }) {
  return (
    <article
      className={`my-work-table__row my-work-table__row--${item.kind}${item.urgent ? ' my-work-table__row--urgent' : ''}`}
    >
      <div className="my-work-table__type">
        <span className={`my-work-kind-pill my-work-kind-pill--${item.kind}`}>
          {item.typeLabel}
        </span>
      </div>
      <div className="my-work-table__work">
        <Link to={item.href} className="my-work-table__title">
          {item.title}
        </Link>
        <p className="my-work-table__meta">
          {item.projectName && <span>{item.projectName}</span>}
          {item.subtitle && <span>{item.subtitle}</span>}
        </p>
      </div>
      <div className="my-work-table__status">
        <span className={`my-work-status-pill my-work-status-pill--${item.kind}`}>
          {item.statusLabel}
        </span>
        {item.priority && item.priority !== 'medium' && (
          <span className={`issue-priority ${priorityClass(item.priority)}`}>{item.priority}</span>
        )}
      </div>
      <div className="my-work-table__due">
        {item.dueLabel ? (
          <span className={`my-work-due my-work-due--${item.dueTone}`}>{item.dueLabel}</span>
        ) : (
          <span className="my-work-due my-work-due--muted">—</span>
        )}
      </div>
      {showProgress && (
        <div className="my-work-table__progress">
          {item.progress != null && item.kind === 'task' ? (
            <>
              <div className="pmo-progress-bar" aria-hidden>
                <div className="pmo-progress-fill" style={{ width: `${item.progress}%` }} />
              </div>
              <span>{item.progress}%</span>
            </>
          ) : (
            <span className="my-work-table__progress-na">—</span>
          )}
        </div>
      )}
      <div className="my-work-table__actions">
        {item.kind === 'task' && item.canComplete && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy}
            onClick={() => onMarkDone(item.raw)}
            title="Mark task complete"
          >
            Done
          </button>
        )}
        <Link to={item.href} className="btn btn-secondary btn-sm my-work-table__open">
          Open
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      </div>
    </article>
  );
}

function ScheduleRow({ activity, isLast }) {
  const start = formatActivityTime(activity.start_at);
  const end = formatActivityTime(activity.end_at);
  return (
    <article className={`my-work-timeline-item${isLast ? ' my-work-timeline-item--last' : ''}`}>
      <div className="my-work-timeline-item__rail" aria-hidden>
        <span className="my-work-timeline-item__dot" />
      </div>
      <div className="my-work-timeline-item__card">
        <div className="my-work-timeline-item__time">
          {start}
          <span className="my-work-timeline-item__sep">–</span>
          {end}
        </div>
        <strong className="my-work-timeline-item__title">{activity.title}</strong>
        <p className="my-work-timeline-item__meta">
          {activity.project_name && <span>{activity.project_name}</span>}
          {activity.location && activity.location !== '—' && <span>{activity.location}</span>}
        </p>
      </div>
    </article>
  );
}

function WorkGroup({ id, items, onMarkDone, busy }) {
  if (!items.length) return null;
  const meta = GROUP_META[id];
  const showProgress = id === 'task';
  return (
    <section className="my-work-group" aria-label={meta.label}>
      <header className="my-work-group__header">
        <div className="my-work-group__icon-wrap">
          <QueueIcon kind={id === 'helpdesk' ? 'helpdesk' : id === 'backlog' ? 'backlog' : 'tasks'} />
        </div>
        <div>
          <h3 className="my-work-group__title">{meta.label}</h3>
          <p className="my-work-group__desc">{meta.desc}</p>
        </div>
        <span className="my-work-group__count">{items.length}</span>
      </header>
      <div className={`my-work-table${showProgress ? ' my-work-table--with-progress' : ''}`}>
        <WorkTableHead showProgress={showProgress} />
        {items.map((item) => (
          <WorkItemRow key={item.id} item={item} onMarkDone={onMarkDone} busy={busy} showProgress={showProgress} />
        ))}
      </div>
    </section>
  );
}

export default function MyWork() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [issues, setIssues] = useState([]);
  const [backlogs, setBacklogs] = useState([]);
  const [people, setPeople] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('urgency');
  const [showSchedule, setShowSchedule] = useState(false);
  const { pending: busy, run } = useSubmitLock();

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    const activityParams = user?.id
      ? { person_id: user.id, from: today, to: today }
      : { from: today, to: today };
    Promise.all([
      api.projectTasks.list(),
      api.issues.list({ mine: '1' }),
      api.backlogs.list(),
      api.people.list(),
      api.activities.list(activityParams).catch(() => []),
    ])
      .then(([tk, iss, bl, pe, act]) => {
        setTasks(tk);
        setIssues(iss);
        setBacklogs(bl);
        setPeople(pe);
        setActivities(Array.isArray(act) ? act : []);
      })
      .catch((err) => setLoadError(err.message || 'Failed to load your work'))
      .finally(() => setLoading(false));
  }, [user?.id, today]);

  useEffect(() => { load(); }, [load]);

  const myPerson = useMemo(() => resolveMyPerson(people, user), [people, user]);

  const myTasks = useMemo(() => tasks.filter((t) => {
    if ((t.status || 'new') === 'done') return false;
    return isMyTask(t, myPerson, user);
  }), [tasks, myPerson, user]);

  const myBacklogs = useMemo(() => backlogs.filter((b) => {
    if (!OPEN_BACKLOG_STATUSES.has(b.status)) return false;
    return isMyBacklog(b, myPerson, user);
  }), [backlogs, myPerson, user]);

  const openIssues = useMemo(
    () => issues.filter((i) => OPEN_ISSUE_STATUSES.has(i.status)),
    [issues],
  );

  const workItems = useMemo(() => {
    const items = [];

    myTasks.forEach((t) => {
      const due = taskDueMeta(t);
      const urgent = due.tone === 'danger' || due.tone === 'warning';
      items.push({
        id: `task-${t.id}`,
        kind: 'task',
        typeLabel: 'Task',
        title: t.name,
        projectName: t.project_name,
        subtitle: t.work_package_name || null,
        href: `/projects/${t.project_id}?tab=tasks`,
        priority: null,
        priorityWeight: urgent ? 3 : 1,
        dueLabel: due.label,
        dueTone: due.tone,
        dueSort: due.days ?? 99999,
        urgencyScore: due.tone === 'danger' ? 100 : due.tone === 'warning' ? 60 : 10,
        urgent,
        progress: t.progress_percent ?? 0,
        statusLabel: t.status || 'new',
        canComplete: true,
        raw: t,
        searchText: `${t.name} ${t.project_name} ${t.work_package_name || ''}`.toLowerCase(),
      });
    });

    myBacklogs.forEach((b) => {
      const pw = priorityWeight(b.priority);
      const urgent = pw >= 3;
      items.push({
        id: `backlog-${b.id}`,
        kind: 'backlog',
        typeLabel: 'Backlog',
        title: `${b.ref_no}: ${b.title}`,
        projectName: b.project_name,
        subtitle: labelFrom(BACKLOG_TYPES, b.item_type),
        href: `/projects/${b.project_id}?tab=backlog`,
        priority: b.priority,
        priorityWeight: pw,
        dueLabel: b.target_date ? formatDueDate(b.target_date) : null,
        dueTone: 'ok',
        dueSort: 99998,
        urgencyScore: urgent ? 70 + pw * 5 : 20 + pw,
        urgent,
        progress: null,
        statusLabel: labelFrom(BACKLOG_STATUSES, b.status),
        canComplete: false,
        raw: b,
        searchText: `${b.ref_no} ${b.title} ${b.project_name}`.toLowerCase(),
      });
    });

    openIssues.forEach((i) => {
      const pw = priorityWeight(i.priority);
      const urgent = pw >= 3 || i.status === 'waiting_agency';
      items.push({
        id: `issue-${i.id}`,
        kind: 'helpdesk',
        typeLabel: 'Ticket',
        title: `${i.ticket_no}: ${i.title}`,
        projectName: i.project_name || i.client_name,
        subtitle: `${supportLevelLabel(i.support_level)} · ${labelFrom(ISSUE_STATUSES, i.status)}`,
        href: `/helpdesk?issue=${i.id}`,
        priority: i.priority,
        priorityWeight: pw,
        dueLabel: null,
        dueTone: 'muted',
        dueSort: 99997,
        urgencyScore: urgent ? 80 + pw * 5 : 15 + pw,
        urgent,
        progress: null,
        statusLabel: labelFrom(ISSUE_STATUSES, i.status),
        canComplete: false,
        raw: i,
        searchText: `${i.ticket_no} ${i.title} ${i.project_name || ''}`.toLowerCase(),
      });
    });

    return items;
  }, [myTasks, myBacklogs, openIssues]);

  const q = search.trim().toLowerCase();
  const filteredItems = useMemo(() => {
    let list = workItems;
    if (tab === 'tasks') list = list.filter((i) => i.kind === 'task');
    else if (tab === 'backlog') list = list.filter((i) => i.kind === 'backlog');
    else if (tab === 'helpdesk') list = list.filter((i) => i.kind === 'helpdesk');
    if (q) list = list.filter((i) => i.searchText.includes(q));
    return sortWorkItems(list, sortBy);
  }, [workItems, tab, q, sortBy]);

  const groupedItems = useMemo(() => {
    if (tab !== 'all') return null;
    const groups = { task: [], backlog: [], helpdesk: [] };
    filteredItems.forEach((item) => {
      if (groups[item.kind]) groups[item.kind].push(item);
    });
    return groups;
  }, [tab, filteredItems]);

  const stats = useMemo(() => {
    const overdueTasks = myTasks.filter((t) => taskDueMeta(t).tone === 'danger').length;
    const dueSoonTasks = myTasks.filter((t) => {
      const m = taskDueMeta(t);
      return m.tone === 'warning' && m.days != null && m.days >= 0;
    }).length;
    const urgentCount = workItems.filter((i) => i.urgent).length;
    const avgProgress = myTasks.length
      ? Math.round(myTasks.reduce((s, t) => s + (t.progress_percent ?? 0), 0) / myTasks.length)
      : 0;
    return {
      total: myTasks.length + myBacklogs.length + openIssues.length,
      tasks: myTasks.length,
      backlog: myBacklogs.length,
      helpdesk: openIssues.length,
      overdue: overdueTasks,
      dueSoon: dueSoonTasks,
      schedule: activities.length,
      urgent: urgentCount,
      avgProgress,
    };
  }, [myTasks, myBacklogs, openIssues, activities, workItems]);

  const sortedActivities = useMemo(
    () => [...activities].sort((a, b) => String(a.start_at).localeCompare(String(b.start_at))),
    [activities],
  );

  const markTaskDone = async (task) => {
    await run(async () => {
      try {
        await api.projectTasks.update(task.id, {
          status: 'done',
          progress_percent: 100,
          actual_end_date: today,
        });
        load();
      } catch (err) {
        alert(err.message);
      }
    });
  };

  if (loadError) return <PageLoadError message={loadError} onRetry={load} />;
  if (loading) return <MyWorkSkeleton />;

  const activeTabMeta = QUEUE_TABS.find((t) => t.id === tab);
  const hasActiveFilters = Boolean(search.trim());
  const showProgressCol = tab === 'tasks' || tab === 'all';
  const nextActivity = sortedActivities[0];

  return (
    <div className="page-module my-work-page">
      <PageHeader
        eyebrow="Personal workspace"
        title="My work"
        badge={stats.urgent > 0 ? `${stats.urgent} priority` : null}
        subtitle="Your unified queue for delivery tasks, backlog, and support tickets."
        actions={(
          <div className="my-work-header-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={load} disabled={busy}>
              Refresh
            </button>
            <Link to="/calendar" className="btn btn-secondary btn-sm">Calendar</Link>
            <Link to="/projects" className="btn btn-secondary btn-sm">Projects</Link>
          </div>
        )}
      />

      <div className="my-work-workspace card section-card module-workspace">
        <header className="my-work-topbar" aria-label="Work summary">
          <div className="my-work-topbar__intro">
            <p className="my-work-topbar__greeting">{greetingForUser(user?.name)}</p>
            <p className="my-work-topbar__date">{formatTodayLong(today)}</p>
            {myPerson && (
              <p className="my-work-topbar__person">Assigned as <strong>{myPerson.name}</strong></p>
            )}
          </div>
          <div className="my-work-topbar__metrics">
            <button type="button" className="my-work-metric" onClick={() => { setTab('all'); setShowSchedule(false); }}>
              <span className="my-work-metric__value">{stats.total}</span>
              <span className="my-work-metric__label">Open</span>
            </button>
            <button
              type="button"
              className={`my-work-metric${stats.overdue ? ' my-work-metric--danger' : ''}`}
              onClick={() => { setTab('tasks'); setSortBy('due'); setShowSchedule(false); }}
            >
              <span className="my-work-metric__value">{stats.overdue}</span>
              <span className="my-work-metric__label">Overdue</span>
            </button>
            <button
              type="button"
              className={`my-work-metric${stats.dueSoon ? ' my-work-metric--warning' : ''}`}
              onClick={() => { setTab('tasks'); setSortBy('due'); setShowSchedule(false); }}
            >
              <span className="my-work-metric__value">{stats.dueSoon}</span>
              <span className="my-work-metric__label">Due soon</span>
            </button>
            <div className="my-work-metric my-work-metric--static my-work-metric--accent">
              <span className="my-work-metric__value">{stats.avgProgress}%</span>
              <span className="my-work-metric__label">Progress</span>
            </div>
          </div>
        </header>

        {(stats.overdue > 0 || stats.dueSoon > 0) && (
          <div className="my-work-banner" role="status">
            <div className="my-work-banner__icon" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="my-work-banner__text">
              {stats.overdue > 0 && (
                <span>{stats.overdue} overdue task{stats.overdue !== 1 ? 's' : ''}</span>
              )}
              {stats.overdue > 0 && stats.dueSoon > 0 && <span className="my-work-banner__sep">·</span>}
              {stats.dueSoon > 0 && (
                <span>{stats.dueSoon} due within 7 days</span>
              )}
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => { setTab('tasks'); setSortBy('due'); setShowSchedule(false); }}
            >
              Review tasks
            </button>
          </div>
        )}

        <div className={`my-work-layout${showSchedule ? ' my-work-layout--schedule' : ''}`}>
          <div className="my-work-main">
            <section className="my-work-panel">
              <div className="my-work-panel__nav" role="tablist" aria-label="Work queues">
              {QUEUE_TABS.map((t) => {
                const count = t.id === 'all' ? stats.total
                  : t.id === 'tasks' ? stats.tasks
                    : t.id === 'backlog' ? stats.backlog
                      : stats.helpdesk;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={tab === t.id && !showSchedule}
                    className={`my-work-segment${tab === t.id && !showSchedule ? ' my-work-segment--active' : ''}`}
                    onClick={() => { setTab(t.id); setShowSchedule(false); }}
                  >
                    <QueueIcon kind={t.id} />
                    <span className="my-work-segment__label">{t.label}</span>
                    <span className="my-work-segment__count">{count}</span>
                  </button>
                );
              })}
              <button
                type="button"
                role="tab"
                aria-selected={showSchedule}
                className={`my-work-segment my-work-segment--schedule${showSchedule ? ' my-work-segment--active' : ''}`}
                onClick={() => setShowSchedule(true)}
              >
                <QueueIcon kind="schedule" />
                <span className="my-work-segment__label">Today</span>
                <span className="my-work-segment__count">{stats.schedule}</span>
              </button>
            </div>

            {showSchedule ? (
              <div className="my-work-panel__body">
                <div className="my-work-panel__header">
                  <div>
                    <h2 className="my-work-panel__title">Today&apos;s schedule</h2>
                    <p className="my-work-panel__desc">Meetings and field activities assigned to you.</p>
                  </div>
                  <Link to="/calendar" className="btn btn-secondary btn-sm">Full calendar</Link>
                </div>
                {sortedActivities.length === 0 ? (
                  <UiEmptyState
                    title="Clear calendar today"
                    description="No activities are scheduled. Open the calendar to plan your week."
                    action={<Link to="/calendar" className="btn btn-primary btn-sm">Open calendar</Link>}
                  />
                ) : (
                  <div className="my-work-timeline">
                    {sortedActivities.map((a, idx) => (
                      <ScheduleRow
                        key={a.id}
                        activity={a}
                        isLast={idx === sortedActivities.length - 1}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="my-work-panel__body">
                <div className="my-work-panel__head">
                  <div className="my-work-panel__head-copy">
                    <h2 className="my-work-panel__title">{activeTabMeta?.label || 'Work queue'}</h2>
                    <p className="my-work-panel__desc">
                      {filteredItems.length} open item{filteredItems.length !== 1 ? 's' : ''}
                      {hasActiveFilters ? ' matching search' : ''}
                    </p>
                  </div>
                  <div className="my-work-panel__head-controls">
                    <label className="my-work-panel__search">
                      <svg className="my-work-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <circle cx="11" cy="11" r="7" />
                        <path d="M20 20l-3-3" strokeLinecap="round" />
                      </svg>
                      <input
                        type="search"
                        className="form-field__input my-work-search-input"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search tasks, tickets, projects…"
                        aria-label="Search my work"
                      />
                    </label>
                    <label className="my-work-panel__sort">
                      <span className="sr-only">Sort by</span>
                      <select
                        className="form-field__input helpdesk-filter-input"
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        aria-label="Sort my work"
                      >
                        {SORT_OPTIONS.map((s) => (
                          <option key={s.id} value={s.id}>{s.label}</option>
                        ))}
                      </select>
                    </label>
                    {hasActiveFilters && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSearch('')}>
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                {filteredItems.length === 0 ? (
                  <UiEmptyState
                    title={search ? 'No matches found' : 'You\'re all caught up'}
                    description={
                      search
                        ? 'Try another keyword or reset the search filter.'
                        : tab === 'tasks'
                          ? 'No active tasks are assigned to you.'
                          : tab === 'backlog'
                            ? 'No backlog items require your attention.'
                            : tab === 'helpdesk'
                              ? 'No open helpdesk tickets are assigned to you.'
                              : 'Your queue is empty — well done.'
                    }
                    action={search ? (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSearch('')}>Clear search</button>
                    ) : (
                      <Link to="/projects" className="btn btn-primary btn-sm">Browse projects</Link>
                    )}
                  />
                ) : tab === 'all' && !search ? (
                  <div className="my-work-groups">
                    <WorkGroup id="task" items={groupedItems.task} onMarkDone={markTaskDone} busy={busy} />
                    <WorkGroup id="backlog" items={groupedItems.backlog} onMarkDone={markTaskDone} busy={busy} />
                    <WorkGroup id="helpdesk" items={groupedItems.helpdesk} onMarkDone={markTaskDone} busy={busy} />
                  </div>
                ) : (
                  <div className={`my-work-table my-work-table--standalone${showProgressCol && tab === 'tasks' ? ' my-work-table--with-progress' : ''}`}>
                    <WorkTableHead showProgress={showProgressCol && tab === 'tasks'} />
                    {filteredItems.map((item) => (
                      <WorkItemRow
                        key={item.id}
                        item={item}
                        onMarkDone={markTaskDone}
                        busy={busy}
                        showProgress={showProgressCol && tab === 'tasks'}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
            </section>
          </div>

          {!showSchedule && (
            <aside className="my-work-aside" aria-label="Sidebar">
              <section className="my-work-aside-card my-work-aside-card--schedule">
              <header className="my-work-aside-card__header">
                <div>
                  <p className="my-work-aside-card__eyebrow">Today</p>
                  <h2 className="my-work-aside-card__title">{formatDueDate(today)}</h2>
                </div>
                <span className="my-work-aside-card__badge">{stats.schedule}</span>
              </header>
              {sortedActivities.length === 0 ? (
                <p className="my-work-aside-card__empty">No activities scheduled for today.</p>
              ) : (
                <ol className="my-work-aside-timeline">
                  {sortedActivities.slice(0, 5).map((a) => (
                    <li key={a.id} className="my-work-aside-timeline__item">
                      <span className="my-work-aside-timeline__time">{formatActivityTime(a.start_at)}</span>
                      <span className="my-work-aside-timeline__title">{a.title}</span>
                    </li>
                  ))}
                </ol>
              )}
              {nextActivity && (
                <p className="my-work-aside-card__next">
                  {sortedActivities.length > 0 && (
                    <>
                      Next: <strong>{nextActivity.title}</strong> at {formatActivityTime(nextActivity.start_at)}
                    </>
                  )}
                </p>
              )}
              <footer className="my-work-aside-card__footer">
                {stats.schedule > 5 && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowSchedule(true)}>
                    View all
                  </button>
                )}
                <Link to="/calendar" className="btn btn-secondary btn-sm">Calendar</Link>
              </footer>
            </section>

            <section className="my-work-aside-card">
              <h2 className="my-work-aside-card__title my-work-aside-card__title--sm">Your queues</h2>
              <QueueBreakdown
                stats={stats}
                activeTab={tab}
                onSelect={(id) => { setTab(id); setShowSchedule(false); }}
              />
            </section>
          </aside>
        )}
        </div>
      </div>
    </div>
  );
}
