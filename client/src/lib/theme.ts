import { useEffect, useState } from 'react';

/** Préférence de thème commune à la Suite Atelier (public/atelier-brand/atelier-theme.js). */
export type ThemePref = 'system' | 'light' | 'dark';

interface AtelierTheme {
  get(): ThemePref;
  set(pref: ThemePref): void;
  resolved(): 'light' | 'dark';
}

declare global {
  interface Window {
    atelierTheme?: AtelierTheme;
  }
}

/** Préférence courante + setter ; suit les changements faits ailleurs (autre onglet, autre app). */
export function useThemePref(): [ThemePref, (p: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>(() => window.atelierTheme?.get() ?? 'system');
  useEffect(() => {
    const onChange = () => setPref(window.atelierTheme?.get() ?? 'system');
    window.addEventListener('atelier-theme', onChange);
    document.addEventListener('visibilitychange', onChange);
    return () => {
      window.removeEventListener('atelier-theme', onChange);
      document.removeEventListener('visibilitychange', onChange);
    };
  }, []);
  return [pref, (p) => window.atelierTheme?.set(p)];
}
