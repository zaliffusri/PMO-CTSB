import { idsInSameLogicalGroup, activityLogicalGroupKey } from '../../lib/activityLogicalGroup.js';
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

    async findActivityById(id) {
      const aid = Number(id);
      if (!Number.isFinite(aid)) return null;
      if (!isDbMode()) {
        return (getData().activities || []).find((a) => Number(a.id) === aid) || null;
      }
      const row = await dbSelect('activities', { filters: { id: aid }, maybeSingle: true });
      return row ? rehydrateActivityActors([row])[0] : null;
    },

    /**
     * Rows for the same logical calendar activity as `anchor` (scoped — no full-table pull).
     */
    async findActivityLogicalGroupRows(anchor) {
      if (!anchor?.id) return [];
      if (!isDbMode()) {
        const all = getData().activities || [];
        const ids = new Set(idsInSameLogicalGroup(all, anchor.id).map(Number));
        return all.filter((a) => ids.has(Number(a.id)));
      }
      const gid = anchor.activity_group_id != null && String(anchor.activity_group_id).trim() !== ''
        ? String(anchor.activity_group_id).trim()
        : null;
      let candidates;
      if (gid) {
        candidates = await dbSelect('activities', { filters: { activity_group_id: gid }, order: 'id' });
      } else {
        // Narrow by schedule window, then apply the same logical key as the calendar UI.
        candidates = await dbSelect('activities', {
          filters: {
            start_at: anchor.start_at,
            end_at: anchor.end_at,
          },
          order: 'id',
        });
      }
      const key = activityLogicalGroupKey(anchor);
      return (candidates || []).filter((row) => activityLogicalGroupKey(row) === key);
    },

    async deleteActivitiesByIds(ids, opts = {}) {
      const list = [...new Set((ids || []).map(Number).filter(Number.isFinite))];
      if (!list.length) return { deleted: 0, deleted_ids: [] };
      const idSet = new Set(list);
      rememberDeletedActivityIds(list);
      try {
        await persistDeletedActivityIds(list);
      } catch (e) {
        console.warn('activities: persistDeletedActivityIds failed', e?.message || e);
      }
      if (isDbMode()) {
        await dbDeleteWhere('activities', {}, { inFilters: { id: list } });
        const data = getData();
        if (data.activities) {
          data.activities = data.activities.filter((a) => !idSet.has(Number(a.id)));
        }
        return { deleted: list.length, deleted_ids: list };
      }
      const data = getData();
      const before = data.activities.length;
      data.activities = data.activities.filter((a) => !idSet.has(Number(a.id)));
      if (data.activities.length === before) return { deleted: 0, deleted_ids: [] };
      if (!opts.skipSave) save();
      return { deleted: list.length, deleted_ids: list };
    },

    async addActivity(row) {
      const created_at = row?.created_at || new Date().toISOString();
      const payload = { ...row, created_at };
      // Never send id — Postgres identity/serial must allocate it.
      delete payload.id;
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
          delete rest.id;
          const saved = await dbInsert('activities', rest);
          return saved.id;
        }
        // Sequence drift after imports/upserts with hardcoded ids.
        if (/activities_pkey|duplicate key value/i.test(msg)) {
          throw new Error(
            'Activity id sequence is out of sync (duplicate primary key). '
            + "Run in Supabase SQL: SELECT setval(pg_get_serial_sequence('public.activities','id'), "
            + 'coalesce((SELECT max(id) FROM public.activities),0)+1, false);',
          );
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
      const anchor = await getStore().findActivityById(id);
      if (!anchor) {
        // Fallback for callers that still rely on a full scan (rare).
        const activities = isDbMode()
          ? await dbSelect('activities', { order: 'id' })
          : getData().activities;
        const ids = idsInSameLogicalGroup(activities, id);
        if (!ids.length) return { deleted: 0, deleted_ids: [] };
        return getStore().deleteActivitiesByIds(ids, opts);
      }
      const rows = await getStore().findActivityLogicalGroupRows(anchor);
      const ids = rows.map((r) => r.id);
      if (!ids.length) return { deleted: 0, deleted_ids: [] };
      return getStore().deleteActivitiesByIds(ids, opts);
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
