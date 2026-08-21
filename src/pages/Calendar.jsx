import { useState, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { inputStyle } from '../styles/commonStyles';
import ScheduleEmailModal from '../components/ScheduleEmailModal';
import {
  CalendarActivityDetailSheet,
  CalendarActivityForm,
  CalendarCancelModal,
  CalendarDayActivitiesSheet,
  CalendarHeader,
  CalendarMonthGrid,
} from '../components/calendar';
import { useSubmitLock } from '../hooks/useSubmitLock';
import { useCalendarActivities } from '../hooks/useCalendarActivities';
import { activityLogicalGroupKey } from '../../lib/activityLogicalGroup.js';
import { canEditCalendarUser, normalizeRole, PMO_ROLES } from '../../lib/permissions.js';
import {
  DEFAULT_ACTIVITY_SITE_LOCATIONS,
  composeLocation,
  resolveLocationForForm,
} from '../constants/activityLocations';
import {
  ACTIVITY_TYPE_OPTIONS,
  MONTH_NAMES,
  activityCoveredDaysInMonth,
  activityCssClass,
  escapeHtml,
  firstNonEmpty,
  getCalendarGrid,
  getMonthRange,
  groupActivitiesForCalendar,
  isActivityOnDate,
  mergeValidImportPreviewRows,
  parseImportedReportFile,
  parseReportDateValue,
  rememberCancelledActivityKey,
  toApiDateTimeValue,
  toDatetimeLocalValue,
} from '../utils/calendarUtils.js';

export default function Calendar() {
  const today = new Date();
  const [searchParams, setSearchParams] = useSearchParams();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [people, setPeople] = useState([]);
  const [projects, setProjects] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [activitySites, setActivitySites] = useState(DEFAULT_ACTIVITY_SITE_LOCATIONS);
  const [form, setForm] = useState({
    person_ids: [],
    external_attendees: '',
    project_id: '',
    type: 'meeting',
    title: '',
    description: '',
    locationPreset: '',
    locationOther: '',
    start_at: '',
    end_at: '',
    notify_email: true,
  });
  const [personSearch, setPersonSearch] = useState('');
  const [editingActivityId, setEditingActivityId] = useState(null);
  const { user } = useAuth();
  const [detailActivityId, setDetailActivityId] = useState(null);
  const [pendingOpenActivityId, setPendingOpenActivityId] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelNotify, setCancelNotify] = useState(true);
  const [showReport, setShowReport] = useState(false);
  const [showScheduleEmail, setShowScheduleEmail] = useState(false);
  const [smtpConfigured, setSmtpConfigured] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const importPreviewHasSheetColumn = useMemo(
    () => Boolean(importPreview?.rows?.some((r) => r.source_sheet)),
    [importPreview],
  );
  const canEditCalendar = canEditCalendarUser(user);
  const canSyncRoster = Boolean(
    user && (normalizeRole(user.role) === 'admin' || PMO_ROLES.has(normalizeRole(user.role))),
  );

  const loadPeopleRoster = useCallback(async ({ syncIfEmpty = false } = {}) => {
    let roster = await api.people.list({ linked_only: '1' });
    if (
      syncIfEmpty
      && canSyncRoster
      && Array.isArray(roster)
      && roster.length === 0
    ) {
      try {
        await api.people.syncFromUsers();
        roster = await api.people.list({ linked_only: '1' });
      } catch (syncErr) {
        console.warn('Calendar people sync skipped', syncErr?.message || syncErr);
      }
    }
    return Array.isArray(roster) ? roster : [];
  }, [canSyncRoster]);

  /** Day of month (1–31) when the "all activities for this day" sheet is open. */
  const [dayListDay, setDayListDay] = useState(null);
  const [typeFilter, setTypeFilter] = useState('all');
  const { pending: mutating, run: runMutation } = useSubmitLock();

  const { rangeStartIso, rangeEndExclusiveIso } = useMemo(() => getMonthRange(year, month), [year, month]);
  const { activities, setActivities, loading, loadActivities } = useCalendarActivities(rangeStartIso, rangeEndExclusiveIso);
  const scheduleEmailRange = useMemo(() => {
    const pad = (n) => String(n).padStart(2, '0');
    const lastDay = new Date(year, month, 0).getDate();
    return {
      from: `${year}-${pad(month)}-01`,
      to: `${year}-${pad(month)}-${pad(lastDay)}`,
      label: `${MONTH_NAMES[month - 1]} ${year}`,
    };
  }, [year, month]);
  const grid = useMemo(() => getCalendarGrid(year, month), [year, month]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [roster, pr] = await Promise.all([
          loadPeopleRoster({ syncIfEmpty: true }),
          api.projects.list(),
        ]);
        if (!cancelled) {
          setPeople(roster);
          setProjects(Array.isArray(pr) ? pr : []);
        }
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadPeopleRoster]);

  useEffect(() => {
    const refreshSmtp = () => {
      api.activities.mailStatus()
        .then((r) => setSmtpConfigured(Boolean(r?.smtp_configured)))
        .catch(() => setSmtpConfigured(false));
    };
    refreshSmtp();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshSmtp();
    };
    window.addEventListener('focus', refreshSmtp);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', refreshSmtp);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.settings
      .get()
      .then((s) => {
        if (cancelled) return;
        const list = Array.isArray(s.activity_locations) && s.activity_locations.length > 0
          ? s.activity_locations.map((x) => String(x).trim()).filter(Boolean)
          : DEFAULT_ACTIVITY_SITE_LOCATIONS;
        setActivitySites(list.length ? list : DEFAULT_ACTIVITY_SITE_LOCATIONS);
      })
      .catch(() => {
        if (!cancelled) setActivitySites(DEFAULT_ACTIVITY_SITE_LOCATIONS);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useLayoutEffect(() => {
    if (!showForm || !activitySites.length) return;
    setForm((f) => {
      if (f.locationPreset) return f;
      return { ...f, locationPreset: activitySites[0], locationOther: '' };
    });
  }, [showForm, activitySites]);

  useEffect(() => {
    const anyOpen = showForm || detailActivityId != null || dayListDay != null || cancelTarget != null;
    if (!anyOpen) return;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (cancelTarget != null) setCancelTarget(null);
      else if (detailActivityId != null) setDetailActivityId(null);
      else if (dayListDay != null) setDayListDay(null);
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [showForm, detailActivityId, dayListDay, cancelTarget]);

  const groupedCalendarActivities = useMemo(() => groupActivitiesForCalendar(activities), [activities]);

  const filteredCalendarActivities = useMemo(() => {
    if (typeFilter === 'all') return groupedCalendarActivities;
    return groupedCalendarActivities.filter((a) => {
      const css = activityCssClass(a.type);
      return a.type === typeFilter || css === typeFilter;
    });
  }, [groupedCalendarActivities, typeFilter]);

  const monthStats = useMemo(() => {
    const total = groupedCalendarActivities.length;
    let daysWithEvents = 0;
    const typeCounts = {};
    groupedCalendarActivities.forEach((a) => {
      typeCounts[a.type] = (typeCounts[a.type] || 0) + 1;
    });
    for (let d = 1; d <= 31; d++) {
      if (groupedCalendarActivities.some((a) => isActivityOnDate(a, year, month, d))) daysWithEvents += 1;
    }
    const topEntry = Object.entries(typeCounts).sort((x, y) => y[1] - x[1])[0];
    return {
      total,
      daysWithEvents,
      topType: topEntry ? { type: topEntry[0], count: topEntry[1] } : null,
    };
  }, [groupedCalendarActivities, year, month]);

  useEffect(() => {
    if (detailActivityId == null) return;
    if (!activities.some((x) => x.id === detailActivityId)) setDetailActivityId(null);
  }, [activities, detailActivityId]);

  // Deep-link from notifications: /calendar?activity=<id>
  useEffect(() => {
    const raw = searchParams.get('activity');
    if (!raw) return undefined;
    const aid = Number(raw);
    if (!Number.isFinite(aid)) return undefined;
    let cancelled = false;
    (async () => {
      try {
        let row = activities.find((a) => Number(a.id) === aid);
        if (!row) {
          const all = await api.activities.list({});
          if (cancelled) return;
          row = (all || []).find((a) => Number(a.id) === aid);
        }
        if (!row || cancelled) return;
        const d = new Date(row.start_at);
        if (Number.isFinite(d.getTime())) {
          setYear(d.getFullYear());
          setMonth(d.getMonth() + 1);
        }
        setPendingOpenActivityId(aid);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) {
          const next = new URLSearchParams(searchParams);
          if (next.has('activity')) {
            next.delete('activity');
            setSearchParams(next, { replace: true });
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // Only react to the query param itself
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get('activity')]);

  useEffect(() => {
    if (pendingOpenActivityId == null || loading) return;
    const raw = activities.find((a) => Number(a.id) === pendingOpenActivityId);
    if (!raw) return;
    const key = activityLogicalGroupKey(raw);
    const grouped = groupedCalendarActivities.find((a) => activityLogicalGroupKey(a) === key);
    if (grouped) {
      setDetailActivityId(grouped.id);
      setPendingOpenActivityId(null);
    }
  }, [pendingOpenActivityId, loading, activities, groupedCalendarActivities]);

  const activitiesByDay = useMemo(() => {
    const byDay = {};
    for (let d = 1; d <= 31; d++) byDay[d] = [];
    filteredCalendarActivities.forEach((a) => {
      for (let d = 1; d <= 31; d++) {
        if (isActivityOnDate(a, year, month, d)) byDay[d].push(a);
      }
    });
    for (let d = 1; d <= 31; d++) {
      byDay[d].sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
    }
    return byDay;
  }, [filteredCalendarActivities, year, month]);

  useEffect(() => {
    setDayListDay(null);
    setTypeFilter('all');
  }, [year, month]);

  const submit = async (e) => {
    e.preventDefault();
    if (!canEditCalendar) {
      alert('Calendar edit access requires PMO or admin role.');
      return;
    }
    const extTrim = String(form.external_attendees || '').trim();
    if (!form.person_ids?.length && !extTrim) {
      alert('Select at least one person with an account, or enter guest names (no login required).');
      return;
    }
    if (!form.title?.trim()) {
      alert('Enter a title for the activity.');
      return;
    }
    if (!form.start_at || !form.end_at) {
      alert('Set both start and end date/time.');
      return;
    }
    const location = composeLocation(form.locationPreset, form.locationOther);
    if (!location) {
      alert('Please select a location or enter a custom one under Others.');
      return;
    }
    try {
      await runMutation(async () => {
        let result;
        if (editingActivityId != null) {
          result = await api.activities.update(editingActivityId, {
            person_ids: form.person_ids.map((pid) => +pid),
            external_attendees: extTrim,
            project_id: form.project_id || null,
            type: form.type,
            title: form.title,
            description: form.description || null,
            location,
            start_at: toApiDateTimeValue(form.start_at),
            end_at: toApiDateTimeValue(form.end_at),
            notify_email: form.notify_email,
          });
        } else {
          result = await api.activities.create({
            person_ids: form.person_ids.map((pid) => +pid),
            external_attendees: extTrim,
            project_id: form.project_id || undefined,
            type: form.type,
            title: form.title,
            description: form.description || undefined,
            location,
            start_at: toApiDateTimeValue(form.start_at),
            end_at: toApiDateTimeValue(form.end_at),
            notify_email: form.notify_email,
          });
        }
        const emailNotify = result?.email_notify;
        const isEdit = editingActivityId != null;
        if (form.notify_email) {
          const inApp = Number(emailNotify?.in_app) || 0;
          // Trust the API response only — client smtpConfigured can be stale after Settings save.
          if (emailNotify && emailNotify.smtp_configured === false && inApp === 0) {
            alert('Activity saved. Email was not sent because SMTP is not configured on the server.');
          } else if (emailNotify && emailNotify.sent > 0) {
            alert(
              isEdit
                ? `Activity updated. Notified ${inApp || emailNotify.sent} assignee(s) in-app; email sent to ${emailNotify.sent}.`
                : `Activity saved. Notified ${inApp || emailNotify.sent} assignee(s) in-app; email sent to ${emailNotify.sent}.`,
            );
          } else if (inApp > 0) {
            alert(
              isEdit
                ? `Activity updated. In-app notification sent to ${inApp} assignee(s).`
                : `Activity saved. In-app notification sent to ${inApp} assignee(s).`,
            );
          } else if (emailNotify?.in_app_error) {
            alert(`Activity saved, but in-app notification could not be stored: ${emailNotify.in_app_error}`);
          } else if (emailNotify && emailNotify.attempted > 0 && emailNotify.sent === 0) {
            alert('Activity saved, but email notification could not be delivered. Check assignee emails and SMTP settings.');
          } else if (emailNotify && emailNotify.attempted === 0) {
            alert('Activity saved. No email recipients found (assignees need a user email, or add guest emails).');
          } else {
            alert(isEdit ? 'Activity updated.' : 'Activity saved.');
          }
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('pmo:notifications-changed'));
          }
          api.activities.mailStatus()
            .then((r) => setSmtpConfigured(Boolean(r?.smtp_configured)))
            .catch(() => {});
        } else {
          alert(isEdit ? 'Activity updated.' : 'Activity saved.');
        }
        setForm({
          person_ids: [],
          external_attendees: '',
          project_id: '',
          type: 'meeting',
          title: '',
          description: '',
          locationPreset: activitySites[0] || '',
          locationOther: '',
          start_at: '',
          end_at: '',
          notify_email: true,
        });
        setPersonSearch('');
        setShowForm(false);
        setEditingActivityId(null);
        loadActivities(rangeStartIso, rangeEndExclusiveIso);
      });
    } catch (err) {
      const message = String(err?.message || err || '').trim()
        || 'Failed to save activity. Check your connection and try again.';
      alert(message);
    }
  };

  const filteredPeople = people.filter((p) => {
    const q = personSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      String(p.name || '').toLowerCase().includes(q)
      || String(p.email || '').toLowerCase().includes(q)
    );
  });

  /** Map stored activity person_id (people.id or legacy users_app.id) → people.id for the form. */
  const toRosterPersonId = (storedId) => {
    if (storedId == null || storedId === '') return null;
    const n = Number(storedId);
    if (!Number.isFinite(n)) return null;
    if (people.some((p) => Number(p.id) === n)) return String(n);
    const byUser = people.find((p) => Number(p.user_id) === n);
    return byUser?.id != null ? String(byUser.id) : null;
  };

  const togglePerson = (id) => {
    const sid = String(id);
    setForm((f) => ({
      ...f,
      person_ids: f.person_ids.includes(sid) ? f.person_ids.filter((x) => x !== sid) : [...f.person_ids, sid],
    }));
  };

  const prevMonth = () => { if (month === 1) { setMonth(12); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 12) { setMonth(1); setYear(y => y + 1); } else setMonth(m => m + 1); };
  const goToToday = () => { const d = new Date(); setYear(d.getFullYear()); setMonth(d.getMonth() + 1); };
  const isToday = (d) => d !== null && year === today.getFullYear() && month === today.getMonth() + 1 && d === today.getDate();

  const toggleActivityDetail = (id) => {
    setDayListDay(null);
    setDetailActivityId((prev) => (prev === id ? null : id));
  };

  const openCreateForm = () => {
    if (!canEditCalendar) return;
    setEditingActivityId(null);
    setForm((f) => ({
      ...f,
      person_ids: [],
      external_attendees: '',
      project_id: '',
      type: 'meeting',
      title: '',
      description: '',
      locationPreset: activitySites[0] || f.locationPreset || '',
      locationOther: '',
      start_at: '',
      end_at: '',
      notify_email: true,
    }));
    setPersonSearch('');
    setShowForm(true);
    loadPeopleRoster({ syncIfEmpty: true })
      .then(setPeople)
      .catch((e) => console.error(e));
  };

  const openCreateForDay = (day) => {
    if (!canEditCalendar || day == null) return;
    const pad = (n) => String(n).padStart(2, '0');
    const dateStr = `${year}-${pad(month)}-${pad(day)}`;
    setEditingActivityId(null);
    setForm((f) => ({
      ...f,
      person_ids: [],
      external_attendees: '',
      project_id: '',
      type: 'meeting',
      title: '',
      description: '',
      locationPreset: activitySites[0] || f.locationPreset || '',
      locationOther: '',
      start_at: `${dateStr}T09:00`,
      end_at: `${dateStr}T17:00`,
      notify_email: true,
    }));
    setPersonSearch('');
    setShowForm(true);
    loadPeopleRoster({ syncIfEmpty: true })
      .then(setPeople)
      .catch((e) => console.error(e));
  };

  const openEditActivity = (a) => {
    if (!canEditCalendar) return;
    const rawIds = Array.isArray(a.person_ids) && a.person_ids.length
      ? a.person_ids
      : (a.person_id != null ? [a.person_id] : []);
    const personIds = [...new Set(rawIds.map(toRosterPersonId).filter(Boolean))];
    const { preset, custom } = resolveLocationForForm(a.location, activitySites);
    setForm({
      person_ids: personIds,
      external_attendees: String(a.external_attendees || '').trim(),
      project_id: a.project_id != null ? String(a.project_id) : '',
      type: a.type === 'task' ? 'outstation' : (ACTIVITY_TYPE_OPTIONS.some((x) => x.value === a.type) ? a.type : 'meeting'),
      title: a.title || '',
      description: a.description || '',
      locationPreset: preset || (activitySites[0] || ''),
      locationOther: custom,
      start_at: toDatetimeLocalValue(a.start_at),
      end_at: toDatetimeLocalValue(a.end_at),
      notify_email: true,
    });
    setPersonSearch('');
    setEditingActivityId(a.id);
    setDetailActivityId(null);
    setDayListDay(null);
    setShowForm(true);
    loadPeopleRoster({ syncIfEmpty: true })
      .then(setPeople)
      .catch((e) => console.error(e));
  };

  const resendActivityEmail = async (a) => {
    if (!canEditCalendar || !a?.id) return;
    await runMutation(async () => {
      try {
        const result = await api.activities.notify(a.id);
        alert(`Notification sent to ${result.notified} recipient(s).`);
      } catch (err) {
        alert(err.message);
      }
    });
  };

  const requestCancelActivity = (a) => {
    if (!canEditCalendar || !a?.id) return;
    setCancelNotify(true);
    setCancelTarget(a);
  };

  const confirmCancelActivity = async () => {
    const a = cancelTarget;
    if (!canEditCalendar || !a?.id) return;
    const notify = Boolean(cancelNotify);
    const cancelKey = activityLogicalGroupKey(a);
    setCancelTarget(null);
    await runMutation(async () => {
      try {
        const result = await api.activities.cancel(a.id, { notify_email: notify });
        // Persist cancel locally so auto-reload cannot flash the activity back.
        rememberCancelledActivityKey(cancelKey);
        // Remove from UI immediately so the chip disappears even before reload finishes.
        setActivities((prev) => prev.filter((row) => activityLogicalGroupKey(row) !== cancelKey));
        const emailNotify = result?.email_notify;
        if (!notify) {
          alert('Activity cancelled.');
        } else if (emailNotify?.smtp_configured === false && !(Number(emailNotify?.in_app) > 0)) {
          alert('Activity cancelled. Email was not sent because SMTP is not configured.');
        } else if (emailNotify && emailNotify.sent > 0) {
          const inApp = Number(emailNotify?.in_app) || 0;
          alert(
            inApp > 0
              ? `Activity cancelled. Notified ${inApp} assignee(s) in-app; cancellation email sent to ${emailNotify.sent}.`
              : `Activity cancelled. Cancellation email sent to ${emailNotify.sent} recipient(s).`,
          );
        } else if (Number(emailNotify?.in_app) > 0) {
          alert(`Activity cancelled. In-app notification sent to ${emailNotify.in_app} assignee(s).`);
        } else if (emailNotify && emailNotify.attempted > 0 && emailNotify.sent === 0) {
          alert('Activity cancelled, but cancellation email could not be delivered. Check assignee emails and SMTP settings.');
        } else {
          alert('Activity cancelled.');
        }
        setDetailActivityId(null);
        setDayListDay(null);
        if (editingActivityId === a.id) {
          setShowForm(false);
          setEditingActivityId(null);
        }
        await loadActivities(rangeStartIso, rangeEndExclusiveIso);
      } catch (err) {
        alert(err.message);
        await loadActivities(rangeStartIso, rangeEndExclusiveIso);
      }
    });
  };

  const detailActivity = detailActivityId != null ? groupedCalendarActivities.find((x) => x.id === detailActivityId) : null;
  const dayListActivities = dayListDay != null ? (activitiesByDay[dayListDay] ?? []) : [];
  const clientByProjectId = useMemo(
    () => Object.fromEntries(projects.map((p) => [String(p.id), p.client_name || '-'])),
    [projects],
  );
  const reportRows = useMemo(() => {
    const rows = [];
    for (const a of activities) {
      const coveredDays = activityCoveredDaysInMonth(a, year, month);
      if (coveredDays.length === 0) continue;
      for (const day of coveredDays) {
        rows.push({
          sort_date: new Date(year, month - 1, day).getTime(),
          date: new Date(year, month - 1, day).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
          staff_name: [a.person_name, a.external_attendees].filter(Boolean).join(', ') || '-',
          client: a.project_id != null ? clientByProjectId[String(a.project_id)] || '-' : '-',
          title: a.title || '-',
          location: a.location || '-',
        });
      }
    }
    rows.sort((x, y) => x.sort_date - y.sort_date || x.staff_name.localeCompare(y.staff_name));
    return rows;
  }, [activities, clientByProjectId, year, month]);

  const buildImportPreview = (editableRows, fileName = 'import-file') => {
    const personByName = new Map(people.map((p) => [String(p.name || '').trim().toLowerCase(), p]));
    const personByEmail = new Map(people.map((p) => [String(p.email || '').trim().toLowerCase(), p]));
    const projectByClient = new Map();
    projects.forEach((p) => {
      const names = (p.clients || []).map((c) => c.name).filter(Boolean);
      if (names.length) {
        names.forEach((n) => projectByClient.set(String(n).trim().toLowerCase(), p));
      } else if (String(p.client_name || '').trim()) {
        String(p.client_name)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((n) => projectByClient.set(n.toLowerCase(), p));
      }
    });
    const toIso = (dateLike, hh, mm) => {
      const d = parseReportDateValue(dateLike);
      if (!d) return '';
      const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm, 0, 0);
      return x.toISOString();
    };
    const rowsOut = [];
    editableRows.forEach((raw) => {
      const dateText = String(raw.date || '').trim();
      const staffText = String(raw.staff_name || '').trim();
      const title = String(raw.title || '').trim();
      const location = String(raw.location || '').trim();
      const client = String(raw.client || '').trim();
      const sourceSheet = String(raw.sheet || '').trim();
      const previewKey = String(raw.preview_key || '').trim() || `p-${raw.row}-${sourceSheet}`;
      const omit = Boolean(raw.omit);
      const base = {
        preview_key: previewKey,
        omit,
        row: raw.row,
        source_sheet: sourceSheet || undefined,
        date: dateText,
        staff_name: staffText,
        client: client || '-',
        title,
        location,
      };
      if (!dateText || !staffText || !title || !location) {
        rowsOut.push({ ...base, status: 'invalid', reason: 'Missing required columns (Date/Staff Name/Title/Location)' });
        return;
      }
      const startIso = toIso(dateText, 9, 0);
      const endIso = toIso(dateText, 17, 0);
      if (!startIso || !endIso) {
        rowsOut.push({ ...base, status: 'invalid', reason: `Invalid date "${dateText}"` });
        return;
      }
      const staffTokens = String(staffText).split(',').map((s) => s.trim()).filter(Boolean);
      const personIds = [];
      const resolvedNames = [];
      const guestLines = [];
      staffTokens.forEach((token) => {
        const key = token.toLowerCase();
        const pe = key.includes('@') ? personByEmail.get(key) : personByName.get(key);
        if (pe?.id != null) {
          personIds.push(Number(pe.id));
          if (pe.name) resolvedNames.push(String(pe.name));
        } else {
          guestLines.push({ token: String(token).trim(), kind: key.includes('@') ? 'email_unknown' : 'name_unknown' });
        }
      });
      const externalDisplay = guestLines.map((g) => g.token).filter(Boolean).join(', ');
      if (personIds.length === 0 && !externalDisplay) {
        rowsOut.push({ ...base, status: 'invalid', reason: `No matched team member and no usable guest text in "${staffText}"` });
        return;
      }
      const assignee_status =
        guestLines.length === 0
          ? ''
          : [
              personIds.length ? `${personIds.length} on roster` : null,
              guestLines.some((g) => g.kind === 'email_unknown') ? 'Some emails not on roster' : null,
              guestLines.some((g) => g.kind === 'name_unknown') ? 'Some names not on roster' : null,
            ].filter(Boolean).join(' · ');
      const project = projectByClient.get(String(client).trim().toLowerCase());
      const descParts = [];
      if (resolvedNames.length) descParts.push(`Imported (roster): ${[...new Set(resolvedNames)].join(', ')}`);
      if (externalDisplay) descParts.push(`Guests: ${externalDisplay}`);
      rowsOut.push({
        ...base,
        status: 'valid',
        reason: '',
        resolved_staff: [...new Set(resolvedNames)].join(', '),
        assignee_status: assignee_status || undefined,
        task: {
          person_ids: [...new Set(personIds)],
          external_attendees: externalDisplay || undefined,
          project_id: project?.id || undefined,
          type: 'meeting',
          title,
          location,
          start_at: startIso,
          end_at: endIso,
          description: descParts.length ? descParts.join(' | ') : undefined,
          import_client_name: client || '',
        },
      });
    });
    const rowsActive = rowsOut.filter((r) => !r.omit);
    const validCount = rowsActive.filter((x) => x.status === 'valid').length;
    const invalidCount = rowsActive.filter((x) => x.status !== 'valid').length;
    const activityCreateCount = mergeValidImportPreviewRows(rowsActive.filter((x) => x.status === 'valid')).length;
    return {
      fileName,
      rows: rowsOut,
      validCount,
      invalidCount,
      activityCreateCount,
    };
  };

  const downloadReportExcel = () => {
    const title = `Activity Report - ${MONTH_NAMES[month - 1]} ${year}`;
    const generatedAt = new Date().toLocaleString();
    const rowsHtml = reportRows.length
      ? reportRows
          .map(
            (r) => `<tr>
<td>${escapeHtml(r.date)}</td>
<td>${escapeHtml(r.staff_name)}</td>
<td>${escapeHtml(r.client)}</td>
<td>${escapeHtml(r.title)}</td>
<td>${escapeHtml(r.location)}</td>
</tr>`,
          )
          .join('')
      : '<tr><td colspan="5" style="text-align:center;color:#6b7280;">No activity for this month.</td></tr>';
    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: Calibri, Arial, sans-serif; color: #111827; }
    .title { font-size: 16pt; font-weight: 700; margin-bottom: 4px; }
    .meta { font-size: 10pt; color: #4b5563; margin: 2px 0; }
    table { border-collapse: collapse; width: 100%; margin-top: 12px; }
    th, td { border: 1px solid #d1d5db; padding: 6px 8px; font-size: 10.5pt; }
    th { background: #e5e7eb; font-weight: 700; text-align: left; }
    tr:nth-child(even) td { background: #f9fafb; }
  </style>
</head>
<body>
  <div class="title">${escapeHtml(title)}</div>
  <div class="meta">Month: ${escapeHtml(MONTH_NAMES[month - 1])}</div>
  <div class="meta">Year: ${escapeHtml(year)}</div>
  <div class="meta">Generated at: ${escapeHtml(generatedAt)}</div>
  <table>
    <colgroup>
      <col style="width: 120px;" />
      <col style="width: 220px;" />
      <col style="width: 220px;" />
      <col style="width: 240px;" />
      <col style="width: 220px;" />
    </colgroup>
    <thead>
      <tr>
        <th>Date</th>
        <th>Staff Name</th>
        <th>Client</th>
        <th>Title</th>
        <th>Location</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
</body>
</html>`;
    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity_report_${year}_${String(month).padStart(2, '0')}.xls`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const importReportExcel = async (file) => {
    if (!file) return;
    const name = String(file.name || '').toLowerCase();
    if (!(name.endsWith('.xls') || name.endsWith('.csv') || name.endsWith('.xlsx'))) {
      alert('Please import .xls, .xlsx, or .csv file.');
      return;
    }
    const rows = await parseImportedReportFile(file);
    if (rows.length === 0) {
      alert('No rows found in imported file.');
      return;
    }
    const editableRows = [];
    rows.forEach((r, idx) => {
      const dateText = firstNonEmpty(r, ['date', 'activity date', 'day', 'tarikh', 'date tarikh']);
      const staffText = firstNonEmpty(r, ['staff name', 'staff', 'person', 'assignee', 'nama staff', 'nama staf', 'nama staff staff name']);
      const title = firstNonEmpty(r, ['title', 'activity', 'tujuan', 'tujuan title']);
      const location = firstNonEmpty(r, ['location', 'tempat', 'tempat location']);
      const client = firstNonEmpty(r, ['client', 'organisasi', 'organization', 'organisasi client', 'client organisasi']);
      editableRows.push({
        row: idx + 2,
        sheet: String(r.__sheet || '').trim(),
        preview_key: `imp-${String(r.__sheet || 'default')}-${idx}`,
        date: dateText,
        staff_name: staffText,
        client: client || '-',
        title: title || '',
        location: location || '',
      });
    });
    const preview = buildImportPreview(editableRows, file.name || 'import-file');
    if (preview.validCount === 0) {
      const invalidRows = preview.rows.filter((x) => x.status !== 'valid');
      alert(
        `No valid rows to import.\n${invalidRows
          .slice(0, 6)
          .map((x) => `Row ${x.row}${x.source_sheet ? ` (${x.source_sheet})` : ''}: ${x.reason}`)
          .join('\n')}`,
      );
      return;
    }
    setImportPreview(preview);
  };

  const updateImportPreviewCell = (previewKey, field, value) => {
    setImportPreview((prev) => {
      if (!prev) return prev;
      const editableRows = prev.rows.map((r) => ({
        preview_key: r.preview_key,
        omit: r.omit,
        row: r.row,
        sheet: r.source_sheet || '',
        date: r.date,
        staff_name: r.staff_name,
        client: r.client,
        title: r.title,
        location: r.location,
      }));
      const nextRows = editableRows.map((r) => (r.preview_key === previewKey ? { ...r, [field]: value } : r));
      return buildImportPreview(nextRows, prev.fileName);
    });
  };

  const omitImportRow = (previewKey) => {
    setImportPreview((prev) => {
      if (!prev) return prev;
      const nextRows = prev.rows.map((r) => (r.preview_key === previewKey ? { ...r, omit: true } : r));
      const rowsActive = nextRows.filter((r) => !r.omit);
      const validCount = rowsActive.filter((x) => x.status === 'valid').length;
      const invalidCount = rowsActive.filter((x) => x.status !== 'valid').length;
      const activityCreateCount = mergeValidImportPreviewRows(rowsActive.filter((x) => x.status === 'valid')).length;
      return { ...prev, rows: nextRows, validCount, invalidCount, activityCreateCount };
    });
  };

  const restoreImportRow = (previewKey) => {
    setImportPreview((prev) => {
      if (!prev) return prev;
      const nextRows = prev.rows.map((r) => (r.preview_key === previewKey ? { ...r, omit: false } : r));
      const rowsActive = nextRows.filter((r) => !r.omit);
      const validCount = rowsActive.filter((x) => x.status === 'valid').length;
      const invalidCount = rowsActive.filter((x) => x.status !== 'valid').length;
      const activityCreateCount = mergeValidImportPreviewRows(rowsActive.filter((x) => x.status === 'valid')).length;
      return { ...prev, rows: nextRows, validCount, invalidCount, activityCreateCount };
    });
  };

  const confirmImportPreview = async () => {
    if (!importPreview) return;
    const validRows = importPreview.rows.filter((x) => x.status === 'valid' && !x.omit);
    const mergedValid = mergeValidImportPreviewRows(validRows);
    const tasks = mergedValid.map((x) => x.task).filter(Boolean);
    if (tasks.length === 0) {
      alert('No valid rows to import.');
      return;
    }

    const syncImportedLocations = async () => {
      const incoming = [...new Set(tasks.map((t) => String(t.location || '').trim()).filter(Boolean))];
      if (incoming.length === 0) return { added: 0, names: [] };
      try {
        const settings = await api.settings.get();
        const existing = Array.isArray(settings?.activity_locations) && settings.activity_locations.length > 0
          ? settings.activity_locations.map((x) => String(x).trim()).filter(Boolean)
          : [...DEFAULT_ACTIVITY_SITE_LOCATIONS];
        const existingSet = new Set(existing.map((x) => x.toLowerCase()));
        const toAdd = incoming.filter((loc) => !existingSet.has(loc.toLowerCase()));
        if (toAdd.length === 0) return { added: 0, names: [] };
        const nextLocations = [...existing, ...toAdd];
        const nextMileage = settings?.mileage_from_office_km && typeof settings.mileage_from_office_km === 'object'
          ? { ...settings.mileage_from_office_km }
          : {};
        toAdd.forEach((loc) => {
          if (nextMileage[loc] === undefined || nextMileage[loc] === null || nextMileage[loc] === '') {
            nextMileage[loc] = 0;
          }
        });
        const saved = await api.settings.update({
          activity_locations: nextLocations,
          mileage_from_office_km: nextMileage,
        });
        const finalList = Array.isArray(saved?.activity_locations) && saved.activity_locations.length > 0
          ? saved.activity_locations.map((x) => String(x).trim()).filter(Boolean)
          : nextLocations;
        setActivitySites(finalList.length ? finalList : DEFAULT_ACTIVITY_SITE_LOCATIONS);
        return { added: toAdd.length, names: toAdd };
      } catch (e) {
        console.warn('import: could not sync new locations to settings', e?.message || e);
        return { added: 0, names: [], failed: true };
      }
    };

    const syncImportedClients = async () => {
      const incoming = [
        ...new Set(
          tasks
            .map((t) => String(t.import_client_name || '').trim())
            .filter((x) => x !== '' && x !== '-'),
        ),
      ];
      if (incoming.length === 0) return { added: 0, names: [] };
      try {
        const existingClients = await api.clients.list();
        const existingSet = new Set(
          (Array.isArray(existingClients) ? existingClients : [])
            .map((c) => String(c?.name || '').trim().toLowerCase())
            .filter(Boolean),
        );
        const toAdd = incoming.filter((name) => !existingSet.has(name.toLowerCase()));
        for (const name of toAdd) {
          // eslint-disable-next-line no-await-in-loop
          await api.clients.create({ name });
        }
        return { added: toAdd.length, names: toAdd };
      } catch (e) {
        console.warn('import: could not sync new clients', e?.message || e);
        return { added: 0, names: [], failed: true };
      }
    };

    setImporting(true);
    try {
      const locationSync = await syncImportedLocations();
      const clientSync = await syncImportedClients();
      await runMutation(async () => {
        for (const body of tasks) {
          const { import_client_name: _clientName, ...payload } = body;
          // sequential by design: keeps API pressure low and easy to track failures
          // eslint-disable-next-line no-await-in-loop
          await api.activities.create(payload);
        }
      });
      await loadActivities(rangeStartIso, rangeEndExclusiveIso);
      const locationMsg = locationSync.added > 0
        ? ` Added ${locationSync.added} new location(s) to Settings list.`
        : '';
      const clientMsg = clientSync.added > 0
        ? ` Added ${clientSync.added} new client(s).`
        : '';
      const mergeNote =
        validRows.length > tasks.length
          ? ` Combined ${validRows.length} valid rows that shared the same date, time window, title, location, and client.`
          : '';
      alert(
        `Imported ${tasks.length} ${tasks.length === 1 ? 'activity' : 'activities'}.${mergeNote}${importPreview.invalidCount ? ` Skipped ${importPreview.invalidCount} row(s).` : ''}${locationMsg}${clientMsg}`,
      );
      setImportPreview(null);
    } catch (e) {
      alert(e?.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="page-module calendar-page">
      <CalendarHeader
        canEditCalendar={canEditCalendar}
        importing={importing}
        mutating={mutating}
        onCreate={openCreateForm}
        onImportFile={importReportExcel}
        onOpenReport={() => setShowReport(true)}
        onOpenScheduleEmail={() => setShowScheduleEmail(true)}
        monthStats={monthStats}
        month={month}
        year={year}
      />
      {showScheduleEmail && (
        <ScheduleEmailModal
          open={showScheduleEmail}
          onClose={() => setShowScheduleEmail(false)}
          rangeFrom={scheduleEmailRange.from}
          rangeTo={scheduleEmailRange.to}
          periodLabel={scheduleEmailRange.label}
        />
      )}
      {showReport && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-dialog modal-dialog--wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="activity-report-modal-title"
          >
            <div className="modal-dialog-header">
              <h2 id="activity-report-modal-title" className="modal-dialog-title">
                Activity report (Month: {MONTH_NAMES[month - 1]} | Year: {year})
              </h2>
              <button type="button" className="modal-dialog-close" onClick={() => setShowReport(false)} aria-label="Close dialog">
                ×
              </button>
            </div>
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{ padding: '0.3rem 0.6rem', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface-hover)', fontSize: '0.82rem' }}>
                    Rows: <strong>{reportRows.length}</strong>
                  </span>
                  <span style={{ padding: '0.3rem 0.6rem', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface-hover)', fontSize: '0.82rem' }}>
                    Month: <strong>{MONTH_NAMES[month - 1]}</strong>
                  </span>
                  <span style={{ padding: '0.3rem 0.6rem', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface-hover)', fontSize: '0.82rem' }}>
                    Year: <strong>{year}</strong>
                  </span>
                </div>
              </div>
              <button type="button" className="btn btn-primary" onClick={downloadReportExcel}>
                Download Excel
              </button>
            </div>
            <div style={{ maxHeight: '70vh', overflow: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', background: 'var(--surface-hover)' }}>
                    <th style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--surface-hover)', padding: '0.6rem 0.7rem', whiteSpace: 'nowrap' }}>Date</th>
                    <th style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--surface-hover)', padding: '0.6rem 0.7rem' }}>Staff Name</th>
                    <th style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--surface-hover)', padding: '0.6rem 0.7rem' }}>Client</th>
                    <th style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--surface-hover)', padding: '0.6rem 0.7rem' }}>Title</th>
                    <th style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--surface-hover)', padding: '0.6rem 0.7rem' }}>Location</th>
                  </tr>
                </thead>
                <tbody>
                  {reportRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: '0.9rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                        No activity for this month.
                      </td>
                    </tr>
                  ) : (
                    reportRows.map((r, idx) => (
                      <tr
                        key={`${r.date}-${r.staff_name}-${r.title}-${idx}`}
                        style={{
                          borderBottom: '1px solid var(--border)',
                          background: idx % 2 === 0 ? 'transparent' : 'var(--surface-hover)',
                        }}
                      >
                        <td style={{ padding: '0.58rem 0.7rem', whiteSpace: 'nowrap' }}>{r.date}</td>
                        <td style={{ padding: '0.58rem 0.7rem' }}>{r.staff_name}</td>
                        <td style={{ padding: '0.58rem 0.7rem' }}>{r.client}</td>
                        <td style={{ padding: '0.58rem 0.7rem' }}>{r.title}</td>
                        <td style={{ padding: '0.58rem 0.7rem' }}>{r.location}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {importPreview && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-dialog"
            style={{ width: 'min(1200px, 95vw)', maxWidth: '95vw' }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="activity-import-preview-modal-title"
          >
            <div className="modal-dialog-header">
              <h2 id="activity-import-preview-modal-title" className="modal-dialog-title">
                Import preview ({importPreview.fileName})
              </h2>
              <button type="button" className="modal-dialog-close" onClick={() => setImportPreview(null)} aria-label="Close dialog" disabled={importing}>
                ×
              </button>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem', alignItems: 'center' }}>
              <span style={{ padding: '0.3rem 0.6rem', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface-hover)', fontSize: '0.82rem' }}>
                Valid rows: <strong>{importPreview.validCount}</strong>
              </span>
              <span style={{ padding: '0.3rem 0.6rem', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface-hover)', fontSize: '0.82rem' }}>
                Activities to create: <strong>{importPreview.activityCreateCount ?? importPreview.validCount}</strong>
              </span>
              {importPreview.validCount > (importPreview.activityCreateCount ?? importPreview.validCount) ? (
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', maxWidth: '42rem' }}>
                  Rows with the same date, title, location, and client (and same time window) are merged into one calendar activity with all staff.
                </span>
              ) : null}
              <span style={{ padding: '0.3rem 0.6rem', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface-hover)', fontSize: '0.82rem' }}>
                Skipped: <strong>{importPreview.invalidCount}</strong>
              </span>
              {importPreview.rows.some((x) => x.omit) ? (
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  Removed from import: {importPreview.rows.filter((x) => x.omit).length} (use Restore to undo)
                </span>
              ) : null}
            </div>
            <div style={{ maxHeight: '70vh', overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', background: 'var(--surface-hover)' }}>
                    <th style={{ padding: '0.55rem 0.6rem' }}>Row</th>
                    {importPreviewHasSheetColumn ? (
                      <th style={{ padding: '0.55rem 0.6rem' }}>Sheet</th>
                    ) : null}
                    <th style={{ padding: '0.55rem 0.6rem' }}>Date</th>
                    <th style={{ padding: '0.55rem 0.6rem' }}>Staff</th>
                    <th style={{ padding: '0.55rem 0.6rem' }}>Client</th>
                    <th style={{ padding: '0.55rem 0.6rem' }}>Title</th>
                    <th style={{ padding: '0.55rem 0.6rem' }}>Location</th>
                    <th style={{ padding: '0.55rem 0.6rem' }}>Status</th>
                    <th style={{ padding: '0.55rem 0.6rem' }}> </th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.rows.map((r, idx) => (
                    <tr
                      key={r.preview_key || `${r.source_sheet || ''}-${r.row}-${idx}`}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        opacity: r.omit ? 0.45 : 1,
                        background: r.omit ? 'var(--surface-hover)' : undefined,
                      }}
                    >
                      <td style={{ padding: '0.55rem 0.6rem' }}>{r.row}</td>
                      {importPreviewHasSheetColumn ? (
                        <td style={{ padding: '0.55rem 0.6rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                          {r.source_sheet || '—'}
                        </td>
                      ) : null}
                      <td style={{ padding: '0.45rem 0.5rem' }}>
                        <input
                          type="text"
                          value={r.date || ''}
                          onChange={(e) => updateImportPreviewCell(r.preview_key, 'date', e.target.value)}
                          style={{ ...inputStyle, margin: 0, minWidth: 120 }}
                          disabled={importing || r.omit}
                        />
                      </td>
                      <td style={{ padding: '0.45rem 0.5rem' }}>
                        <input
                          type="text"
                          value={r.staff_name || ''}
                          onChange={(e) => updateImportPreviewCell(r.preview_key, 'staff_name', e.target.value)}
                          style={{ ...inputStyle, margin: 0, minWidth: 180 }}
                          disabled={importing || r.omit}
                        />
                        {r.resolved_staff ? <div style={{ marginTop: 4, color: 'var(--text-muted)', fontSize: '0.78rem' }}>{r.resolved_staff}</div> : null}
                      </td>
                      <td style={{ padding: '0.45rem 0.5rem' }}>
                        <input
                          type="text"
                          value={r.client || ''}
                          onChange={(e) => updateImportPreviewCell(r.preview_key, 'client', e.target.value)}
                          style={{ ...inputStyle, margin: 0, minWidth: 140 }}
                          disabled={importing || r.omit}
                        />
                      </td>
                      <td style={{ padding: '0.45rem 0.5rem' }}>
                        <input
                          type="text"
                          value={r.title || ''}
                          onChange={(e) => updateImportPreviewCell(r.preview_key, 'title', e.target.value)}
                          style={{ ...inputStyle, margin: 0, minWidth: 180 }}
                          disabled={importing || r.omit}
                        />
                      </td>
                      <td style={{ padding: '0.45rem 0.5rem' }}>
                        <input
                          type="text"
                          value={r.location || ''}
                          onChange={(e) => updateImportPreviewCell(r.preview_key, 'location', e.target.value)}
                          style={{ ...inputStyle, margin: 0, minWidth: 140 }}
                          disabled={importing || r.omit}
                        />
                      </td>
                      <td style={{ padding: '0.55rem 0.6rem', color: r.status === 'valid' ? 'var(--success)' : 'var(--danger)', verticalAlign: 'top' }}>
                        {r.omit ? (
                          <span style={{ color: 'var(--text-muted)' }}>Not imported</span>
                        ) : r.status === 'valid' ? (
                          <div>
                            <div>Ready</div>
                            {r.assignee_status ? (
                              <div style={{ marginTop: 4, fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                                {r.assignee_status}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          r.reason
                        )}
                      </td>
                      <td style={{ padding: '0.45rem 0.5rem', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                        {r.omit ? (
                          <button type="button" className="btn btn-secondary btn-sm" disabled={importing} onClick={() => restoreImportRow(r.preview_key)}>
                            Restore
                          </button>
                        ) : (
                          <button type="button" className="btn btn-secondary btn-sm" disabled={importing} onClick={() => omitImportRow(r.preview_key)}>
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.85rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-primary" onClick={confirmImportPreview} disabled={importing || importPreview.validCount === 0}>
                {importing
                  ? 'Importing…'
                  : `Confirm import (${importPreview.activityCreateCount ?? importPreview.validCount} ${(importPreview.activityCreateCount ?? importPreview.validCount) === 1 ? 'activity' : 'activities'})`}
              </button>
            </div>
          </div>
        </div>
      )}
      <CalendarActivityForm
        open={showForm}
        editingActivityId={editingActivityId}
        form={form}
        setForm={setForm}
        filteredPeople={filteredPeople}
        canSyncRoster={canSyncRoster}
        projects={projects}
        activitySites={activitySites}
        personSearch={personSearch}
        setPersonSearch={setPersonSearch}
        togglePerson={togglePerson}
        onSubmit={submit}
        onClose={() => { setShowForm(false); setEditingActivityId(null); }}
        mutating={mutating}
        smtpConfigured={smtpConfigured}
        userRole={user?.role}
      />
      <CalendarMonthGrid
        year={year}
        month={month}
        grid={grid}
        activitiesByDay={activitiesByDay}
        loading={loading}
        canEditCalendar={canEditCalendar}
        detailActivityId={detailActivityId}
        typeFilter={typeFilter}
        setTypeFilter={setTypeFilter}
        groupedCalendarActivities={groupedCalendarActivities}
        filteredCalendarActivities={filteredCalendarActivities}
        isToday={isToday}
        today={today}
        prevMonth={prevMonth}
        nextMonth={nextMonth}
        goToToday={goToToday}
        openCreateForDay={openCreateForDay}
        toggleActivityDetail={toggleActivityDetail}
        onOpenDayList={(day) => {
          setDetailActivityId(null);
          setDayListDay(day);
        }}
      />
      {dayListDay != null && dayListActivities.length > 0 && (
        <CalendarDayActivitiesSheet
          year={year}
          month={month}
          day={dayListDay}
          activities={dayListActivities}
          onClose={() => setDayListDay(null)}
          detailActivityId={detailActivityId}
          onToggleDetail={toggleActivityDetail}
        />
      )}
      {detailActivity && (
        <CalendarActivityDetailSheet
          activity={detailActivity}
          onClose={() => setDetailActivityId(null)}
          onEdit={openEditActivity}
          onCancel={requestCancelActivity}
          onNotify={resendActivityEmail}
          actionPending={mutating}
          canEdit={canEditCalendar}
          smtpConfigured={smtpConfigured}
        />
      )}
      <CalendarCancelModal
        activity={cancelTarget}
        cancelNotify={cancelNotify}
        setCancelNotify={setCancelNotify}
        smtpConfigured={smtpConfigured}
        mutating={mutating}
        onConfirm={confirmCancelActivity}
        onClose={() => setCancelTarget(null)}
      />
    </div>
  );
}
