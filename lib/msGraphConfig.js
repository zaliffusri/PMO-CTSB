import { store } from '../db/store.js';

function trim(v) {
  return String(v ?? '').trim();
}

/**
 * Resolve Microsoft Graph app credentials from Settings (preferred) then process.env.
 */
export function resolveMsGraphConfig() {
  let fromSettings = null;
  try {
    const s = store.getSettings() || {};
    const tenantId = trim(s.ms_graph_tenant_id);
    const clientId = trim(s.ms_graph_client_id);
    const clientSecret = trim(s.ms_graph_client_secret);
    if (tenantId && clientId && clientSecret) {
      fromSettings = { tenantId, clientId, clientSecret, source: 'settings' };
    }
  } catch {
    // store may not be ready during early import
  }

  if (fromSettings) {
    return { ...fromSettings, configured: true };
  }

  const tenantId = trim(process.env.MS_GRAPH_TENANT_ID);
  const clientId = trim(process.env.MS_GRAPH_CLIENT_ID);
  const clientSecret = trim(process.env.MS_GRAPH_CLIENT_SECRET);
  if (tenantId && clientId && clientSecret) {
    return { tenantId, clientId, clientSecret, source: 'env', configured: true };
  }

  return {
    tenantId: tenantId || null,
    clientId: clientId || null,
    clientSecret: clientSecret || null,
    source: null,
    configured: false,
  };
}

export function publicMsGraphStatus() {
  const cfg = resolveMsGraphConfig();
  return {
    ms_graph_configured: cfg.configured,
    ms_graph_source: cfg.configured ? cfg.source : null,
    ms_graph_tenant_id: cfg.configured ? cfg.tenantId : null,
    ms_graph_client_id: cfg.configured ? cfg.clientId : null,
  };
}
