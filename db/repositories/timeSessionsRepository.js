import { nextId } from '../runtime/helpers.js';
import { isDbMode, dbSelect, dbInsert, dbUpdate } from '../runtime/query.js';

function roundHoursFromMinutes(minutes) {
  const m = Math.max(0, Number(minutes) || 0);
  return Math.round((m / 60) * 10) / 10;
}

function elapsedMinutes(startedAt, endedAt = new Date()) {
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.max(1, Math.round((end - start) / 60000));
}

export function createTimeSessionsRepository(ctx, getStore) {
  const { getData, save } = ctx;

  async function listSessions(filters = {}) {
    if (!isDbMode()) {
      let rows = [...(getData().task_time_sessions || [])];
      if (filters.person_id != null) {
        rows = rows.filter((r) => Number(r.person_id) === Number(filters.person_id));
      }
      if (filters.task_id != null) {
        rows = rows.filter((r) => Number(r.task_id) === Number(filters.task_id));
      }
      if (filters.open_only) {
        rows = rows.filter((r) => r.ended_at == null);
      }
      return rows;
    }
    const dbFilters = {};
    if (filters.person_id != null) dbFilters.person_id = Number(filters.person_id);
    if (filters.task_id != null) dbFilters.task_id = Number(filters.task_id);
    if (filters.open_only) dbFilters.ended_at = null;
    return dbSelect('task_time_sessions', {
      columns: '*',
      filters: dbFilters,
      order: 'id',
      ascending: false,
    });
  }

  async function findOpenSessionForPerson(personId) {
    const rows = await listSessions({ person_id: personId, open_only: true });
    return rows[0] || null;
  }

  async function getSessionById(id) {
    if (!isDbMode()) {
      return (getData().task_time_sessions || []).find((r) => Number(r.id) === Number(id)) || null;
    }
    return dbSelect('task_time_sessions', {
      columns: '*',
      filters: { id: Number(id) },
      maybeSingle: true,
    });
  }

  async function createSession({ task_id, person_id, project_id, started_at }) {
    const row = {
      task_id: Number(task_id),
      person_id: Number(person_id),
      project_id: Number(project_id),
      started_at: started_at || new Date().toISOString(),
      ended_at: null,
      minutes: null,
      billable: row.billable !== false,
      approved_at: null,
      approved_by_user_id: null,
      created_at: new Date().toISOString(),
    };
    if (!isDbMode()) {
      const data = getData();
      if (!data.task_time_sessions) data.task_time_sessions = [];
      const id = nextId(data.task_time_sessions);
      const saved = { id, ...row };
      data.task_time_sessions.push(saved);
      save();
      return saved;
    }
    return dbInsert('task_time_sessions', row);
  }

  /**
   * Close a running session and add elapsed hours to the task's actual_hours.
   * @returns {{ session, minutes, hoursAdded, task }}
   */
  async function stopSession(sessionId, { ended_at } = {}) {
    const store = getStore();
    const session = await getSessionById(sessionId);
    if (!session) throw new Error('Session not found');
    if (session.ended_at) throw new Error('Session already stopped');

    const endIso = ended_at || new Date().toISOString();
    const minutes = elapsedMinutes(session.started_at, endIso);
    const hoursAdded = roundHoursFromMinutes(minutes);

    const patch = { ended_at: endIso, minutes };
    let updatedSession;
    if (!isDbMode()) {
      const data = getData();
      const i = (data.task_time_sessions || []).findIndex((r) => Number(r.id) === Number(sessionId));
      if (i === -1) throw new Error('Session not found');
      data.task_time_sessions[i] = { ...data.task_time_sessions[i], ...patch };
      save();
      updatedSession = data.task_time_sessions[i];
    } else {
      updatedSession = await dbUpdate('task_time_sessions', Number(sessionId), patch);
    }

    const tasks = await store.listProjectTasks();
    const task = tasks.find((t) => Number(t.id) === Number(session.task_id));
    if (task) {
      const nextActual = Math.round(((Number(task.actual_hours) || 0) + hoursAdded) * 10) / 10;
      await store.updateProjectTask(task.id, { actual_hours: nextActual });
      task.actual_hours = nextActual;
    }

    return { session: updatedSession, minutes, hoursAdded, task: task || null };
  }

  return {
    listTimeSessions: listSessions,
    findOpenTimeSessionForPerson: findOpenSessionForPerson,
    getTimeSessionById: getSessionById,
    createTimeSession: createSession,
    stopTimeSession: stopSession,
    async approveTimeSession(id, { userId, billable } = {}) {
      const session = await getSessionById(id);
      if (!session) throw new Error('Session not found');
      if (!session.ended_at) throw new Error('Stop the timer before approving');
      const patch = {
        approved_at: new Date().toISOString(),
        approved_by_user_id: userId != null ? Number(userId) : null,
      };
      if (billable !== undefined) patch.billable = Boolean(billable);
      if (!isDbMode()) {
        const data = getData();
        const i = (data.task_time_sessions || []).findIndex((r) => Number(r.id) === Number(id));
        if (i === -1) return null;
        data.task_time_sessions[i] = { ...data.task_time_sessions[i], ...patch };
        save();
        return data.task_time_sessions[i];
      }
      return dbUpdate('task_time_sessions', Number(id), patch);
    },
    elapsedMinutesFromStart: elapsedMinutes,
    hoursFromMinutes: roundHoursFromMinutes,
  };
}
