export const themeCookie = 'lexync_theme';

export const themePreferences = ['system', 'light', 'dark'] as const;

export type ThemePreference = (typeof themePreferences)[number];

export function isThemePreference(value: string): value is ThemePreference {
  return (themePreferences as readonly string[]).includes(value);
}

export function readStoredTheme(): ThemePreference {
  const match = document.cookie.split('; ').find((entry) => entry.startsWith(`${themeCookie}=`));
  const value = match ? decodeURIComponent(match.slice(themeCookie.length + 1)) : '';
  return isThemePreference(value) ? value : 'system';
}

export function storeTheme(preference: ThemePreference) {
  document.cookie = `${themeCookie}=${preference}; path=/; max-age=31536000; samesite=lax`;
  if (preference === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', preference);
}
