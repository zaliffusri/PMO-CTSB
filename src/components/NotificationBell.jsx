import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

function resolveNotificationLink(n) {
  if (n?.link) return n.link;
  const type = String(n?.entity_type || n?.type || '');
  const id = n?.entity_id;
  if ((type === 'activity' || type === 'activity_assigned' || type === 'activity_updated') && id != null) {
    return `/calendar?activity=${id}`;
  }
  if (type === 'activity_cancelled') return '/calendar';
  if ((type === 'project_task' || type === 'task_assigned') && id != null) {
    // Prefer project link from body is unavailable; fall back to my-work
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
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const wrapRef = useRef(null);
  const navigate = useNavigate();

  const [loadError, setLoadError] = useState(false);

  const refresh = () => {
    setLoadError(false);
    const load = () =>
      Promise.all([
        api.notifications.list(),
        api.notifications.unreadCount().catch(() => ({ unread: 0 })),
      ]);

    load()
      .catch(() => new Promise((resolve, reject) => {
        setTimeout(() => load().then(resolve, reject), 400);
      }))
      .then(([list, count]) => {
        setItems(Array.isArray(list) ? list : []);
        setUnread(Number(count?.unread) || 0);
        setLoadError(false);
      })
      .catch(() => {
        setLoadError(true);
        // Keep previous items on transient errors so the list does not flicker empty.
      });
  };

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15000);
    const onFocus = () => refresh();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const onChanged = () => refresh();
    window.addEventListener('focus', onFocus);
    window.addEventListener('pmo:notifications-changed', onChanged);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pmo:notifications-changed', onChanged);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const openNotification = async (n) => {
    if (!n.read_at) await api.notifications.markRead(n.id).catch(() => {});
    setOpen(false);
    const href = resolveNotificationLink(n);
    if (href) navigate(href);
    else refresh();
  };

  const markAll = async () => {
    await api.notifications.markAllRead().catch(() => {});
    refresh();
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
