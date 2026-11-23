import { useLayoutEffect, useState } from 'react';
import type { LogoState } from './steps/BrandStep.js';

const logoStorageKey = 'nennbox.onboarding-preview.logo.v1';

function savedLogo(): LogoState {
  try {
    const raw = window.localStorage.getItem(logoStorageKey);
    return raw ? (JSON.parse(raw) as LogoState) : null;
  } catch {
    return null;
  }
}

export function useOnboardingLogo() {
  const [logo, setLogo] = useState<LogoState>(savedLogo);
  const [logoStorageFailed, setLogoStorageFailed] = useState(false);
  useLayoutEffect(() => {
    try {
      if (logo)
        window.localStorage.setItem(logoStorageKey, JSON.stringify(logo));
      else window.localStorage.removeItem(logoStorageKey);
      // The external storage write determines whether the logo survives this session.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLogoStorageFailed(false);
    } catch {
      setLogoStorageFailed(true);
    }
  }, [logo]);
  return { logo, setLogo, logoStorageFailed };
}
