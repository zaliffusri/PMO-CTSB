/**
 * Persist Microsoft Graph credentials inside mileage_from_office_km JSONB
 * (same approach as SMTP) so Teams calendar sync survives without new DB columns.
 */
export const MS_GRAPH_EMBED_KEY = '__pmo_ms_graph__';

export function buildMsGraphEmbed(settings = {}) {
  return {
    ms_graph_tenant_id: settings.ms_graph_tenant_id != null ? String(settings.ms_graph_tenant_id) : '',
    ms_graph_client_id: settings.ms_graph_client_id != null ? String(settings.ms_graph_client_id) : '',
    ms_graph_client_secret: settings.ms_graph_client_secret != null ? String(settings.ms_graph_client_secret) : '',
  };
}

export function embedMsGraphIntoSettings(settings) {
  if (!settings || typeof settings !== 'object') return settings;
  const mileage = {
    ...(settings.mileage_from_office_km && typeof settings.mileage_from_office_km === 'object'
      ? settings.mileage_from_office_km
      : {}),
  };
  const existing = mileage[MS_GRAPH_EMBED_KEY];
  const fromFlat = buildMsGraphEmbed(settings);
  const flatUsable = Boolean(
    String(fromFlat.ms_graph_tenant_id || '').trim()
    && String(fromFlat.ms_graph_client_id || '').trim()
    && String(fromFlat.ms_graph_client_secret || '').trim(),
  );
  if (flatUsable) {
    mileage[MS_GRAPH_EMBED_KEY] = fromFlat;
  } else if (existing && typeof existing === 'object') {
    mileage[MS_GRAPH_EMBED_KEY] = existing;
  } else {
    mileage[MS_GRAPH_EMBED_KEY] = fromFlat;
  }
  settings.mileage_from_office_km = mileage;
  return settings;
}

export function applyMsGraphEmbedToSettings(settings, mileage) {
  const embedded = mileage && typeof mileage === 'object' ? mileage[MS_GRAPH_EMBED_KEY] : null;
  if (!embedded || typeof embedded !== 'object') return settings;

  const hasFlat = Boolean(
    String(settings.ms_graph_tenant_id || '').trim()
    && String(settings.ms_graph_client_id || '').trim()
    && String(settings.ms_graph_client_secret || '').trim(),
  );
  if (hasFlat) return settings;

  return {
    ...settings,
    ms_graph_tenant_id: String(settings.ms_graph_tenant_id || '').trim()
      ? settings.ms_graph_tenant_id
      : (embedded.ms_graph_tenant_id != null ? String(embedded.ms_graph_tenant_id) : ''),
    ms_graph_client_id: String(settings.ms_graph_client_id || '').trim()
      ? settings.ms_graph_client_id
      : (embedded.ms_graph_client_id != null ? String(embedded.ms_graph_client_id) : ''),
    ms_graph_client_secret: String(settings.ms_graph_client_secret || '').trim()
      ? settings.ms_graph_client_secret
      : (embedded.ms_graph_client_secret != null ? String(embedded.ms_graph_client_secret) : ''),
  };
}

export function stripMsGraphEmbedFromMileage(mileage) {
  if (!mileage || typeof mileage !== 'object') return {};
  const next = { ...mileage };
  delete next[MS_GRAPH_EMBED_KEY];
  return next;
}
