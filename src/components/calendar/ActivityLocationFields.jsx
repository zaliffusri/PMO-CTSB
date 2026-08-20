import { inputStyle } from '../../styles/commonStyles';
import { ACTIVITY_LOCATION_OTHERS } from '../../constants/activityLocations';

/** Location from Settings → Locations (plus Others). */
export default function ActivityLocationFields({ siteLocations, preset, other, onPreset, onOther, style }) {
  return (
    <>
      <label style={style}>
        Location *
        <select value={preset} onChange={(e) => onPreset(e.target.value)} required style={inputStyle}>
          <option value="">Select location…</option>
          {siteLocations.map((loc) => (
            <option key={loc} value={loc}>
              {loc}
            </option>
          ))}
          <option value={ACTIVITY_LOCATION_OTHERS}>{ACTIVITY_LOCATION_OTHERS}</option>
        </select>
      </label>
      {preset === ACTIVITY_LOCATION_OTHERS && (
        <label style={{ gridColumn: '1 / -1' }}>
          Specify location *
          <input
            type="text"
            value={other}
            onChange={(e) => onOther(e.target.value)}
            placeholder="Custom location name"
            required
            style={inputStyle}
          />
        </label>
      )}
    </>
  );
}
