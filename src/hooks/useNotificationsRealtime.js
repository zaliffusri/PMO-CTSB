/**
 * Notifications via initial REST load + Supabase Realtime (no interval polling).
 * Falls back to focus/visibility/event refresh when Realtime is unavailable.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { createRealtimeClient } from '../lib/supabaseBrowser';

function countUnread(list) {
  return (list || []).filter((n) => !n.read_at).length;
}

function mergeNotification(prev, row) {
  if (!row || row.id == null) return prev;
  const nid = Number(row.id);
  const idx = prev.findIndex((n) => Number(n.id) === nid);
  if (idx === -1) return [row, ...prev].slice(0, 50);
  const next = [...prev];
  next[idx] = { ...next[idx], ...row };
  return next;
}

function removeNotification(prev, id) {
  const nid = Number(id);
  return prev.filter((n) => Number(n.id) !== nid);
}

export function useNotificationsRealtime() {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [realtimeActive, setRealtimeActive] = useState(false);
  const channelRef = useRef(null);
  const clientRef = useRef(null);
  const refreshTimerRef = useRef(null);
  const tokenRefreshRef = useRef(null);

  const applyList = useCallback((list) => {
    const rows = Array.isArray(list) ? list : [];
    setItems(rows);
    setUnread(countUnread(rows));
  }, []);

  const refresh = useCallback(() => {
    setLoadError(false);
    const load = () =>
      Promise.all([
        api.notifications.list(),
        api.notifications.unreadCount().catch(() => ({ unread: 0 })),
      ]);

    return load()
      .catch(() => new Promise((resolve, reject) => {
        setTimeout(() => load().then(resolve, reject), 400);
      }))
      .then(([list, count]) => {
        applyList(list);
        if (count && count.unread != null) setUnread(Number(count.unread) || 0);
        setLoadError(false);
      })
      .catch(() => {
        setLoadError(true);
      });
  }, [applyList]);

  const teardownRealtime = useCallback(async () => {
    if (tokenRefreshRef.current) {
      clearTimeout(tokenRefreshRef.current);
      tokenRefreshRef.current = null;
    }
    if (channelRef.current && clientRef.current) {
      try {
        await clientRef.current.removeChannel(channelRef.current);
      } catch {
        /* ignore */
      }
    }
    channelRef.current = null;
    clientRef.current = null;
    setRealtimeActive(false);
  }, []);

  const connectRealtime = useCallback(async () => {
    await teardownRealtime();
    let cfg;
    try {
      cfg = await api.notifications.realtime();
    } catch {
      setRealtimeActive(false);
      return false;
    }
    if (!cfg?.accessToken || !cfg?.supabaseUrl || !cfg?.anonKey || cfg.userId == null) {
      setRealtimeActive(false);
      return false;
    }

    const client = await createRealtimeClient(cfg);
    clientRef.current = client;
    const userId = Number(cfg.userId);

    const channel = client
      .channel(`notifications_app:user:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications_app',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const eventType = payload.eventType || payload.event;
          if (eventType === 'INSERT' && payload.new) {
            setItems((prev) => {
              const next = mergeNotification(prev, payload.new);
              setUnread(countUnread(next));
              return next;
            });
            return;
          }
          if (eventType === 'UPDATE' && payload.new) {
            setItems((prev) => {
              const next = mergeNotification(prev, payload.new);
              setUnread(countUnread(next));
              return next;
            });
            return;
          }
          if (eventType === 'DELETE' && payload.old) {
            setItems((prev) => {
              const next = removeNotification(prev, payload.old.id);
              setUnread(countUnread(next));
              return next;
            });
          }
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setRealtimeActive(true);
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setRealtimeActive(false);
      });

    channelRef.current = channel;

    const expiresMs = Math.max(60_000, (Number(cfg.expiresIn) || 3600) * 1000 - 120_000);
    tokenRefreshRef.current = setTimeout(() => {
      connectRealtime().catch(() => {});
    }, expiresMs);

    return true;
  }, [teardownRealtime]);

  useEffect(() => {
    refresh();
    connectRealtime();

    const scheduleRefresh = () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => refresh(), 150);
    };

    const onFocus = () => {
      refresh();
      if (!clientRef.current) connectRealtime();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') onFocus();
    };
    const onChanged = () => scheduleRefresh();

    window.addEventListener('focus', onFocus);
    window.addEventListener('pmo:notifications-changed', onChanged);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pmo:notifications-changed', onChanged);
      document.removeEventListener('visibilitychange', onVisibility);
      teardownRealtime();
    };
  }, [refresh, connectRealtime, teardownRealtime]);

  return {
    items,
    setItems,
    unread,
    setUnread,
    loadError,
    refresh,
    realtimeActive,
  };
}
