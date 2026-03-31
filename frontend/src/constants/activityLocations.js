/** SITE column presets for activity location (plus "Others" for free text). Default when API settings are not loaded. */
export const DEFAULT_ACTIVITY_SITE_LOCATIONS = [
  'MBJB',
  'MBIP Medini',
  'MBPG',
  'MPKU',
  'MDKT',
  'MPPN',
  'MDSR',
  'MPK',
  'MDYP',
  'MPBP',
  'MDM',
  'MPM',
  'MDL',
  'MPS',
  'MDT',
  'MPP',
  'NUSAJAYA',
  'SAJ',
  'MBDK',
  'MBKuantan',
  'MSC Office',
];

/** @deprecated use DEFAULT_ACTIVITY_SITE_LOCATIONS */
export const ACTIVITY_SITE_LOCATIONS = DEFAULT_ACTIVITY_SITE_LOCATIONS;

export const ACTIVITY_LOCATION_OTHERS = 'Others';

/** @param {string|null|undefined} stored */
/** @param {string[]|undefined} presetList from Settings; falls back to default list */
export function resolveLocationForForm(stored, presetList) {
  const presets = presetList?.length ? presetList : DEFAULT_ACTIVITY_SITE_LOCATIONS;
  const s = stored != null ? String(stored).trim() : '';
  if (!s) return { preset: '', custom: '' };
  if (presets.includes(s)) return { preset: s, custom: '' };
  return { preset: ACTIVITY_LOCATION_OTHERS, custom: s };
}

/** @param {string} preset */
/** @param {string} custom */
export function composeLocation(preset, custom) {
  if (preset === ACTIVITY_LOCATION_OTHERS) return String(custom || '').trim();
  return String(preset || '').trim();
}
