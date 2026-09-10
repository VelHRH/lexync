import tokenSource from './tokens.json';

export const semanticTokens = tokenSource;

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
