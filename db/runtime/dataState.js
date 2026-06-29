import { allowLocalStore } from './config.js';
import {
  emptyData,
  migrateLegacyClientContacts,
  migrateLegacyProjectClients,
} from './helpers.js';
import { bindSyncDataRef, loadFromSupabase, queueSupabaseSync } from './supabaseSync.js';

let data = emptyData();

export function getData() {
  return data;
}

export function save() {
  queueSupabaseSync(data);
}

async function loadInitialData() {
  const remote = await loadFromSupabase();
  const base = remote || emptyData();
  return migrateLegacyProjectClients(migrateLegacyClientContacts(base));
}

export async function initDataState() {
  data = await loadInitialData();
  bindSyncDataRef(getData);
  return {
    getData,
    save,
  };
}

export function resetLocalDemoData() {
  if (!allowLocalStore) return false;
  data = emptyData();
  return true;
}
