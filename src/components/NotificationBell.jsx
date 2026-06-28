import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const wrapRef = useRef(null);
  const navigate = useNavigate();

  const [loadError, setLoadError] = useState(false);

  const refresh = () => {
    setLoadError(false);
    Promise.all([api.notifications.list(), api.notifications.unreadCount()])
      .then(([list, count]) => {
        setItems(list);
        setUnread(count.unread || 0);
      })
      .catch(() => setLoadError(true));
  };

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const markRead = async (n) => {
    if (!n.read_at) await api.notifications.markRead(n.id).catch(() => {});
    setOpen(false);
    if (n.link) navigate(n.link);
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
                  <button type="button" className={`notif-bell__item ${n.read_at ? '' : 'unread'}`} onClick={() => markRead(n)}>
                    <span className="notif-bell__item-title">{n.title}</span>
                    {n.body && <span className="notif-bell__item-body">{n.body}</span>}
                    <span className="notif-bell__item-time">{new Date(n.created_at).toLocaleString()}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Link to="/helpdesk" className="notif-bell__footer" onClick={() => setOpen(false)}>Open helpdesk →</Link>
        </div>
      )}
    </div>
  );
}
