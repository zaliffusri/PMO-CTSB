import { Router } from 'express';
import { store } from '../db/store.js';
import { requireAdmin } from '../middleware/requireAuth.js';
import { defaultSettings } from '../lib/defaultSettings.js';
import { validateImageDataUrl } from '../lib/validateImageDataUrl.js';
import { isMailerConfigured, invalidateMailerCache, sendAssignmentEmail } from '../lib/mailer.js';
import { publicSmtpStatus, resolveSmtpConfig } from '../lib/smtpConfig.js';
import { publicMsGraphStatus, resolveMsGraphConfig } from '../lib/msGraphConfig.js';
import { testMsGraphConnection, invalidateMsGraphCache, isMsGraphConfigured } from '../lib/msGraphCalendar.js';

export const settingsRouter = Router();

function settingsForClient(raw, { includeSecrets = false } = {}) {
  const s = { ...raw };
  const passSet = Boolean(String(s.smtp_pass || '').trim());
  const graphSecretSet = Boolean(String(s.ms_graph_client_secret || '').trim());
  delete s.smtp_pass;
  delete s.ms_graph_client_secret;
  return {
    ...s,
    smtp_pass_set: passSet,
    smtp_configured: isMailerConfigured(),
    smtp_status: publicSmtpStatus(),
    ms_graph_secret_set: graphSecretSet,
    ms_graph_configured: isMsGraphConfigured(),
    ms_graph_status: publicMsGraphStatus(),
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
      patch.smtp_pass = pass;
    }
  }
  if (body.clear_smtp_pass === true) {
    patch.smtp_pass = '';
  }

  if (body.ms_graph_tenant_id !== undefined) {
    patch.ms_graph_tenant_id = String(body.ms_graph_tenant_id ?? '').trim().slice(0, 80);
  }
  if (body.ms_graph_client_id !== undefined) {
    patch.ms_graph_client_id = String(body.ms_graph_client_id ?? '').trim().slice(0, 80);
  }
  if (body.ms_graph_client_secret !== undefined) {
    const secret = String(body.ms_graph_client_secret ?? '');
    if (secret.trim()) {
      patch.ms_graph_client_secret = secret.trim();
    }
  }
  if (body.clear_ms_graph_secret === true) {
    patch.ms_graph_client_secret = '';
  }

  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: 'Nothing to update' });
  }

  store.updateSettings(patch);
  invalidateMailerCache();
  invalidateMsGraphCache();
  store.appendAuditLog(req.user, {
    action: 'update',
    target_type: 'settings',
    target_id: null,
    summary: 'Updated system settings',
    detail: {
      fields: Object.keys(patch).map((k) => (
        k === 'smtp_pass' || k === 'ms_graph_client_secret' ? `${k}(updated)` : k
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
    res.status(502).json({ error: e.message || 'SMTP send failed' });
  }
});

/** Admin: verify Microsoft Graph app credentials (token fetch). */
settingsRouter.post('/test-ms-graph', requireAdmin, async (req, res) => {
  if (!isMsGraphConfigured()) {
    return res.status(503).json({
      error: 'Microsoft Graph is not configured. Save Tenant ID, Client ID, and Client secret first (Settings → Teams calendar).',
      ms_graph_status: publicMsGraphStatus(),
    });
  }
  const result = await testMsGraphConnection();
  if (!result.ok) {
    return res.status(502).json({
      error: result.reason || 'Microsoft Graph connection failed',
      ms_graph_status: publicMsGraphStatus(),
      hint: 'Confirm admin consent for Calendars.ReadWrite (Application) on the Azure app.',
    });
  }
  res.json({
    ok: true,
    ms_graph_status: publicMsGraphStatus(),
    config: { source: resolveMsGraphConfig().source },
  });
});
