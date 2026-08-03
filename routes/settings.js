import { Router } from 'express';
import { store } from '../db/store.js';
import { requireAdmin } from '../middleware/requireAuth.js';
import { defaultSettings } from '../lib/defaultSettings.js';
import { validateImageDataUrl } from '../lib/validateImageDataUrl.js';
import { isMailerConfigured, invalidateMailerCache, sendAssignmentEmail } from '../lib/mailer.js';
import { publicSmtpStatus, resolveSmtpConfig } from '../lib/smtpConfig.js';

export const settingsRouter = Router();

function settingsForClient(raw, { includeSecrets = false } = {}) {
  const s = { ...raw };
  const passSet = Boolean(String(s.smtp_pass || '').trim());
  delete s.smtp_pass;
  delete s.ms_graph_client_secret;
  delete s.ms_graph_tenant_id;
  delete s.ms_graph_client_id;
  return {
    ...s,
    smtp_pass_set: passSet,
    smtp_configured: isMailerConfigured(),
    smtp_status: publicSmtpStatus(),
    ...(includeSecrets ? {} : {}),
  };
}

export function publicBrandingPayload() {
  const s = store.getSettings();
  return {
    org_display_name: s.org_display_name,
    org_tagline: s.org_tagline,
    org_logo_url: s.org_logo_url || null,
    org_banner_url: s.org_banner_url || null,
  };
}

settingsRouter.get('/', (req, res) => {
  res.json(settingsForClient(store.getSettings()));
});

settingsRouter.put('/', requireAdmin, async (req, res) => {
  const body = req.body || {};
  const patch = {};

  if (body.activity_locations !== undefined) {
    if (!Array.isArray(body.activity_locations)) {
      return res.status(400).json({ error: 'activity_locations must be an array' });
    }
    const locs = body.activity_locations
      .map((s) => String(s ?? '').trim())
      .filter(Boolean);
    if (locs.length === 0) {
      return res.status(400).json({ error: 'At least one activity location is required' });
    }
    patch.activity_locations = locs;
  }

  if (body.reference_office_name !== undefined) {
    patch.reference_office_name = String(body.reference_office_name ?? '').trim() || defaultSettings().reference_office_name;
  }

  if (body.mileage_from_office_km !== undefined) {
    if (body.mileage_from_office_km !== null && typeof body.mileage_from_office_km !== 'object') {
      return res.status(400).json({ error: 'mileage_from_office_km must be an object' });
    }
    const next = {};
    if (body.mileage_from_office_km && typeof body.mileage_from_office_km === 'object') {
      for (const [k, v] of Object.entries(body.mileage_from_office_km)) {
        const key = String(k).trim();
        if (!key) continue;
        const n = Number(v);
        if (Number.isFinite(n) && n >= 0) next[key] = n;
        else if (v === '' || v === null || v === undefined) next[key] = 0;
      }
    }
    patch.mileage_from_office_km = next;
  }

  if (body.general_notes !== undefined) {
    patch.general_notes = body.general_notes == null ? '' : String(body.general_notes);
  }

  if (body.currency_code !== undefined) {
    const c = String(body.currency_code ?? '').trim().toUpperCase();
    patch.currency_code = c.slice(0, 8) || defaultSettings().currency_code;
  }

  if (body.org_display_name !== undefined) {
    patch.org_display_name = String(body.org_display_name ?? '').trim().slice(0, 80)
      || defaultSettings().org_display_name;
  }

  if (body.org_tagline !== undefined) {
    patch.org_tagline = String(body.org_tagline ?? '').slice(0, 200);
  }

  if (body.org_logo_url !== undefined) {
    patch.org_logo_url = body.org_logo_url === null || body.org_logo_url === ''
      ? null
      : validateImageDataUrl(body.org_logo_url, { maxBytes: 120_000, field: 'org_logo_url' });
  }

  if (body.org_banner_url !== undefined) {
    patch.org_banner_url = body.org_banner_url === null || body.org_banner_url === ''
      ? null
      : validateImageDataUrl(body.org_banner_url, { maxBytes: 320_000, field: 'org_banner_url' });
  }

  if (body.smtp_service !== undefined) {
    patch.smtp_service = String(body.smtp_service ?? '').trim().toLowerCase().slice(0, 32);
  }
  if (body.smtp_host !== undefined) {
    patch.smtp_host = String(body.smtp_host ?? '').trim().slice(0, 200);
  }
  if (body.smtp_port !== undefined) {
    const p = Number(body.smtp_port);
    patch.smtp_port = Number.isFinite(p) && p > 0 ? Math.min(65535, Math.floor(p)) : 587;
  }
  if (body.smtp_secure !== undefined) {
    patch.smtp_secure = body.smtp_secure === true || body.smtp_secure === 'true';
  }
  if (body.smtp_user !== undefined) {
    patch.smtp_user = String(body.smtp_user ?? '').trim().slice(0, 200);
  }
  if (body.smtp_from !== undefined) {
    patch.smtp_from = String(body.smtp_from ?? '').trim().slice(0, 200);
  }
  if (body.smtp_pass !== undefined) {
    const pass = String(body.smtp_pass ?? '');
    // Empty string = keep existing password (UI leaves blank when unchanged)
    if (pass.trim()) {
      patch.smtp_pass = pass.replace(/\s/g, '');
    }
  }
  if (body.clear_smtp_pass === true) {
    patch.smtp_pass = '';
  }

  // Changing provider with the old password left in place causes Gmail 535 BadCredentials
  // (e.g. Microsoft 365 password kept after switching back to Gmail).
  const cur = store.getSettings();
  const nextService = patch.smtp_service !== undefined
    ? String(patch.smtp_service || '').toLowerCase()
    : String(cur.smtp_service || '').toLowerCase();
  const curService = String(cur.smtp_service || '').toLowerCase();
  const providerChanged = patch.smtp_service !== undefined && nextService !== curService;
  const passProvided = Boolean(patch.smtp_pass && String(patch.smtp_pass).trim());
  if (providerChanged && !passProvided && !body.clear_smtp_pass) {
    return res.status(400).json({
      error: 'Re-enter the email password when changing provider (Gmail App Password or Microsoft 365 password). Leaving it blank keeps the old password and login will fail.',
    });
  }

  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: 'Nothing to update' });
  }

  store.updateSettings(patch);
  invalidateMailerCache();
  store.appendAuditLog(req.user, {
    action: 'update',
    target_type: 'settings',
    target_id: null,
    summary: 'Updated system settings',
    detail: {
      fields: Object.keys(patch).map((k) => (
        k === 'smtp_pass' ? `${k}(updated)` : k
      )),
    },
  });
  try {
    await store.persistToSupabase();
  } catch (e) {
    console.warn('settings persist:', e.message);
  }
  res.json(settingsForClient(store.getSettings()));
});

/** Admin: send a test email using current SMTP config. */
settingsRouter.post('/test-email', requireAdmin, async (req, res) => {
  const to = String(req.body?.to || req.user?.email || '').trim();
  if (!to || !to.includes('@')) {
    return res.status(400).json({ error: 'Provide a valid recipient email in "to"' });
  }
  if (!isMailerConfigured()) {
    return res.status(503).json({
      error: 'SMTP is not configured. Save Gmail/SMTP settings first (Settings → Email).',
      smtp_status: publicSmtpStatus(),
    });
  }
  try {
    const result = await sendAssignmentEmail({
      to,
      personName: req.user?.name || 'Admin',
      projectName: 'SMTP configuration test',
      roleInProject: null,
      allocationPercent: 100,
      assignedBy: 'PMO CTSB Settings',
      action: 'assigned',
    });
    if (!result.sent) {
      return res.status(502).json({ error: result.reason || 'Failed to send', smtp_status: publicSmtpStatus() });
    }
    res.json({ ok: true, to, smtp_status: publicSmtpStatus(), config: { source: resolveSmtpConfig().source } });
  } catch (e) {
    const raw = String(e?.message || e || 'SMTP send failed');
    const badCreds = /535|BadCredentials|Username and Password not accepted/i.test(raw);
    res.status(502).json({
      error: badCreds
        ? `Gmail login rejected for ${resolveSmtpConfig().user || 'this account'}. Use an App Password created while logged into THAT same Gmail (Google Account → Security → App passwords), then save it again in Settings → Email. Normal Gmail password will not work.`
        : raw,
    });
  }
});
