import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api';

const BrandingContext = createContext(null);

const DEFAULT_BRANDING = {
  org_display_name: 'C360',
  org_tagline: 'PROJECT MANAGEMENT',
  org_logo_url: '/brand/c360-pm.png',
  org_banner_url: null,
};

const LEGACY_NAMES = new Set(['PMO CTSB', 'PMO', '']);

function normalizeBranding(data = {}) {
  const name = String(data.org_display_name ?? '').trim();
  const tagline = String(data.org_tagline ?? '').trim();
  const logo = data.org_logo_url || DEFAULT_BRANDING.org_logo_url;
  return {
    ...DEFAULT_BRANDING,
    ...data,
    org_display_name: !name || LEGACY_NAMES.has(name) ? DEFAULT_BRANDING.org_display_name : name,
    org_tagline: !tagline || tagline === 'Technology-driven project office' || tagline === 'Project office'
      ? DEFAULT_BRANDING.org_tagline
      : tagline,
    org_logo_url: logo,
  };
}

export function BrandingProvider({ children }) {
  const [branding, setBranding] = useState(DEFAULT_BRANDING);

  const reload = useCallback(async () => {
    try {
      const data = await api.settings.getPublic();
      setBranding(normalizeBranding(data));
    } catch {
      setBranding(DEFAULT_BRANDING);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const value = useMemo(() => ({ branding, reload, setBranding }), [branding, reload]);

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  const ctx = useContext(BrandingContext);
  if (!ctx) throw new Error('useBranding must be used within BrandingProvider');
  return ctx;
}
