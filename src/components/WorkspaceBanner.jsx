import { useAuth } from '../AuthContext';
import { useBranding } from '../context/BrandingContext';

export default function WorkspaceBanner() {
  const { user } = useAuth();
  const { branding } = useBranding();
  const firstName = user?.name?.split(' ')[0] || 'there';
  const hasBanner = Boolean(branding.org_banner_url);

  return (
    <section
      className={`workspace-banner ${hasBanner ? 'workspace-banner--photo' : ''}`}
      style={hasBanner ? { backgroundImage: `url(${branding.org_banner_url})` } : undefined}
    >
      <div className="workspace-banner__overlay" />
      <div className="workspace-banner__content">
        {branding.org_logo_url && (
          <img src={branding.org_logo_url} alt="" className="workspace-banner__logo" />
        )}
        <div>
          <p className="workspace-banner__eyebrow">{branding.org_display_name}</p>
          <h2 className="workspace-banner__title">Welcome back, {firstName}</h2>
          <p className="workspace-banner__subtitle">
            {branding.org_tagline || 'Portfolio health, delivery, and team capacity at a glance.'}
          </p>
        </div>
      </div>
    </section>
  );
}
