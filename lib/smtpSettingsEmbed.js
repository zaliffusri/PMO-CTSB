/**
 * Persist SMTP inside mileage_from_office_km JSONB so it survives Supabase
 * even when settings_app has no smtp_* columns (common on Vercel/serverless).
 */
export const SMTP_EMBED_KEY = '__pmo_smtp__';

export function buildSmtpEmbed(settings = {}) {
  return {
    smtp_service: settings.smtp_service != null ? String(settings.smtp_service) : '',
    smtp_host: settings.smtp_host != null ? String(settings.smtp_host) : '',
    smtp_port: Number.isFinite(Number(settings.smtp_port)) ? Number(settings.smtp_port) : 587,
    smtp_secure: settings.smtp_secure === true || settings.smtp_secure === 'true',
    smtp_user: settings.smtp_user != null ? String(settings.smtp_user) : '',
    smtp_pass: settings.smtp_pass != null ? String(settings.smtp_pass) : '',
    smtp_from: settings.smtp_from != null ? String(settings.smtp_from) : '',
  };
}

/** Write/refresh the embed blob onto a settings object (mutates mileage map). */
export function embedSmtpIntoSettings(settings) {
  if (!settings || typeof settings !== 'object') return settings;
  const mileage = {
    ...(settings.mileage_from_office_km && typeof settings.mileage_from_office_km === 'object'
      ? settings.mileage_from_office_km
      : {}),
  };
  const existing = mileage[SMTP_EMBED_KEY];
  const fromFlat = buildSmtpEmbed(settings);
  const flatUsable = Boolean(String(fromFlat.smtp_pass || '').trim() && String(fromFlat.smtp_from || '').trim());
  if (flatUsable) {
    mileage[SMTP_EMBED_KEY] = fromFlat;
  } else if (existing && typeof existing === 'object') {
    // Keep DB-restored embed when in-memory flat smtp_* were never hydrated.
    mileage[SMTP_EMBED_KEY] = existing;
  } else {
    mileage[SMTP_EMBED_KEY] = fromFlat;
  }
  settings.mileage_from_office_km = mileage;
  return settings;
}

/** Merge embed into flat smtp_* when flat fields are empty (after DB reload). */
export function applySmtpEmbedToSettings(settings, mileage) {
  const embedded = mileage && typeof mileage === 'object' ? mileage[SMTP_EMBED_KEY] : null;
  if (!embedded || typeof embedded !== 'object') return settings;

  const hasFlatPass = Boolean(String(settings.smtp_pass || '').trim());
  const hasFlatFrom = Boolean(String(settings.smtp_from || '').trim());
  if (hasFlatPass && hasFlatFrom) return settings;

  return {
    ...settings,
    smtp_service: hasFlatFrom && settings.smtp_service
      ? settings.smtp_service
      : (embedded.smtp_service != null ? String(embedded.smtp_service) : settings.smtp_service),
    smtp_host: String(settings.smtp_host || '').trim()
      ? settings.smtp_host
      : (embedded.smtp_host != null ? String(embedded.smtp_host) : ''),
    smtp_port: Number.isFinite(Number(settings.smtp_port)) && Number(settings.smtp_port) > 0
      ? Number(settings.smtp_port)
      : (Number.isFinite(Number(embedded.smtp_port)) ? Number(embedded.smtp_port) : 587),
    smtp_secure: settings.smtp_secure === true || settings.smtp_secure === 'true'
      ? true
      : (embedded.smtp_secure === true || embedded.smtp_secure === 'true'),
    smtp_user: String(settings.smtp_user || '').trim()
      ? settings.smtp_user
      : (embedded.smtp_user != null ? String(embedded.smtp_user) : ''),
    smtp_pass: hasFlatPass
      ? settings.smtp_pass
      : (embedded.smtp_pass != null ? String(embedded.smtp_pass) : ''),
    smtp_from: hasFlatFrom
      ? settings.smtp_from
      : (embedded.smtp_from != null ? String(embedded.smtp_from) : ''),
  };
}

export function stripSmtpEmbedFromMileage(mileage) {
  if (!mileage || typeof mileage !== 'object') return {};
  const next = { ...mileage };
  delete next[SMTP_EMBED_KEY];
  // Also drop Graph embed when stripping secret blobs from client mileage maps.
  delete next.__pmo_ms_graph__;
  return next;
}
