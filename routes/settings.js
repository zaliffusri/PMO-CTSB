import { Router } from 'express';
import { store } from '../db/store.js';
import { requireAdmin } from '../middleware/requireAuth.js';
import { defaultSettings } from '../lib/defaultSettings.js';
import { validateImageDataUrl } from '../lib/validateImageDataUrl.js';

export const settingsRouter = Router();

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
  res.json(store.getSettings());
});

settingsRouter.put('/', requireAdmin, (req, res) => {
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

  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: 'Nothing to update' });
  }

  store.updateSettings(patch);
  store.appendAuditLog(req.user, {
    action: 'update',
    target_type: 'settings',
    target_id: null,
    summary: 'Updated system settings',
    detail: { fields: Object.keys(patch) },
  });
  res.json(store.getSettings());
});
