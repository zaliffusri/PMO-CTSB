/**
 * Resolve SMTP config from app settings (preferred) then process.env.
 * Settings let admins enable email on Vercel without dashboard env access.
 */
import { store } from '../db/store.js';

function trim(v) {
  return v == null ? '' : String(v).trim();
}

async function readSettingsSmtp() {
  try {
    const s = (await store.getSettings()) || {};
    return {
      service: trim(s.smtp_service).toLowerCase(),
      host: trim(s.smtp_host),
      port: Number(s.smtp_port || 0) || 0,
      user: trim(s.smtp_user),
      pass: String(s.smtp_pass || '').replace(/\s/g, ''),
      from: trim(s.smtp_from),
      secure: String(s.smtp_secure || 'false').toLowerCase() === 'true',
      source: 'settings',
    };
  } catch {
    return null;
  }
}

function readEnvSmtp() {
  return {
    service: trim(process.env.SMTP_SERVICE).toLowerCase(),
    host: trim(process.env.SMTP_HOST),
    port: Number(process.env.SMTP_PORT || 587) || 587,
    user: trim(process.env.SMTP_USER),
    pass: String(process.env.SMTP_PASS || '').replace(/\s/g, ''),
    from: trim(process.env.SMTP_FROM),
    secure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
    source: 'env',
  };
}

function isUsable(cfg) {
  if (!cfg || !cfg.from) return false;
  if (cfg.service === 'gmail' || cfg.service === 'office365' || cfg.service === 'outlook') {
    return Boolean(cfg.user && cfg.pass && cfg.from);
  }
  return Boolean(cfg.host && cfg.port && cfg.from && cfg.user && cfg.pass);
}

/** Normalize known presets onto host/port for nodemailer. */
export function normalizeSmtpTransportConfig(cfg) {
  if (!cfg) return cfg;
  const service = String(cfg.service || '').toLowerCase();
  if (service === 'gmail') {
    return {
      ...cfg,
      service: 'gmail',
      host: cfg.host || 'smtp.gmail.com',
      port: cfg.port || 587,
      secure: false,
      requireTLS: true,
    };
  }
  if (service === 'office365' || service === 'outlook' || service === 'microsoft365') {
    return {
      ...cfg,
      service: 'office365',
      host: 'smtp.office365.com',
      port: 587,
      secure: false,
      requireTLS: true,
    };
  }
  return {
    ...cfg,
    requireTLS: cfg.port === 587 && !cfg.secure,
  };
}

/** Prefer settings when they look configured; otherwise fall back to env. */
export async function resolveSmtpConfig() {
  const fromSettings = await readSettingsSmtp();
  if (fromSettings && isUsable(fromSettings)) {
    return { ...normalizeSmtpTransportConfig(fromSettings), configured: true };
  }

  const fromEnv = readEnvSmtp();
  if (isUsable(fromEnv)) {
    return { ...normalizeSmtpTransportConfig(fromEnv), configured: true };
  }

  // Return best partial for diagnostics (settings first if any field set)
  const partial = fromSettings && (fromSettings.user || fromSettings.from || fromSettings.host)
    ? fromSettings
    : fromEnv;
  return { ...normalizeSmtpTransportConfig(partial), configured: false };
}

export async function publicSmtpStatus() {
  const cfg = await resolveSmtpConfig();
  return {
    smtp_configured: cfg.configured,
    smtp_source: cfg.configured ? cfg.source : null,
    smtp_service: cfg.service || null,
    smtp_from: cfg.configured ? cfg.from : null,
    smtp_user: cfg.configured ? cfg.user : null,
  };
}
