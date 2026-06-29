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
    <form onSubmit={save} className="settings-branding ui-card">
      <h2 className="settings-section-title">Workspace branding</h2>
      <p className="settings-section-desc">
        Upload your organization logo and a banner image. These appear on the sign-in screen, sidebar, and dashboard welcome area.
      </p>

      {err && <p className="settings-msg settings-msg--error">{err}</p>}
      {msg && <p className="settings-msg settings-msg--ok">{msg}</p>}

      <label className="settings-field form-field">
        Display name
        <input
          type="text"
          className="form-field__input ui-input"
          value={form.org_display_name || ''}
          onChange={(e) => setForm((f) => ({ ...f, org_display_name: e.target.value }))}
          placeholder="PMO CTSB"
        />
      </label>

      <label className="settings-field form-field">
        Tagline
        <input
          type="text"
          className="form-field__input ui-input"
          value={form.org_tagline || ''}
          onChange={(e) => setForm((f) => ({ ...f, org_tagline: e.target.value }))}
          placeholder="Technology-driven project office"
        />
      </label>

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

      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save branding'}
        </button>
      </div>
    </form>
  );
}
