# Lexync semantic design contract

This is the shared light-mode contract for Lexync web, Chromium extension, Jetpack Compose, and future SwiftUI clients. The source of truth is [`packages/design-system/src/tokens.json`](../packages/design-system/src/tokens.json), with the generated, consumable document stylesheet in [`packages/design-system/src/tokens.css`](../packages/design-system/src/tokens.css). Consumers use semantic roles rather than product-specific palette names or raw color literals.

## Scope

The contract covers brand assets, color and component state, typography, spacing, radii, elevation, motion, focus, and z-index. It is intentionally light-mode only. Audio controls are absent from this contract, and Android application rollout remains deferred to issue #46. Future SwiftUI rollout is specified here but not implemented by this ticket.

The canonical brand color is `#6429f4`. The supporting palette is dark ink for readable content, white for primary surfaces, and lavender neutrals for quiet surfaces and selected states. State colors are reserved for success, warning, danger, and informational feedback; they are not interchangeable with the primary brand role.

## Semantic roles

| Role | CSS variable | Use |
| --- | --- | --- |
| Brand primary | `--lexync-color-brand-primary` | Main call to action, selected navigation, active controls |
| Brand primary hover/active | `--lexync-color-brand-primary-hover`, `--lexync-color-brand-primary-active` | Pointer and pressed states |
| Ink | `--lexync-color-ink` | Headings, body copy, icons, control text |
| Muted ink | `--lexync-color-ink-muted` | Supporting copy and metadata |
| Surface | `--lexync-color-surface` | Cards, dialogs, popup panels, auth callback panels |
| Subtle/strong surface | `--lexync-color-surface-subtle`, `--lexync-color-surface-strong` | Page canvas, quiet panels, selected and hover backgrounds |
| Border | `--lexync-color-border`, `--lexync-color-border-strong` | Dividers, field boundaries, elevated surfaces |
| State | `--lexync-color-success`, `--lexync-color-warning`, `--lexync-color-danger`, `--lexync-color-info` | Feedback text and status indicators |
| State surface | `--lexync-color-success-surface`, `--lexync-color-warning-surface`, `--lexync-color-danger-surface`, `--lexync-color-info-surface` | Readable feedback containers |
| Focus | `--lexync-focus-color`, `--lexync-focus-ring` | Keyboard focus-visible treatment |

Use a semantic state role together with its matching state surface. A disabled control uses reduced opacity and a non-wait cursor; it does not introduce a new palette color. Error, empty, loading, saved, and needs-confirmation states remain named states in markup (`role="alert"`, `role="status"`, or an accessible dialog) and use the corresponding semantic roles.

## Token categories

- Typography uses display and body families, a compact type scale, explicit weights, and tight/normal/relaxed line heights. Use `--lexync-type-family-display` for expressive headings and `--lexync-type-family-body` for interface copy.
- Spacing uses the `--lexync-space-*` scale from `0` through `20`; layout rhythm should come from this scale rather than one-off values.
- Radii use `none`, `sm`, `md`, `lg`, `xl`, and `pill`. Use `pill` for compact actions and tags, and `xl` for major cards or dialogs.
- Elevation uses `none`, `low`, `medium`, and `high`. Shadows communicate containment and hierarchy, not decoration.
- Motion uses fast, normal, and slow durations with standard and emphasized easing. Every transition and animation must become effectively zero-duration when `prefers-reduced-motion: reduce` is active.
- Focus uses a visible purple outline with a two-pixel offset and a semantic focus ring. Focus must remain visible for keyboard users on buttons, links, fields, selectors, and injected controls.
- Z-index uses named layers (`base`, `sticky`, `dropdown`, `dialog`, `toast`, and `injected`). The injected layer is reserved for extension controls placed above a host page.

## Brand asset roles

Use the supplied artwork under `public/brand` (web) or the extension's packaged `brand` directory. `mark-dark-on-light.png` is the compact identity for narrow headers and popup chrome. `wordmark-dark-on-light.png` is the primary identity for public, auth, and callback surfaces. Light-on-dark variants are reserved for a future dark surface and must not be introduced as a dark-mode implementation here. Do not recreate the fox artwork with text, CSS, or a different icon.

## Web and document CSS

Import `@lexync/design-system/tokens.css` once from the web root stylesheet and from document-level extension pages (popup and auth callback). The stylesheet is generated from the JSON source and defines the `--lexync-*` custom properties on `:root`, keyboard focus treatment, and reduced-motion behavior. Run `pnpm --filter @lexync/design-system generate` after changing the source; the package check fails if the generated stylesheet drifts. Web and extension CSS can then consume roles such as:

```css
background: var(--lexync-color-surface-subtle);
color: var(--lexync-color-ink);
border-color: var(--lexync-color-border);
```

The package is exported as CSS and source TypeScript so both Next.js and WXT can consume it without a build-specific alias. Consumer files must not contain unrelated primary palettes or raw color literals; all colors belong in the package token source.

## Extension Shadow DOM

Injected Learning Mode, ordinary capture, Duolingo, and Clozemaster controls live in Shadow DOM so host-page styles cannot change their interaction contract. Import `shadowTokenCss` from `@lexync/design-system` and place it in the root's first `<style>` element. The helper defines the same semantic roles on `:host`, adds `focus-visible`, and honors reduced motion.

Injected controls use `--lexync-z-injected`, semantic surface/content roles, and accessible names/states. Their Shadow DOM style must reference `var(--lexync-...)`; it must not copy a host site's colors.

## Native mappings

### Jetpack Compose

Map the semantic source into a light `ColorScheme`: `brandPrimary` to `primary`, `ink` to `onBackground`/`onSurface`, `surface` to `background`/`surface`, `surfaceSubtle` to a lavender `surfaceVariant`, and each state role to its matching `error`, success, warning, or info component role. Map typography roles into `Typography`, spacing into `Dp` dimensions, radii into `RoundedCornerShape`, elevation into `CardDefaults`/`tonalElevation`, motion into `AnimationSpec`, focus into focus indicators, and z-index into `zIndex`. Keep the mapping semantic so Android can roll out under #46 without changing this contract.

### Future SwiftUI

Map `brandPrimary`, `ink`, `surface`, and lavender surfaces into named `Color` assets; map typography into named `Font` styles, spacing into `CGFloat` constants, radii into `RoundedRectangle` corner radii, elevation into named shadows, motion into `Animation`, and focus into accessibility/focus effects. Map the state roles to named semantic colors and injected z-index to the highest overlay layer. This is a future mapping only; no SwiftUI or Android implementation is required here.

## Provenance

The vendored Impeccable and design-taste-frontend skill bundles are pinned in `.agents/skills` from `https://github.com/VelHRH/landline` at commit `e1d86a34640c17e8678244ea57375a1f1f3db211`. Impeccable governs product interaction, accessibility, web, extension, and native adaptation. Design-taste-frontend governs web-appropriate visual execution. The complete provenance and supporting resources remain in that repository bundle and are not duplicated by this package.
