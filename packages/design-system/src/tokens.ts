export const semanticTokens = {
  color: {
    brandPrimary: '#6429f4',
    brandPrimaryHover: '#5120d2',
    brandPrimaryActive: '#4218b5',
    ink: '#20153f',
    inkMuted: '#5f5872',
    white: '#ffffff',
    lavender: '#f3efff',
    lavenderStrong: '#e7dcff',
    lavenderDeep: '#d3c2ff',
    border: 'rgba(32, 21, 63, 0.16)',
    borderStrong: 'rgba(32, 21, 63, 0.3)',
    success: '#18794e',
    successSurface: '#e5f6ed',
    warning: '#8a5700',
    warningSurface: '#fff3d6',
    danger: '#b42318',
    dangerSurface: '#ffebe9',
    info: '#2457a6',
    infoSurface: '#e8f0ff',
    scrim: 'rgba(32, 21, 63, 0.48)',
  },
  typography: {
    fontFamilyDisplay: '"Avenir Next", "Segoe UI", sans-serif',
    fontFamilyBody: '"Inter", "Segoe UI", sans-serif',
    fontFamilyMono: '"SFMono-Regular", Consolas, monospace',
    fontSizeXs: '0.75rem',
    fontSizeSm: '0.875rem',
    fontSizeMd: '1rem',
    fontSizeLg: '1.125rem',
    fontSizeXl: '1.5rem',
    fontSize2xl: '2rem',
    fontSize3xl: 'clamp(2.5rem, 7vw, 4.5rem)',
    fontWeightRegular: '400',
    fontWeightMedium: '500',
    fontWeightSemibold: '600',
    fontWeightBold: '700',
    lineHeightTight: '1.1',
    lineHeightNormal: '1.5',
    lineHeightRelaxed: '1.65',
  },
  spacing: {
    space0: '0',
    space1: '0.25rem',
    space2: '0.5rem',
    space3: '0.75rem',
    space4: '1rem',
    space5: '1.25rem',
    space6: '1.5rem',
    space8: '2rem',
    space10: '2.5rem',
    space12: '3rem',
    space16: '4rem',
    space20: '5rem',
  },
  radius: {
    none: '0',
    sm: '0.375rem',
    md: '0.625rem',
    lg: '1rem',
    xl: '1.5rem',
    pill: '999px',
  },
  elevation: {
    none: 'none',
    low: '0 0.25rem 1rem rgba(32, 21, 63, 0.08)',
    medium: '0 0.75rem 2rem rgba(32, 21, 63, 0.14)',
    high: '0 1.5rem 4rem rgba(32, 21, 63, 0.2)',
  },
  motion: {
    durationFast: '120ms',
    durationNormal: '180ms',
    durationSlow: '280ms',
    easingStandard: 'cubic-bezier(0.2, 0, 0, 1)',
    easingEmphasized: 'cubic-bezier(0.2, 0, 0, 1.2)',
  },
  focus: {
    color: '#6429f4',
    width: '3px',
    offset: '2px',
    ring: '0 0 0 3px rgba(100, 41, 244, 0.28)',
  },
  zIndex: {
    base: '0',
    sticky: '10',
    dropdown: '20',
    dialog: '30',
    toast: '40',
    injected: '2147483647',
  },
  brandAsset: {
    markDarkOnLight: '/brand/mark-dark-on-light.png',
    wordmarkDarkOnLight: '/brand/wordmark-dark-on-light.png',
    markLightOnDark: '/brand/mark-light-on-dark.png',
    wordmarkLightOnDark: '/brand/wordmark-light-on-dark.png',
  },
} as const;

export type SemanticTokens = typeof semanticTokens;

export type TokenPath =
  | `--lexync-color-${string}`
  | `--lexync-type-${string}`
  | `--lexync-space-${string}`
  | `--lexync-radius-${string}`
  | `--lexync-elevation-${string}`
  | `--lexync-motion-${string}`
  | `--lexync-focus-${string}`
  | `--lexync-z-${string}`
  | `--lexync-brand-${string}`;

export function tokenVar(name: TokenPath, fallback?: string): string {
  return fallback ? `var(${name}, ${fallback})` : `var(${name})`;
}
