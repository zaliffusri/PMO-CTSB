/** Default ePBT module catalog — aligns with legacy eTicket TicketID prefix (eT-CK-0164). */
export const EPBT_MODULES = [
  { code: 'CK', label: 'Cukai' },
  { code: 'LSN', label: 'Lesen' },
  { code: 'PN', label: 'Penilaian' },
  { code: 'KU', label: 'Kaunter' },
  { code: 'SE', label: 'Sewa Premis' },
  { code: 'PP', label: 'Portal Pengguna' },
  { code: 'MK', label: 'Kompaun' },
  { code: 'PROC', label: 'Pembelian - Perolehan' },
  { code: 'WA', label: 'Wang Amanah & Deposit' },
  { code: 'LA', label: 'Lejer Am' },
  { code: 'ABB', label: 'Akaun Belum Bayar' },
  { code: 'SP', label: 'Sewa Pelbagai' },
  { code: 'KB', label: 'Kawalan Bajet' },
  { code: 'API', label: 'API' },
  { code: 'PT', label: 'Pemantauan Tunggakan & Mobile Apps' },
  { code: 'PB', label: 'Perancangan Bajet' },
  { code: 'EK', label: 'EKutipan+' },
  { code: 'XXX', label: 'General / other' },
];

export const EPBT_MODULE_CODE_SET = new Set(EPBT_MODULES.map((m) => m.code));

const CODE_RE = /^[A-Z0-9]{1,12}$/;

/** Normalize a modules list from settings/API; empty/invalid → default catalog. */
export function resolveEpbtModules(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return EPBT_MODULES.map((m) => ({ ...m }));
  const seen = new Set();
  const out = [];
  for (const row of raw) {
    const code = String(row?.code || '').trim().toUpperCase();
    const label = String(row?.label || '').trim();
    if (!CODE_RE.test(code) || !label) continue;
    if (seen.has(code)) continue;
    seen.add(code);
    out.push({ code, label });
  }
  return out.length ? out : EPBT_MODULES.map((m) => ({ ...m }));
}

function catalogMaps(modules) {
  const list = resolveEpbtModules(modules);
  return {
    list,
    byCode: new Map(list.map((m) => [m.code, m])),
    byLabel: new Map(list.map((m) => [m.label.toLowerCase(), m])),
    codes: new Set(list.map((m) => m.code)),
  };
}

export function normalizeModuleCode(value, modules = EPBT_MODULES) {
  const { byLabel, codes, list } = catalogMaps(modules);
  const fallback = codes.has('XXX') ? 'XXX' : (list[0]?.code || 'XXX');
  if (value == null || value === '') return fallback;
  const v = String(value).trim().toUpperCase();
  if (codes.has(v)) return v;
  const fromTicket = String(value || '').match(/^eT-([A-Z0-9]+)-/i);
  if (fromTicket) {
    const code = fromTicket[1].toUpperCase();
    if (codes.has(code)) return code;
  }
  const labelMatch = byLabel.get(String(value).trim().toLowerCase());
  if (labelMatch) return labelMatch.code;
  // Keep well-formed codes that were removed from the catalog (historical rows).
  if (CODE_RE.test(v)) return v;
  return fallback;
}

export function moduleLabelForCode(code, modules = EPBT_MODULES) {
  const { byCode, list } = catalogMaps(modules);
  const raw = String(code || '').trim().toUpperCase();
  if (byCode.has(raw)) return byCode.get(raw).label;
  const normalized = normalizeModuleCode(code, modules);
  return byCode.get(normalized)?.label ?? raw ?? list[0]?.label ?? 'General / other';
}

export function parseModuleCodeFromTicketId(ticketId, modules = EPBT_MODULES) {
  const m = String(ticketId || '').match(/^eT-([A-Z0-9]+)-/i);
  if (!m) return null;
  const code = m[1].toUpperCase();
  const { codes, list } = catalogMaps(modules);
  const fallback = codes.has('XXX') ? 'XXX' : (list[0]?.code || 'XXX');
  return codes.has(code) ? code : fallback;
}

export function moduleCodeFromLabel(label, modules = EPBT_MODULES) {
  const { byLabel, codes, list } = catalogMaps(modules);
  const fallback = codes.has('XXX') ? 'XXX' : (list[0]?.code || 'XXX');
  if (!label) return fallback;
  const hit = byLabel.get(String(label).trim().toLowerCase());
  return hit?.code ?? fallback;
}

/** Validate modules payload for settings PUT. Returns { ok, modules, error }. */
export function validateEpbtModulesPayload(raw) {
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'epbt_modules must be an array' };
  }
  const seen = new Set();
  const modules = [];
  for (const row of raw) {
    const code = String(row?.code || '').trim().toUpperCase();
    const label = String(row?.label || '').trim();
    if (!code || !label) {
      return { ok: false, error: 'Each module needs a code and label' };
    }
    if (!CODE_RE.test(code)) {
      return { ok: false, error: `Invalid module code "${code}" (use A–Z / 0–9, max 12)` };
    }
    if (seen.has(code)) {
      return { ok: false, error: `Duplicate module code "${code}"` };
    }
    seen.add(code);
    modules.push({ code, label: label.slice(0, 120) });
  }
  if (!modules.length) {
    return { ok: false, error: 'Add at least one module' };
  }
  return { ok: true, modules };
}
