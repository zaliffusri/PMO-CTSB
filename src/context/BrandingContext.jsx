import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api';

const BrandingContext = createContext(null);

const DEFAULT_BRANDING = {
  org_display_name: 'PMO CTSB',
  org_tagline: 'Project office',
  org_logo_url: null,
  org_banner_url: null,
};

export function BrandingProvider({ children }) {
  const [branding, setBranding] = useState(DEFAULT_BRANDING);

  const reload = useCallback(async () => {
    try {
      const data = await api.settings.getPublic();
      setBranding({ ...DEFAULT_BRANDING, ...data });
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
