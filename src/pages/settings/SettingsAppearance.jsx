import ThemeModeSelect from '../../components/ThemeModeSelect';

/**
 * Admin-facing Appearance settings — personal UI mode (localStorage).
 * Does not change org branding or API settings.
 */
export default function SettingsAppearance() {
  return (
    <div className="settings-panel ui-card">
      <div className="settings-panel__header">
        <div className="settings-panel__header-text">
          <h2 className="settings-panel__title">Appearance</h2>
          <p className="settings-panel__desc">
            Choose how the workspace looks on this device. Your selection is saved in the browser and applies across
            every page without changing business data or workflows.
          </p>
        </div>
      </div>

      <div className="settings-panel__body">
        <ThemeModeSelect variant="radios" idPrefix="settings-ui-mode" showDescriptions />
        <p className="settings-appearance-hint">
          You can also change UI Mode from the theme control in the sidebar or top bar, or from My account.
        </p>
      </div>
    </div>
  );
}
