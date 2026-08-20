/**
 * Thin Supabase query helpers for stateless repository methods.
 * Prefer these over mutating an in-memory snapshot + full-table upsert.
 */
import { supabase } from './config.js';

export function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase client is not configured');
  }
  return supabase;
}

export function isDbMode() {
  return Boolean(supabase);
}

export async function dbSelect(table, {
  columns = '*',
  filters = {},
  inFilters = {},
  order = null,
  ascending = true,
  limit = null,
  maybeSingle = false,
} = {}) {
  const sb = requireSupabase();
  let q = sb.from(table).select(columns);
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined) continue;
    if (value === null) q = q.is(key, null);
    else q = q.eq(key, value);
  }
  for (const [key, values] of Object.entries(inFilters)) {
    if (!values?.length) continue;
    q = q.in(key, values);
  }
  if (order) q = q.order(order, { ascending });
  if (limit != null) q = q.limit(limit);
  if (maybeSingle) {
    const { data, error } = await q.maybeSingle();
    if (error) throw error;
    return data;
  }
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function dbInsert(table, row, { returning = true } = {}) {
  const sb = requireSupabase();
  let q = sb.from(table).insert(row);
  if (returning) q = q.select('*').maybeSingle();
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function dbInsertMany(table, rows, { returning = true } = {}) {
  if (!rows?.length) return [];
  const sb = requireSupabase();
  let q = sb.from(table).insert(rows);
  if (returning) q = q.select('*');
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function dbUpdate(table, id, patch, { idColumn = 'id', returning = true } = {}) {
  const sb = requireSupabase();
  let q = sb.from(table).update(patch).eq(idColumn, id);
  if (returning) q = q.select('*').maybeSingle();
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function dbUpdateWhere(table, filters, patch, { returning = false } = {}) {
  const sb = requireSupabase();
  let q = sb.from(table).update(patch);
  for (const [key, value] of Object.entries(filters)) {
    if (value === null) q = q.is(key, null);
    else q = q.eq(key, value);
  }
  if (returning) q = q.select('*');
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function dbDelete(table, id, { idColumn = 'id' } = {}) {
  const sb = requireSupabase();
  const { error } = await sb.from(table).delete().eq(idColumn, id);
  if (error) throw error;
  return true;
}

export async function dbDeleteWhere(table, filters = {}, { inFilters = {} } = {}) {
  const sb = requireSupabase();
  let q = sb.from(table).delete();
  for (const [key, value] of Object.entries(filters)) {
    if (value === null) q = q.is(key, null);
    else q = q.eq(key, value);
  }
  for (const [key, values] of Object.entries(inFilters)) {
    if (!values?.length) continue;
    q = q.in(key, values);
  }
  const { error } = await q;
  if (error) throw error;
  return true;
}

export async function dbUpsert(table, rows, { onConflict = 'id', returning = true } = {}) {
  const list = Array.isArray(rows) ? rows : [rows];
  if (!list.length) return [];
  const sb = requireSupabase();
  let q = sb.from(table).upsert(list, { onConflict });
  if (returning) q = q.select('*');
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}
