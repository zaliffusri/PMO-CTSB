import { defaultSettings } from '../../lib/defaultSettings.js';
import {
  SMTP_EMBED_KEY,
  applySmtpEmbedToSettings,
  embedSmtpIntoSettings,
  stripSmtpEmbedFromMileage,
} from '../../lib/smtpSettingsEmbed.js';
import {
  MS_GRAPH_EMBED_KEY,
  applyMsGraphEmbedToSettings,
  embedMsGraphIntoSettings,
} from '../../lib/msGraphSettingsEmbed.js';
import { AUDIT_LOG_MAX, nextId } from '../runtime/helpers.js';

const SECRET_MILEAGE_KEYS = new Set([SMTP_EMBED_KEY, MS_GRAPH_EMBED_KEY]);

export function createSettingsRepository(ctx, getStore) {
  const { getData, save } = ctx;

  function getSettings() {
    const data = getData();
    const d = defaultSettings();
    const raw = data.settings || {};
    const activity_locations =
      Array.isArray(raw.activity_locations) && raw.activity_locations.length > 0
        ? raw.activity_locations.map((x) => String(x).trim()).filter(Boolean)
        : d.activity_locations;
    const rawMileage = {
      ...(raw.mileage_from_office_km && typeof raw.mileage_from_office_km === 'object'
        ? raw.mileage_from_office_km
        : {}),
    };
    let withSecrets = applySmtpEmbedToSettings({ ...d, ...raw }, rawMileage);
    withSecrets = applyMsGraphEmbedToSettings(withSecrets, rawMileage);
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
      ms_graph_tenant_id: withSecrets.ms_graph_tenant_id != null ? String(withSecrets.ms_graph_tenant_id) : d.ms_graph_tenant_id,
      ms_graph_client_id: withSecrets.ms_graph_client_id != null ? String(withSecrets.ms_graph_client_id) : d.ms_graph_client_id,
      ms_graph_client_secret: withSecrets.ms_graph_client_secret != null ? String(withSecrets.ms_graph_client_secret) : d.ms_graph_client_secret,
    };
  }

  return {
    get audit_log() {
      return [...(getData().audit_log || [])];
    },

    getSettings,

    updateSettings(patch) {
      const data = getData();
      const cur = getSettings();
      const prevSmtpEmbed = data.settings?.mileage_from_office_km?.[SMTP_EMBED_KEY];
      const prevGraphEmbed = data.settings?.mileage_from_office_km?.[MS_GRAPH_EMBED_KEY];
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
      if (
        prevGraphEmbed && typeof prevGraphEmbed === 'object'
        && !String(next.ms_graph_client_secret || '').trim()
      ) {
        Object.assign(next, applyMsGraphEmbedToSettings(next, { [MS_GRAPH_EMBED_KEY]: prevGraphEmbed }));
      }
      embedSmtpIntoSettings(next);
      embedMsGraphIntoSettings(next);
      data.settings = next;
      save();
    },

    appendAuditLog(actor, entry) {
      const data = getData();
      if (!data.audit_log) data.audit_log = [];
      const row = {
        id: nextId(data.audit_log),
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
      data.audit_log.push(row);
      if (data.audit_log.length > AUDIT_LOG_MAX) {
        data.audit_log = data.audit_log.slice(-AUDIT_LOG_MAX);
      }
      save();
    },

    listAuditLog({ limit = 100, offset = 0, user_id: filterUserId } = {}) {
      const data = getData();
      let rows = [...(data.audit_log || [])].sort((a, b) => new Date(b.at) - new Date(a.at));
      if (filterUserId != null && filterUserId !== '') {
        const uid = +filterUserId;
        if (!Number.isNaN(uid)) {
          rows = rows.filter((r) => r.user_id === uid);
        }
      }
      const total = rows.length;
      const lim = Math.min(500, Math.max(1, +limit || 100));
      const off = Math.max(0, +offset || 0);
      return { entries: rows.slice(off, off + lim), total, limit: lim, offset: off };
    },
  };
}
