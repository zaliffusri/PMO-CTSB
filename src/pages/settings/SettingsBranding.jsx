import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../api';
import { useBranding } from '../../context/BrandingContext';
import ImageUploadField from '../../components/ImageUploadField';
import { IMAGE_PRESETS } from '../../lib/imageResize';

export default function SettingsBranding() {
  const { form, setForm, reload } = useOutletContext();
  const { reload: reloadBranding } = useBranding();
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  if (!form) return null;

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErr('');
    setMsg('');
    try {
      await api.settings.update({
        org_display_name: form.org_display_name,
        org_tagline: form.org_tagline,
        org_logo_url: form.org_logo_url,
        org_banner_url: form.org_banner_url,
      });
      await reload();
      await reloadBranding();
      setMsg('Branding saved. Logo and banner appear across the workspace.');
    } catch (e) {
      setErr(e.message || 'Failed to save branding');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="settings-panel ui-card">
      <div className="settings-panel__header">
        <div className="settings-panel__header-text">
          <h2 className="settings-panel__title">Workspace branding</h2>
          <p className="settings-panel__desc">
            Organization name, logo, and banner used on sign-in, sidebar, and the dashboard welcome area.
          </p>
        </div>
      </div>

      <div className="settings-panel__body">
        {err && <p className="settings-alert settings-alert--error" role="alert">{err}</p>}
        {msg && <p className="settings-alert settings-alert--ok" role="status">{msg}</p>}

        <div className="settings-grid-2">
          <div className="form-field">
            <label className="form-field__label" htmlFor="org-display-name">Display name</label>
            <input
              id="org-display-name"
              type="text"
              className="form-field__input ui-input"
              value={form.org_display_name || ''}
              onChange={(e) => setForm((f) => ({ ...f, org_display_name: e.target.value }))}
              placeholder="PMO CTSB"
            />
          </div>

          <div className="form-field">
            <label className="form-field__label" htmlFor="org-tagline">Tagline</label>
            <input
              id="org-tagline"
              type="text"
              className="form-field__input ui-input"
              value={form.org_tagline || ''}
              onChange={(e) => setForm((f) => ({ ...f, org_tagline: e.target.value }))}
              placeholder="Technology-driven project office"
            />
          </div>
        </div>

        <div className="settings-branding-images">
          <ImageUploadField
            label="Organization logo"
            hint="PNG or JPG, shown in sidebar and sign-in. Recommended ~160×64px."
            value={form.org_logo_url}
            onChange={(org_logo_url) => setForm((f) => ({ ...f, org_logo_url }))}
            onError={setErr}
            preset={IMAGE_PRESETS.logo}
            variant="logo"
          />
          <ImageUploadField
            label="Workspace banner"
            hint="Wide image for dashboard welcome. Recommended 1200×320px."
            value={form.org_banner_url}
            onChange={(org_banner_url) => setForm((f) => ({ ...f, org_banner_url }))}
            onError={setErr}
            preset={IMAGE_PRESETS.banner}
            variant="banner"
          />
        </div>
      </div>

      <div className="settings-panel__footer">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save branding'}
        </button>
      </div>
    </form>
  );
}
