/** ePBT module catalog — aligns with legacy eTicket TicketID prefix (eT-CK-0164). */
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

const byCode = new Map(EPBT_MODULES.map((m) => [m.code, m]));
const byLabel = new Map(EPBT_MODULES.map((m) => [m.label.toLowerCase(), m]));

export function normalizeModuleCode(value) {
  if (value == null || value === '') return 'XXX';
  const v = String(value).trim().toUpperCase();
  if (EPBT_MODULE_CODE_SET.has(v)) return v;
  const fromTicket = parseModuleCodeFromTicketId(value);
  if (fromTicket) return fromTicket;
  const labelMatch = byLabel.get(String(value).trim().toLowerCase());
  if (labelMatch) return labelMatch.code;
  return 'XXX';
}

export function moduleLabelForCode(code) {
  const c = normalizeModuleCode(code);
  return byCode.get(c)?.label ?? code ?? 'General / other';
}

export function parseModuleCodeFromTicketId(ticketId) {
  const m = String(ticketId || '').match(/^eT-([A-Z0-9]+)-/i);
  if (!m) return null;
  const code = m[1].toUpperCase();
  return EPBT_MODULE_CODE_SET.has(code) ? code : 'XXX';
}

export function moduleCodeFromLabel(label) {
  if (!label) return 'XXX';
  const hit = byLabel.get(String(label).trim().toLowerCase());
  return hit?.code ?? 'XXX';
}
