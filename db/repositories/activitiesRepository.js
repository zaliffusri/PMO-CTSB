import { idsInSameLogicalGroup } from '../../lib/activityLogicalGroup.js';
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
      const created_at = new Date().toISOString();
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
      data.activities.splice(i, 1);
      save();
      if (supabase) {
        const { error } = await supabase.from('activities').delete().eq('id', id);
        if (error) throw error;
      }
      return true;
    },

    /**
     * Delete every DB row for the same logical activity (multi-assignee creates one row per person).
     * Uses the same grouping key as the calendar UI.
     */
    async deleteActivityLogicalGroupByAnyMemberId(id) {
      const data = getData();
      const ids = idsInSameLogicalGroup(data.activities, id);
      if (ids.length === 0) return { deleted: 0 };
      const idSet = new Set(ids);
      const before = data.activities.length;
      data.activities = data.activities.filter((a) => !idSet.has(a.id));
      if (data.activities.length === before) return { deleted: 0 };
      save();
      if (supabase) {
        const { error } = await supabase.from('activities').delete().in('id', ids);
        if (error) throw error;
      }
      return { deleted: ids.length };
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
      data.activities = rows || [];
    },
  };
}
