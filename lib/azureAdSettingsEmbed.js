/** Persist Azure AD SSO inside mileage JSONB (same pattern as SMTP). */
export const AZURE_AD_EMBED_KEY = '__pmo_azure_ad__';

export function buildAzureAdEmbed(settings = {}) {
  return {
    azure_ad_client_id: settings.azure_ad_client_id != null ? String(settings.azure_ad_client_id) : '',
    azure_ad_tenant_id: settings.azure_ad_tenant_id != null ? String(settings.azure_ad_tenant_id) : 'common',
    azure_ad_client_secret: settings.azure_ad_client_secret != null ? String(settings.azure_ad_client_secret) : '',
    azure_ad_allow_signup: settings.azure_ad_allow_signup !== false,
  };
}

export function embedAzureAdIntoSettings(settings) {
  if (!settings || typeof settings !== 'object') return settings;
  const mileage = {
    ...(settings.mileage_from_office_km && typeof settings.mileage_from_office_km === 'object'
      ? settings.mileage_from_office_km
      : {}),
  };
  const existing = mileage[AZURE_AD_EMBED_KEY];
  const fromFlat = buildAzureAdEmbed(settings);
  const flatUsable = Boolean(String(fromFlat.azure_ad_client_id || '').trim());
  if (flatUsable) {
    mileage[AZURE_AD_EMBED_KEY] = fromFlat;
  } else if (existing && typeof existing === 'object') {
    mileage[AZURE_AD_EMBED_KEY] = existing;
  } else {
    mileage[AZURE_AD_EMBED_KEY] = fromFlat;
  }
  settings.mileage_from_office_km = mileage;
  return settings;
}

export function applyAzureAdEmbedToSettings(settings, mileage) {
  const embedded = mileage && typeof mileage === 'object' ? mileage[AZURE_AD_EMBED_KEY] : null;
  if (!embedded || typeof embedded !== 'object') return settings;
  const hasFlatId = Boolean(String(settings.azure_ad_client_id || '').trim());
  if (hasFlatId) return settings;
  return {
    ...settings,
    azure_ad_client_id: embedded.azure_ad_client_id != null ? String(embedded.azure_ad_client_id) : '',
    azure_ad_tenant_id: embedded.azure_ad_tenant_id != null ? String(embedded.azure_ad_tenant_id) : 'common',
    azure_ad_client_secret: embedded.azure_ad_client_secret != null ? String(embedded.azure_ad_client_secret) : '',
    azure_ad_allow_signup: embedded.azure_ad_allow_signup !== false,
  };
}

export function stripAzureAdEmbedFromMileage(mileage) {
  if (!mileage || typeof mileage !== 'object') return {};
  const next = { ...mileage };
  delete next[AZURE_AD_EMBED_KEY];
  return next;
}
