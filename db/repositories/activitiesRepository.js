import { idsInSameLogicalGroup } from '../../lib/activityLogicalGroup.js';
import { parseActorEmbedFromDescription } from '../../lib/activityActorEmbed.js';
import { nextId } from '../runtime/helpers.js';
import { isDbMode, dbSelect, dbInsert, dbUpdate, dbDelete, dbDeleteWhere } from '../runtime/query.js';
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

  return {
    /** @deprecated Prefer listActivities() — sync getter is local-only. */
    get activities() {
      return [...getData().activities];
    },

    listActivities,

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
      const saved = await dbInsert('activities', payload);
      return saved.id;
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
        // Belt-and-suspenders: remove again in case a stale sync raced.
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
     * Re-read activities from Supabase into memory. Use before listing so direct DB edits
     * (e.g. SQL/dashboard deletes) are visible without restarting the server.
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
