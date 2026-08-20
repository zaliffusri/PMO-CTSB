/**
 * Notifications: REST for initial load + direct Supabase Realtime (browser → Supabase).
 * Does not use Vercel for WebSockets. No /api/notifications/realtime proxy.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { createRealtimeClient, getSupabaseBrowserConfig } from '../lib/supabaseBrowser';
import { useAuth } from '../AuthContext';

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

function applyRealtimePayload(payload, setItems, setUnread) {
  const eventType = payload.eventType || payload.event;
  if (eventType === 'INSERT' && payload.new) {
    // Defense in depth: ignore other users' rows even if filter misconfigured
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
}

export function useNotificationsRealtime() {
  const { user } = useAuth();
  const userId = user?.id != null ? Number(user.id) : null;

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
    if (userId == null) {
      setItems([]);
      setUnread(0);
      return Promise.resolve();
    }
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
  }, [applyList, userId]);

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
    if (clientRef.current) {
      try {
        await clientRef.current.removeAllChannels?.();
      } catch {
        /* ignore */
      }
    }
    clientRef.current = null;
    setRealtimeActive(false);
  }, []);

  const connectRealtime = useCallback(async () => {
    await teardownRealtime();
    if (userId == null) return false;
    if (!getSupabaseBrowserConfig()) {
      setRealtimeActive(false);
      return false;
    }

    // Optional RLS JWT from auth (server-minted). Not a Vercel WebSocket proxy.
    let accessToken = null;
    let expiresIn = 3600;
    try {
      const me = await api.auth.me();
      accessToken = me?.supabase_realtime_token || null;
      expiresIn = Number(me?.supabase_realtime_expires_in) || 3600;
      if (me?.user?.id != null && Number(me.user.id) !== userId) {
        setRealtimeActive(false);
        return false;
      }
    } catch {
      // Still try anon + filter; RLS may block events until token is available
    }

    let client;
    try {
      client = await createRealtimeClient({ accessToken });
    } catch {
      setRealtimeActive(false);
      return false;
    }
    clientRef.current = client;

    const channel = client
      .channel(`notifications_app:user:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications_app',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (payload?.new && Number(payload.new.user_id) !== userId) return;
          applyRealtimePayload(payload, setItems, setUnread);
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications_app',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (payload?.new && Number(payload.new.user_id) !== userId) return;
          applyRealtimePayload(payload, setItems, setUnread);
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setRealtimeActive(true);
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setRealtimeActive(false);
        }
      });

    channelRef.current = channel;

    if (accessToken) {
      const expiresMs = Math.max(60_000, expiresIn * 1000 - 120_000);
      tokenRefreshRef.current = setTimeout(() => {
        connectRealtime().catch(() => {});
      }, expiresMs);
    }

    return true;
  }, [teardownRealtime, userId]);

  useEffect(() => {
    refresh();
    connectRealtime();

    const onFocus = () => {
      // Reconnect Realtime if needed; do not full-refetch when already live
      if (!clientRef.current) {
        refresh();
        connectRealtime();
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') onFocus();
    };
    const onChanged = () => {
      // Local optimistic path (e.g. after create activity) — soft refresh list once
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => refresh(), 150);
    };

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
