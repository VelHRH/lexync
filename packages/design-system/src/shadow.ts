import { semanticTokens } from './tokens';

const prefixes: Record<string, string> = {
  color: 'color',
  gradient: 'gradient',
  glass: 'glass',
  typography: 'type',
  spacing: 'space',
  border: 'border',
  radius: 'radius',
  elevation: 'elevation',
  motion: 'motion',
  focus: 'focus',
  zIndex: 'z',
};

function kebabCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function tokenName(category: string, key: string): string {
  let normalized = key;
  if (category === 'spacing') normalized = normalized.replace(/^space/, '');
  if (category === 'typography') {
    normalized = normalized
      .replace(/^fontFamily/, 'family')
      .replace(/^fontSize/, 'size')
      .replace(/^fontWeight/, 'weight')
      .replace(/^lineHeight/, 'line')
      .replace(/^size(?=\d)/, 'size-');
  }
  return `--lexync-${prefixes[category]}-${kebabCase(normalized)}`;
}

const injectedOverrides: Record<string, string> = {
  '--lexync-glass-fill': semanticTokens.glass.fillOpaque,
  '--lexync-glass-fill-strong': semanticTokens.glass.fillOpaque,
  '--lexync-glass-fill-quiet': semanticTokens.glass.fillOpaque,
  '--lexync-glass-blur': 'none',
  '--lexync-glass-blur-strong': 'none',
  '--lexync-glass-border': semanticTokens.color.borderStrong,
};

const declarations = Object.entries(semanticTokens)
  .filter(([category]) => category in prefixes)
  .flatMap(([category, values]) =>
    Object.entries(values as Record<string, string>).map(([key, value]) => {
      const name = tokenName(category, key);
      return `  ${name}: ${injectedOverrides[name] ?? value};`;
    }),
  )
  .join('\n');

export const shadowTokenCss = `
:host {
  all: initial;
  color-scheme: light;
${declarations}
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
