import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useNotificationsRealtime } from '../hooks/useNotificationsRealtime';

function resolveNotificationLink(n) {
  if (n?.link) return n.link;
  const type = String(n?.entity_type || n?.type || '');
  const id = n?.entity_id;
  if ((type === 'activity' || type === 'activity_assigned' || type === 'activity_updated') && id != null) {
    return `/calendar?activity=${id}`;
  }
  if (type === 'activity_cancelled') return '/calendar';
  if ((type === 'project_task' || type === 'task_assigned') && id != null) {
    return '/my-work';
  }
  if (type === 'issue' || type === 'issue_assigned') {
    return id != null ? `/helpdesk?issue=${id}` : '/helpdesk';
  }
  if (type === 'backlog') return '/my-work';
  return null;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const navigate = useNavigate();
  const {
    items,
    setItems,
    unread,
    setUnread,
    loadError,
    refresh,
  } = useNotificationsRealtime();

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const openNotification = async (n) => {
    if (!n.read_at) {
      const now = new Date().toISOString();
      setItems((prev) => prev.map((row) => (Number(row.id) === Number(n.id) ? { ...row, read_at: now } : row)));
      setUnread((u) => Math.max(0, u - 1));
      await api.notifications.markRead(n.id).catch(() => refresh());
    }
    setOpen(false);
    const href = resolveNotificationLink(n);
    if (href) navigate(href);
  };

  const markAll = async () => {
    const now = new Date().toISOString();
    setItems((prev) => prev.map((row) => (row.read_at ? row : { ...row, read_at: now })));
    setUnread(0);
    await api.notifications.markAllRead().catch(() => refresh());
  };

  return (
    <div className="notif-bell" ref={wrapRef}>
      <button
        type="button"
        className="notif-bell__btn"
        onClick={() => { setOpen((v) => !v); if (!open) refresh(); }}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        aria-expanded={open}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
        </svg>
        {unread > 0 && <span className="notif-bell__badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="notif-bell__panel" role="menu">
          <div className="notif-bell__head">
            <strong>Notifications</strong>
            {unread > 0 && (
              <button type="button" className="notif-bell__mark-all" onClick={markAll}>Mark all as read</button>
            )}
          </div>
          {loadError ? (
            <p className="notif-bell__empty">Could not load notifications</p>
          ) : items.length === 0 ? (
            <p className="notif-bell__empty">No notifications</p>
          ) : (
            <ul className="notif-bell__list">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={`notif-bell__item ${n.read_at ? '' : 'unread'}`}
                    onClick={() => openNotification(n)}
                  >
                    <span className="notif-bell__item-title">{n.title}</span>
                    {n.body && <span className="notif-bell__item-body">{n.body}</span>}
                    <span className="notif-bell__item-time">{new Date(n.created_at).toLocaleString()}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
