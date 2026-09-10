import { semanticTokens } from './tokens';

export const shadowTokenCss = `
:host {
  all: initial;
  color-scheme: light;
  --lexync-color-brand-primary: ${semanticTokens.color.brandPrimary};
  --lexync-color-brand-primary-hover: ${semanticTokens.color.brandPrimaryHover};
  --lexync-color-brand-primary-active: ${semanticTokens.color.brandPrimaryActive};
  --lexync-color-ink: ${semanticTokens.color.ink};
  --lexync-color-ink-muted: ${semanticTokens.color.inkMuted};
  --lexync-color-white: ${semanticTokens.color.white};
  --lexync-color-surface: ${semanticTokens.color.surface};
  --lexync-color-surface-subtle: ${semanticTokens.color.surfaceSubtle};
  --lexync-color-surface-strong: ${semanticTokens.color.surfaceStrong};
  --lexync-color-surface-deep: ${semanticTokens.color.surfaceDeep};
  --lexync-color-border: ${semanticTokens.color.border};
  --lexync-color-border-strong: ${semanticTokens.color.borderStrong};
  --lexync-color-success: ${semanticTokens.color.success};
  --lexync-color-success-surface: ${semanticTokens.color.successSurface};
  --lexync-color-warning: ${semanticTokens.color.warning};
  --lexync-color-warning-surface: ${semanticTokens.color.warningSurface};
  --lexync-color-danger: ${semanticTokens.color.danger};
  --lexync-color-danger-surface: ${semanticTokens.color.dangerSurface};
  --lexync-color-info: ${semanticTokens.color.info};
  --lexync-color-info-surface: ${semanticTokens.color.infoSurface};
  --lexync-type-family-display: ${semanticTokens.typography.fontFamilyDisplay};
  --lexync-type-family-body: ${semanticTokens.typography.fontFamilyBody};
  --lexync-type-family-mono: ${semanticTokens.typography.fontFamilyMono};
  --lexync-type-size-xs: ${semanticTokens.typography.fontSizeXs};
  --lexync-type-size-sm: ${semanticTokens.typography.fontSizeSm};
  --lexync-type-size-md: ${semanticTokens.typography.fontSizeMd};
  --lexync-type-size-lg: ${semanticTokens.typography.fontSizeLg};
  --lexync-type-size-xl: ${semanticTokens.typography.fontSizeXl};
  --lexync-type-size-2xl: ${semanticTokens.typography.fontSize2xl};
  --lexync-type-weight-regular: ${semanticTokens.typography.fontWeightRegular};
  --lexync-type-weight-medium: ${semanticTokens.typography.fontWeightMedium};
  --lexync-type-weight-semibold: ${semanticTokens.typography.fontWeightSemibold};
  --lexync-type-weight-bold: ${semanticTokens.typography.fontWeightBold};
  --lexync-type-line-tight: ${semanticTokens.typography.lineHeightTight};
  --lexync-type-line-normal: ${semanticTokens.typography.lineHeightNormal};
  --lexync-type-line-relaxed: ${semanticTokens.typography.lineHeightRelaxed};
  --lexync-space-1: ${semanticTokens.spacing.space1};
  --lexync-space-2: ${semanticTokens.spacing.space2};
  --lexync-space-3: ${semanticTokens.spacing.space3};
  --lexync-space-4: ${semanticTokens.spacing.space4};
  --lexync-space-5: ${semanticTokens.spacing.space5};
  --lexync-space-6: ${semanticTokens.spacing.space6};
  --lexync-space-8: ${semanticTokens.spacing.space8};
  --lexync-space-10: ${semanticTokens.spacing.space10};
  --lexync-space-12: ${semanticTokens.spacing.space12};
  --lexync-radius-sm: ${semanticTokens.radius.sm};
  --lexync-radius-md: ${semanticTokens.radius.md};
  --lexync-radius-lg: ${semanticTokens.radius.lg};
  --lexync-radius-xl: ${semanticTokens.radius.xl};
  --lexync-radius-pill: ${semanticTokens.radius.pill};
  --lexync-elevation-low: ${semanticTokens.elevation.low};
  --lexync-elevation-medium: ${semanticTokens.elevation.medium};
  --lexync-elevation-high: ${semanticTokens.elevation.high};
  --lexync-motion-duration-fast: ${semanticTokens.motion.durationFast};
  --lexync-motion-duration-normal: ${semanticTokens.motion.durationNormal};
  --lexync-motion-duration-slow: ${semanticTokens.motion.durationSlow};
  --lexync-motion-easing-standard: ${semanticTokens.motion.easingStandard};
  --lexync-focus-color: ${semanticTokens.focus.color};
  --lexync-focus-width: ${semanticTokens.focus.width};
  --lexync-focus-offset: ${semanticTokens.focus.offset};
  --lexync-focus-ring: ${semanticTokens.focus.ring};
  --lexync-z-injected: ${semanticTokens.zIndex.injected};
}

:host, *, *::before, *::after {
  box-sizing: border-box;
}

:where(button, input, select, textarea):focus-visible {
  outline: var(--lexync-focus-width) solid var(--lexync-focus-color);
  outline-offset: var(--lexync-focus-offset);
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0s !important;
  }
}
`;
