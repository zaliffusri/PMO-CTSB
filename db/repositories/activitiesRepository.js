import { idsInSameLogicalGroup } from '../../lib/activityLogicalGroup.js';
import { parseActorEmbedFromDescription } from '../../lib/activityActorEmbed.js';
import { nextId } from '../runtime/helpers.js';
import { isDbMode, dbSelect, dbInsert, dbUpdate, dbDelete, dbDeleteWhere, requireSupabase } from '../runtime/query.js';
import {
  rememberDeletedActivityId,
  rememberDeletedActivityIds,
  persistDeletedActivityIds,
  filterOutDeletedActivityRows,
} from '../runtime/supabaseSync.js';

function rehydrateActivityActors(rows) {
  return (rows || []).map((row) => {
    const embedded = parseActorEmbedFromDescription(row.description);
    if (!embedded) return row;
    return {
      ...row,
      created_by_user_id: row.created_by_user_id ?? embedded.created_by_user_id,
      created_by_name: row.created_by_name || embedded.created_by_name,
      updated_by_user_id: row.updated_by_user_id ?? embedded.updated_by_user_id,
      updated_by_name: row.updated_by_name || embedded.updated_by_name,
      updated_at: row.updated_at || embedded.updated_at,
      created_at: row.created_at || embedded.created_at || row.created_at,
    };
  });
}

function overlapInMemory(rows, fromMs, toExclusive) {
  if (fromMs == null || toExclusive == null) return rows;
  return (rows || []).filter((r) => {
    const s = new Date(r.start_at).getTime();
    const e = new Date(r.end_at).getTime();
    return Number.isFinite(s) && Number.isFinite(e) && s < toExclusive && e > fromMs;
  });
}

export function createActivitiesRepository(ctx, getStore) {
  const { getData, save } = ctx;

  async function listActivities() {
    if (!isDbMode()) {
      return filterOutDeletedActivityRows([...getData().activities]);
    }
    const rows = await dbSelect('activities', { order: 'id' });
    const kept = await filterOutDeletedActivityRows(rows);
    return rehydrateActivityActors(kept);
  }

  /**
   * Fast calendar read: Postgres overlap filter + tombstone exclusion (no full-table pull).
   * @param {{ fromMs?: number|null, toExclusive?: number|null, personId?: number|null, projectId?: number|null }} opts
   */
  async function listActivitiesOverlapping({
    fromMs = null,
    toExclusive = null,
    personId = null,
    projectId = null,
  } = {}) {
    if (!isDbMode()) {
      let rows = await filterOutDeletedActivityRows([...getData().activities]);
      rows = overlapInMemory(rows, fromMs, toExclusive);
      if (personId != null) rows = rows.filter((r) => Number(r.person_id) === Number(personId));
      if (projectId != null) rows = rows.filter((r) => Number(r.project_id) === Number(projectId));
      rows.sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
      return rehydrateActivityActors(rows);
    }

    const sb = requireSupabase();
    const p_from = fromMs != null && Number.isFinite(fromMs) ? new Date(fromMs).toISOString() : null;
    const p_to = toExclusive != null && Number.isFinite(toExclusive) ? new Date(toExclusive).toISOString() : null;

    const { data, error } = await sb.rpc('list_activities_in_range', {
      p_from,
      p_to,
      p_person_id: personId != null && Number.isFinite(Number(personId)) ? Number(personId) : null,
      p_project_id: projectId != null && Number.isFinite(Number(projectId)) ? Number(projectId) : null,
    });

    if (error) {
      // Fallback if migration not applied yet: filtered select + JS tombstone filter.
      console.warn('list_activities_in_range RPC unavailable, using filtered select:', error.message || error);
      let q = sb.from('activities').select('*').order('start_at', { ascending: true });
      if (p_from) q = q.gt('end_at', p_from);
      if (p_to) q = q.lt('start_at', p_to);
      if (personId != null) q = q.eq('person_id', Number(personId));
      if (projectId != null) q = q.eq('project_id', Number(projectId));
      const { data: rows, error: selErr } = await q;
      if (selErr) throw selErr;
      const kept = await filterOutDeletedActivityRows(rows || []);
      return rehydrateActivityActors(kept);
    }

    return rehydrateActivityActors(data || []);
  }

  return {
    /** @deprecated Prefer listActivities() — sync getter is local-only. */
    get activities() {
      return [...getData().activities];
    },

    listActivities,
    listActivitiesOverlapping,

    async addActivity(row) {
      const created_at = row?.created_at || new Date().toISOString();
      const payload = { ...row, created_at };
      if (!isDbMode()) {
        const data = getData();
        const id = nextId(data.activities);
        data.activities.push({ id, ...payload });
        save();
        return id;
      }
      try {
        const saved = await dbInsert('activities', payload);
        return saved.id;
      } catch (e) {
        const msg = String(e?.message || e);
        // Stale PostgREST cache / missing audit columns — keep actor embed in description.
        if (/schema cache|Could not find the ['`].*['`] column/i.test(msg)) {
          const {
            created_by_user_id: _c,
            created_by_name: _cn,
            updated_by_user_id: _u,
            updated_by_name: _un,
            updated_at: _ua,
            ...rest
          } = payload;
          const saved = await dbInsert('activities', rest);
          return saved.id;
        }
        throw e;
      }
    },

    async listActivitiesByIds(ids) {
      const idList = [...new Set((ids || []).map(Number).filter(Number.isFinite))];
      if (!idList.length) return [];
      if (!isDbMode()) {
        return getData().activities.filter((a) => idList.includes(Number(a.id)));
      }
      return dbSelect('activities', { inFilters: { id: idList }, order: 'id' });
    },

    async updateActivity(id, row) {
      if (!isDbMode()) {
        const data = getData();
        const i = data.activities.findIndex((a) => a.id === id);
        if (i === -1) return false;
        data.activities[i] = { ...data.activities[i], ...row };
        save();
        return true;
      }
      const saved = await dbUpdate('activities', id, row);
      return Boolean(saved);
    },

    /** Removes locally and deletes the row in Supabase (upsert alone does not remove missing rows). */
    async deleteActivity(id) {
      rememberDeletedActivityId(id);
      try {
        await persistDeletedActivityIds([id]);
      } catch (e) {
        console.warn('activities: persistDeletedActivityIds failed', e?.message || e);
      }
      if (!isDbMode()) {
        const data = getData();
        const i = data.activities.findIndex((a) => a.id === id);
        if (i === -1) return false;
        data.activities.splice(i, 1);
        save();
        return true;
      }
      await dbDelete('activities', id);
      const data = getData();
      if (data.activities) {
        data.activities = data.activities.filter((a) => Number(a.id) !== Number(id));
      }
      return true;
    },

    /**
     * Delete every DB row for the same logical activity (multi-assignee creates one row per person).
     * Uses the same grouping key as the calendar UI.
     * Deletes from Supabase first so a concurrent upsert cannot resurrect the rows.
     * @param {number} id
     * @param {{ skipSave?: boolean }} [opts] skipSave avoids queueing a full sync (preferred on cancel).
     */
    async deleteActivityLogicalGroupByAnyMemberId(id, opts = {}) {
      const activities = isDbMode()
        ? await dbSelect('activities', { order: 'id' })
        : getData().activities;
      const ids = idsInSameLogicalGroup(activities, id);
      if (ids.length === 0) return { deleted: 0, deleted_ids: [] };
      const idSet = new Set(ids.map(Number));
      rememberDeletedActivityIds(ids);
      try {
        await persistDeletedActivityIds(ids);
      } catch (e) {
        console.warn('activities: persistDeletedActivityIds failed', e?.message || e);
      }

      if (isDbMode()) {
        await dbDeleteWhere('activities', {}, { inFilters: { id: ids } });
        const data = getData();
        if (data.activities) {
          data.activities = data.activities.filter((a) => !idSet.has(Number(a.id)));
        }
        await dbDeleteWhere('activities', {}, { inFilters: { id: ids } });
        return { deleted: ids.length, deleted_ids: ids };
      }

      const data = getData();
      const before = data.activities.length;
      data.activities = data.activities.filter((a) => !idSet.has(Number(a.id)));
      if (data.activities.length === before) return { deleted: 0, deleted_ids: [] };
      if (!opts.skipSave) save();
      return { deleted: ids.length, deleted_ids: ids };
    },

    /** Hard-delete activity row ids from Supabase (used after cancel to prevent resurrection). */
    async purgeActivityIdsFromSupabase(ids) {
      const list = [...new Set((ids || []).map(Number).filter(Number.isFinite))];
      if (!list.length) return { deleted: 0 };
      rememberDeletedActivityIds(list);
      try {
        await persistDeletedActivityIds(list);
      } catch (e) {
        console.warn('activities: persistDeletedActivityIds failed', e?.message || e);
      }
      if (!isDbMode()) return { deleted: 0 };
      await dbDeleteWhere('activities', {}, { inFilters: { id: list } });
      return { deleted: list.length };
    },

    /**
     * Re-read activities from Supabase into memory. Prefer listActivitiesOverlapping for calendar GET.
     */
    async refreshActivitiesFromSupabase() {
      if (!isDbMode()) return;
      const rows = await dbSelect('activities', { order: 'id' });
      const kept = await filterOutDeletedActivityRows(rows);
      const data = getData();
      data.activities = rehydrateActivityActors(kept);
    },
  };
}
