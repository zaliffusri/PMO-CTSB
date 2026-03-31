import { Router } from 'express';
import { store } from '../db/store.js';
import { requireAdmin } from '../middleware/requireAuth.js';
import { defaultSettings } from '../lib/defaultSettings.js';

export const settingsRouter = Router();

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
