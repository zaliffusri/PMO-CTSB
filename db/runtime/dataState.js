import { allowLocalStore } from './config.js';
import {
  emptyData,
  migrateLegacyClientContacts,
  migrateLegacyProjectClients,
} from './helpers.js';
import { bindSyncDataRef, loadFromSupabase, queueSupabaseSync } from './supabaseSync.js';

let data = emptyData();
let reloadInFlight = null;

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

/** Re-read from Supabase so warm serverless instances pick up writes from other instances. */
export async function reloadFromSupabase() {
  if (reloadInFlight) return reloadInFlight;
  reloadInFlight = (async () => {
    const remote = await loadFromSupabase();
    if (!remote) return false;
    data = migrateLegacyProjectClients(migrateLegacyClientContacts(remote));
    return true;
  })();
  try {
    return await reloadInFlight;
  } finally {
    reloadInFlight = null;
  }
}

export async function initDataState() {
  data = await loadInitialData();
  bindSyncDataRef(getData);
  return {
    getData,
    save,
    reloadFromSupabase,
  };
}

export function resetLocalDemoData() {
  if (!allowLocalStore) return false;
  data = emptyData();
  return true;
}
