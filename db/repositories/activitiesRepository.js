import { idsInSameLogicalGroup } from '../../lib/activityLogicalGroup.js';
import { parseActorEmbedFromDescription } from '../../lib/activityActorEmbed.js';
import { nextId } from '../runtime/helpers.js';
import { supabase } from '../runtime/supabaseSync.js';

export function createActivitiesRepository(ctx, getStore) {
  const { getData, save } = ctx;

  return {
    get activities() {
      return [...getData().activities];
    },

    addActivity(row) {
      const data = getData();
      const id = nextId(data.activities);
      const created_at = row?.created_at || new Date().toISOString();
      data.activities.push({ id, ...row, created_at });
      save();
      return id;
    },

    updateActivity(id, row) {
      const data = getData();
      const i = data.activities.findIndex((a) => a.id === id);
      if (i === -1) return false;
      data.activities[i] = { ...data.activities[i], ...row };
      save();
      return true;
    },

    /** Removes locally and deletes the row in Supabase (upsert alone does not remove missing rows). */
    async deleteActivity(id) {
      const data = getData();
      const i = data.activities.findIndex((a) => a.id === id);
      if (i === -1) return false;
      if (supabase) {
        const { error } = await supabase.from('activities').delete().eq('id', id);
        if (error) throw error;
      }
      data.activities.splice(i, 1);
      save();
      return true;
    },

    /**
     * Delete every DB row for the same logical activity (multi-assignee creates one row per person).
     * Uses the same grouping key as the calendar UI.
     * Deletes from Supabase first so a concurrent upsert cannot resurrect the rows.
     */
    async deleteActivityLogicalGroupByAnyMemberId(id) {
      const data = getData();
      const ids = idsInSameLogicalGroup(data.activities, id);
      if (ids.length === 0) return { deleted: 0 };
      const idSet = new Set(ids);
      if (supabase) {
        const { error } = await supabase.from('activities').delete().in('id', ids);
        if (error) throw error;
      }
      const before = data.activities.length;
      data.activities = data.activities.filter((a) => !idSet.has(a.id));
      if (data.activities.length === before) return { deleted: 0 };
      save();
      // Belt-and-suspenders: remove again after local save in case a stale sync raced.
      if (supabase) {
        const { error } = await supabase.from('activities').delete().in('id', ids);
        if (error) throw error;
      }
      return { deleted: ids.length, deleted_ids: ids };
    },

    /** Hard-delete activity row ids from Supabase (used after cancel to prevent resurrection). */
    async purgeActivityIdsFromSupabase(ids) {
      const list = [...new Set((ids || []).map(Number).filter(Number.isFinite))];
      if (!list.length || !supabase) return { deleted: 0 };
      const { error } = await supabase.from('activities').delete().in('id', list);
      if (error) throw error;
      return { deleted: list.length };
    },

    /**
     * Re-read activities from Supabase into memory. Use before listing so direct DB edits
     * (e.g. SQL/dashboard deletes) are visible without restarting the server.
     */
    async refreshActivitiesFromSupabase() {
      if (!supabase) return;
      const data = getData();
      const { data: rows, error } = await supabase.from('activities').select('*').order('id', { ascending: true });
      if (error) throw error;
      // Rehydrate actor fields from description embed when DB columns are missing.
      data.activities = (rows || []).map((row) => {
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
    },
  };
}
