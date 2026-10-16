'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { readStoredTheme, storeTheme, themePreferences, type ThemePreference } from '../lib/themePreference';

const labels: Record<ThemePreference, string> = { system: 'System', light: 'Light', dark: 'Dark' };

const icons: Record<ThemePreference, string[]> = {
  system: ['M3 5a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5Z', 'M9 20h6'],
  light: ['M12 5V3', 'M12 21v-2', 'M5 12H3', 'M21 12h-2', 'M6.5 6.5 5 5', 'M19 19l-1.5-1.5', 'M6.5 17.5 5 19', 'M19 5l-1.5 1.5', 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z'],
  dark: ['M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z'],
};

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function ThemeSwitcher() {
  const theme = useSyncExternalStore(subscribe, readStoredTheme, () => 'system' as ThemePreference);

  const select = useCallback((preference: ThemePreference) => {
    storeTheme(preference);
    for (const listener of listeners) listener();
  }, []);

  return <div className="theme-switcher" data-ui="theme-switcher" role="group" aria-label="Colour theme">
    {themePreferences.map((preference) => <button
      aria-label={labels[preference]}
      aria-pressed={theme === preference}
      className="theme-switcher-option"
      key={preference}
      title={labels[preference]}
      type="button"
      onClick={() => select(preference)}
    >
      <svg aria-hidden="true" className="theme-switcher-icon" fill="none" focusable="false" height="18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" viewBox="0 0 24 24" width="18">
        {icons[preference].map((definition) => <path d={definition} key={definition} />)}
      </svg>
      <span className="theme-switcher-label">{labels[preference]}</span>
    </button>)}
  </div>;
}
