/** Default activity site presets (Calendar location dropdown). Kept in sync with frontend `constants/activityLocations.js`. */
export const DEFAULT_ACTIVITY_LOCATIONS = [
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

export function defaultSettings() {
  return {
    activity_locations: [...DEFAULT_ACTIVITY_LOCATIONS],
    /** Display name for the reference point used for mileage (e.g. main office). */
    reference_office_name: 'JB Office',
    /** Distance in km from reference office to each preset location (optional per key). */
    mileage_from_office_km: {},
    /** Free-form notes shown internally (e.g. policy reminders). */
    general_notes: '',
    /** ISO 4217 code for mileage / claims context. */
    currency_code: 'MYR',
  };
}
