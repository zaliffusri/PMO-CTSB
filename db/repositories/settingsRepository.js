import { defaultSettings } from '../../lib/defaultSettings.js';
import {
  SMTP_EMBED_KEY,
  applySmtpEmbedToSettings,
  embedSmtpIntoSettings,
  stripSmtpEmbedFromMileage,
} from '../../lib/smtpSettingsEmbed.js';
import { AUDIT_LOG_MAX, nextId } from '../runtime/helpers.js';
import { isDbMode, dbSelect, dbInsert, dbUpsert } from '../runtime/query.js';

/** Legacy Graph embed key — ignore as a location; stop reading/writing Graph secrets. */
const LEGACY_MS_GRAPH_EMBED_KEY = '__pmo_ms_graph__';
const SECRET_MILEAGE_KEYS = new Set([SMTP_EMBED_KEY, LEGACY_MS_GRAPH_EMBED_KEY]);

function normalizeSettingsFromRaw(raw = {}) {
  const d = defaultSettings();
  const activity_locations =
    Array.isArray(raw.activity_locations) && raw.activity_locations.length > 0
      ? raw.activity_locations.map((x) => String(x).trim()).filter(Boolean)
      : d.activity_locations;
  const rawMileage = {
    ...(raw.mileage_from_office_km && typeof raw.mileage_from_office_km === 'object'
      ? raw.mileage_from_office_km
      : {}),
  };
  const withSecrets = applySmtpEmbedToSettings({ ...d, ...raw }, rawMileage);
  const mileage = { ...rawMileage };
  for (const k of Object.keys(mileage)) {
    if (SECRET_MILEAGE_KEYS.has(k)) continue;
    if (!activity_locations.includes(k)) delete mileage[k];
  }
  return {
    ...d,
    ...withSecrets,
    activity_locations,
    mileage_from_office_km: stripSmtpEmbedFromMileage(mileage),
    reference_office_name: withSecrets.reference_office_name != null && String(withSecrets.reference_office_name).trim()
      ? String(withSecrets.reference_office_name).trim()
      : d.reference_office_name,
    general_notes: withSecrets.general_notes != null ? String(withSecrets.general_notes) : d.general_notes,
    currency_code: withSecrets.currency_code != null && String(withSecrets.currency_code).trim()
      ? String(withSecrets.currency_code).trim().toUpperCase().slice(0, 8)
      : d.currency_code,
    org_display_name: withSecrets.org_display_name != null && String(withSecrets.org_display_name).trim()
      ? String(withSecrets.org_display_name).trim().slice(0, 80)
      : d.org_display_name,
    org_tagline: withSecrets.org_tagline != null ? String(withSecrets.org_tagline).slice(0, 200) : d.org_tagline,
    org_logo_url: withSecrets.org_logo_url || null,
    org_banner_url: withSecrets.org_banner_url || null,
    smtp_service: withSecrets.smtp_service != null ? String(withSecrets.smtp_service) : d.smtp_service,
    smtp_host: withSecrets.smtp_host != null ? String(withSecrets.smtp_host) : d.smtp_host,
    smtp_port: Number.isFinite(Number(withSecrets.smtp_port)) ? Number(withSecrets.smtp_port) : d.smtp_port,
    smtp_secure: withSecrets.smtp_secure === true || withSecrets.smtp_secure === 'true',
    smtp_user: withSecrets.smtp_user != null ? String(withSecrets.smtp_user) : d.smtp_user,
    smtp_pass: withSecrets.smtp_pass != null ? String(withSecrets.smtp_pass) : d.smtp_pass,
    smtp_from: withSecrets.smtp_from != null ? String(withSecrets.smtp_from) : d.smtp_from,
  };
}

function buildSettingsAppRow(settings) {
  const s = embedSmtpIntoSettings({ ...(settings || {}) });
  const mileage = {
    ...(s.mileage_from_office_km && typeof s.mileage_from_office_km === 'object'
      ? s.mileage_from_office_km
      : {}),
  };
  if (!mileage[SMTP_EMBED_KEY]) {
    embedSmtpIntoSettings(s);
    Object.assign(mileage, s.mileage_from_office_km || {});
  }
  delete mileage[LEGACY_MS_GRAPH_EMBED_KEY];
  return {
    id: 1,
    activity_locations: s.activity_locations ?? [],
    reference_office_name: s.reference_office_name ?? 'Main Office',
    mileage_from_office_km: mileage,
    general_notes: s.general_notes ?? '',
    currency_code: s.currency_code ?? 'MYR',
    updated_at: new Date().toISOString(),
    org_display_name: s.org_display_name ?? null,
    org_tagline: s.org_tagline ?? null,
    org_logo_url: s.org_logo_url ?? null,
    org_banner_url: s.org_banner_url ?? null,
  };
}

async function upsertSettingsAppRow(settings) {
  const optionalColumns = ['org_display_name', 'org_tagline', 'org_logo_url', 'org_banner_url'];
  let row = buildSettingsAppRow(settings);
  try {
    await dbUpsert('settings_app', row, { onConflict: 'id', returning: false });
    return;
  } catch (error) {
    const isSchemaError = /schema cache|PGRST204|Could not find|does not exist|column/i.test(
      String(error?.message || ''),
    );
    if (!isSchemaError) throw error;
  }
  for (const column of optionalColumns) {
    const next = { ...row };
    delete next[column];
    row = next;
    try {
      await dbUpsert('settings_app', row, { onConflict: 'id', returning: false });
      return;
    } catch (error) {
      const isSchemaError = /schema cache|PGRST204|Could not find|does not exist|column/i.test(
        String(error?.message || ''),
      );
      if (!isSchemaError) throw error;
    }
  }
  await dbUpsert('settings_app', row, { onConflict: 'id', returning: false });
}

function mergeSettingsPatch(cur, patch, prevSmtpEmbed) {
  const next = { ...cur, ...patch };
  if (patch.activity_locations) {
    next.activity_locations = patch.activity_locations.map((x) => String(x).trim()).filter(Boolean);
  }
  if (patch.mileage_from_office_km !== undefined) {
    next.mileage_from_office_km = { ...patch.mileage_from_office_km };
  }
  const allowed = new Set(next.activity_locations);
  next.mileage_from_office_km = { ...(next.mileage_from_office_km || {}) };
  for (const k of Object.keys(next.mileage_from_office_km)) {
    if (SECRET_MILEAGE_KEYS.has(k)) continue;
    if (!allowed.has(k)) delete next.mileage_from_office_km[k];
  }
  if (prevSmtpEmbed && typeof prevSmtpEmbed === 'object' && !String(next.smtp_pass || '').trim()) {
    Object.assign(next, applySmtpEmbedToSettings(next, { [SMTP_EMBED_KEY]: prevSmtpEmbed }));
  }
  delete next.mileage_from_office_km[LEGACY_MS_GRAPH_EMBED_KEY];
  delete next.ms_graph_tenant_id;
  delete next.ms_graph_client_id;
  delete next.ms_graph_client_secret;
  embedSmtpIntoSettings(next);
  return next;
}

export function createSettingsRepository(ctx, getStore) {
  const { getData, save } = ctx;

  async function getSettings() {
    if (!isDbMode()) {
      return normalizeSettingsFromRaw(getData().settings || {});
    }
    const row = await dbSelect('settings_app', { filters: { id: 1 }, maybeSingle: true });
    if (!row) return normalizeSettingsFromRaw({});
    const { id: _id, updated_at: _updatedAt, ...settingsRaw } = row;
    return normalizeSettingsFromRaw(settingsRaw);
  }

  return {
    /** @deprecated Prefer listAuditLog() — sync getter is local-only. */
    get audit_log() {
      return [...(getData().audit_log || [])];
    },

    getSettings,

    async updateSettings(patch) {
      if (!isDbMode()) {
        const data = getData();
        const cur = await getSettings();
        const prevSmtpEmbed = data.settings?.mileage_from_office_km?.[SMTP_EMBED_KEY];
        const next = mergeSettingsPatch(cur, patch, prevSmtpEmbed);
        data.settings = next;
        save();
        return;
      }
      const cur = await getSettings();
      const existing = await dbSelect('settings_app', { filters: { id: 1 }, maybeSingle: true });
      const prevSmtpEmbed = existing?.mileage_from_office_km?.[SMTP_EMBED_KEY];
      const next = mergeSettingsPatch(cur, patch, prevSmtpEmbed);
      await upsertSettingsAppRow(next);
    },

    async appendAuditLog(actor, entry) {
      const row = {
        at: new Date().toISOString(),
        user_id: actor?.id ?? null,
        user_email: actor?.email ?? null,
        user_name: actor?.name ?? null,
        action: entry.action,
        target_type: entry.target_type,
        target_id: entry.target_id ?? null,
        summary: String(entry.summary || ''),
        detail: entry.detail !== undefined ? entry.detail : null,
      };
      if (!isDbMode()) {
        const data = getData();
        if (!data.audit_log) data.audit_log = [];
        data.audit_log.push({ id: nextId(data.audit_log), ...row });
        if (data.audit_log.length > AUDIT_LOG_MAX) {
          data.audit_log = data.audit_log.slice(-AUDIT_LOG_MAX);
        }
        save();
        return;
      }
      await dbInsert('audit_log', row, { returning: false });
      // Optional trim of old audit_log rows skipped for now in DB mode.
    },

    async listAuditLog({ limit = 100, offset = 0, user_id: filterUserId } = {}) {
      const lim = Math.min(500, Math.max(1, +limit || 100));
      const off = Math.max(0, +offset || 0);
      if (!isDbMode()) {
        let rows = [...(getData().audit_log || [])].sort((a, b) => new Date(b.at) - new Date(a.at));
        if (filterUserId != null && filterUserId !== '') {
          const uid = +filterUserId;
          if (!Number.isNaN(uid)) {
            rows = rows.filter((r) => r.user_id === uid);
          }
        }
        const total = rows.length;
        return { entries: rows.slice(off, off + lim), total, limit: lim, offset: off };
      }
      let rows = await dbSelect('audit_log', { order: 'at', ascending: false });
      if (filterUserId != null && filterUserId !== '') {
        const uid = +filterUserId;
        if (!Number.isNaN(uid)) {
          rows = rows.filter((r) => r.user_id === uid);
        }
      }
      const total = rows.length;
      return { entries: rows.slice(off, off + lim), total, limit: lim, offset: off };
    },
  };
}
