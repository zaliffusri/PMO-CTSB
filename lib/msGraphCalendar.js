import { interpretActivitySchedule, zonedDateTimeParts } from './activityDailyWindows.js';

/**
 * Optional Microsoft Graph calendar sync so Teams / Outlook calendars
 * are created, updated, and removed when PMO activities change.
 *
 * Requires app-only Azure AD credentials with application permission
 * Calendars.ReadWrite (admin consent) and env:
 *   MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, MS_GRAPH_CLIENT_SECRET
 */

const GRAPH = 'https://graph.microsoft.com/v1.0';
const TZ = 'Asia/Kuala_Lumpur';
const PMO_UID_PREFIX = 'PMO-UID:';

let cachedToken = null;
let cachedTokenExp = 0;

function trim(v) {
  return String(v || '').trim();
}

export function isMsGraphConfigured() {
  return Boolean(
    trim(process.env.MS_GRAPH_TENANT_ID)
    && trim(process.env.MS_GRAPH_CLIENT_ID)
    && trim(process.env.MS_GRAPH_CLIENT_SECRET),
  );
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toGraphLocalDateTime(iso) {
  const p = zonedDateTimeParts(iso, TZ);
  if (!p) return null;
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}T${pad2(p.hour)}:${pad2(p.minute)}:${pad2(p.second)}`;
}

function toGraphDate(iso) {
  const p = zonedDateTimeParts(iso, TZ);
  if (!p) return null;
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

function uidMarker(calendarUid) {
  return `${PMO_UID_PREFIX}${String(calendarUid || '').trim()}`;
}

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && cachedTokenExp > now + 60_000) return cachedToken;

  const tenant = trim(process.env.MS_GRAPH_TENANT_ID);
  const clientId = trim(process.env.MS_GRAPH_CLIENT_ID);
  const clientSecret = trim(process.env.MS_GRAPH_CLIENT_SECRET);
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || `Graph token HTTP ${res.status}`);
  }
  cachedToken = data.access_token;
  cachedTokenExp = now + (Number(data.expires_in) || 3600) * 1000;
  return cachedToken;
}

async function graphFetch(path, { method = 'GET', body } = {}) {
  const token = await getAccessToken();
  const res = await fetch(`${GRAPH}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: `outlook.timezone="${TZ}"`,
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || data?.error?.code || `Graph HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

function buildGraphEventPayload({
  title,
  location,
  description,
  calendarUid,
  startAt,
  endAt,
  canceled = false,
}) {
  const schedule = interpretActivitySchedule(startAt, endAt, TZ);
  const startLocal = toGraphLocalDateTime(schedule.firstStartIso || startAt);
  const endLocal = toGraphLocalDateTime(schedule.firstEndIso || endAt);
  if (!startLocal || !endLocal) return null;

  const safeTitle = String(title || 'Activity').trim() || 'Activity';
  const subject = canceled ? `Canceled: ${safeTitle}` : safeTitle;
  const notes = String(description || '')
    .replace(/__pmo_[^|]*/g, '')
    .replace(/\s*\|\s*/g, ' ')
    .trim();
  const marker = uidMarker(calendarUid);

  const event = {
    subject,
    body: {
      contentType: 'HTML',
      content: `<div>${notes ? `<p>${escapeHtml(notes)}</p>` : ''}<p>Scheduled via PMO CTSB</p><p>${escapeHtml(marker)}</p></div>`,
    },
    start: { dateTime: startLocal, timeZone: TZ },
    end: { dateTime: endLocal, timeZone: TZ },
    location: location ? { displayName: String(location) } : undefined,
    showAs: canceled ? 'free' : 'busy',
    isCancelled: Boolean(canceled),
    isReminderOn: !canceled,
  };

  if (schedule.mode === 'daily' && schedule.dayCount > 1) {
    const startDate = toGraphDate(schedule.firstStartIso);
    if (startDate) {
      event.recurrence = {
        pattern: { type: 'daily', interval: 1 },
        range: {
          type: 'numbered',
          startDate,
          numberOfOccurrences: schedule.dayCount,
        },
      };
    }
  }

  return event;
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function listEventsNear(userEmail, startAt, endAt) {
  const schedule = interpretActivitySchedule(startAt, endAt, TZ);
  const start = new Date(schedule.firstStartIso || startAt);
  const end = new Date(schedule.lastEndIso || endAt);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return [];
  start.setUTCDate(start.getUTCDate() - 1);
  end.setUTCDate(end.getUTCDate() + 2);
  const qs = new URLSearchParams({
    startDateTime: start.toISOString(),
    endDateTime: end.toISOString(),
    $select: 'id,subject,body,isCancelled',
    $top: '50',
  });
  const enc = encodeURIComponent(userEmail);
  const data = await graphFetch(`/users/${enc}/calendarView?${qs.toString()}`);
  return Array.isArray(data?.value) ? data.value : [];
}

function eventMatchesUid(ev, calendarUid) {
  const marker = uidMarker(calendarUid).toLowerCase();
  const body = String(ev?.body?.content || '').toLowerCase();
  return body.includes(marker.toLowerCase());
}

async function findEventId(userEmail, calendarUid, startAt, endAt) {
  const events = await listEventsNear(userEmail, startAt, endAt);
  const hit = events.find((ev) => eventMatchesUid(ev, calendarUid));
  return hit?.id || null;
}

/**
 * Sync one recipient's Teams/Outlook calendar for a PMO activity.
 */
export async function syncMsGraphRecipient({
  userEmail,
  variant = 'scheduled',
  title,
  location,
  description,
  startAt,
  endAt,
  calendarUid,
}) {
  const email = trim(userEmail).toLowerCase();
  if (!email || !email.includes('@') || !calendarUid) {
    return { ok: false, reason: 'missing_email_or_uid' };
  }
  if (!isMsGraphConfigured()) {
    return { ok: false, reason: 'not_configured' };
  }

  const enc = encodeURIComponent(email);
  try {
    if (variant === 'cancelled') {
      const existingId = await findEventId(email, calendarUid, startAt, endAt);
      if (existingId) {
        // Mark cancelled in place (shows "Canceled:" on Teams) then delete series.
        const canceledPayload = buildGraphEventPayload({
          title,
          location,
          description,
          calendarUid,
          startAt,
          endAt,
          canceled: true,
        });
        if (canceledPayload) {
          try {
            await graphFetch(`/users/${enc}/events/${encodeURIComponent(existingId)}`, {
              method: 'PATCH',
              body: canceledPayload,
            });
          } catch (e) {
            console.warn(`msGraph: cancel patch failed for ${email}:`, e.message);
          }
          try {
            await graphFetch(`/users/${enc}/events/${encodeURIComponent(existingId)}`, {
              method: 'DELETE',
            });
            return { ok: true, action: 'deleted', email };
          } catch (e) {
            // Patch already marked it canceled — still success for "show cancelled".
            console.warn(`msGraph: delete failed for ${email} (left as Canceled):`, e.message);
            return { ok: true, action: 'marked_canceled', email };
          }
        }
      }
      return { ok: true, action: 'not_found', email };
    }

    const payload = buildGraphEventPayload({
      title,
      location,
      description,
      calendarUid,
      startAt,
      endAt,
      canceled: false,
    });
    if (!payload) return { ok: false, reason: 'invalid_schedule', email };

    const existingId = await findEventId(email, calendarUid, startAt, endAt);
    if (existingId) {
      await graphFetch(`/users/${enc}/events/${encodeURIComponent(existingId)}`, {
        method: 'PATCH',
        body: payload,
      });
      return { ok: true, action: 'updated', email, eventId: existingId };
    }

    const created = await graphFetch(`/users/${enc}/events`, {
      method: 'POST',
      body: payload,
    });
    return { ok: true, action: 'created', email, eventId: created?.id || null };
  } catch (e) {
    console.warn(`msGraph: sync failed for ${email}:`, e.message);
    return { ok: false, reason: e.message || 'sync_failed', email };
  }
}

/** Sync all attendees; safe no-op when Graph env is not configured. */
export async function syncMsGraphActivityCalendars({
  attendeeEmails = [],
  variant = 'scheduled',
  title,
  location,
  description,
  startAt,
  endAt,
  calendarUid,
}) {
  if (!isMsGraphConfigured()) {
    return { configured: false, attempted: 0, ok: 0, results: [] };
  }
  const emails = [...new Set(
    (attendeeEmails || [])
      .map((e) => trim(e).toLowerCase())
      .filter((e) => e.includes('@')),
  )];
  const results = [];
  for (const email of emails) {
    results.push(await syncMsGraphRecipient({
      userEmail: email,
      variant,
      title,
      location,
      description,
      startAt,
      endAt,
      calendarUid,
    }));
  }
  return {
    configured: true,
    attempted: results.length,
    ok: results.filter((r) => r.ok).length,
    results,
  };
}
