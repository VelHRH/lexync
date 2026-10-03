# ADR 0004: Glass over a gradient ground replaces the neubrutalist visual language

## Status

Accepted on 2026-10-03. Amended the same day: the palette decision below was made on an incomplete reading of the artwork and is corrected in the Amendment section at the end.

## Context

The shipped visual language was neubrutalist: every radius resolved to `0`, structure was carried by a two-pixel ink outline on anything operable, and elevation was a hard offset shadow with no blur that explicitly meant "this block can be acted on." The identity color was `#6429f4`, documented as Fox Purple.

Two problems accumulated.

The first is reception. The style reads as deliberately unfamiliar, which is a reasonable trade for a product that wants to be memorable and a poor one for a product an adult uses for long reading sessions. The owner's judgement after living with it was that the interface looked unfinished rather than distinctive.

The second is that the system disagreed with its own artwork. The token source declared `#6429f4` as the canonical brand color, but the in-page mark and wordmark are drawn in navy — `#00207c` for the mark, `#041244` for the wordmark. The icon family (favicon, apple touch icon, social preview) is purple. So "the brand color" named one thing in the tokens, a second thing in most of the artwork a learner sees inside the product, and a third thing in the tab.

The constraint on any replacement is that the brand artwork is fixed. The masters are pinned by SHA-256 checksum in `scripts/brand-asset-contract.mjs` and verified by `pnpm brand:validate`, and redrawing them was explicitly out of scope.

## Decision

The visual language becomes soft and dimensional: a blue gradient ground, radii that carry hierarchy, a hairline edge in translucent navy, soft shadows tinted with the brand navy, and translucent glass reserved for chrome.

The palette is derived from the artwork rather than declared beside it. `#00207c` — the navy the in-page mark is drawn in — is the canonical brand color, and `#2f6fe4` is the action step derived from it. `#6429f4` is retired from the token source and added to the legacy-palette guard so it cannot return through a consumer.

A warm secondary joins the system: `#df8256` for gradients and decorative fills, with `#9d4a22` as the only value permitted to carry text or an icon. It never colors an interaction. Blue remains the single interactive signal.

Three rules bound the use of glass, and each exists because the naive version of this style would damage a reading product:

- Glass carries no paragraph. Chrome — header, navigation, dialogs, dropdowns, toasts — may be translucent. Anything carrying a sentence the learner reads is an opaque canvas sheet.
- Blur is applied only where content scrolls beneath the layer. Over the smooth ground gradient there is nothing to blur, so those surfaces take a translucent fill and a highlight and cost nothing.
- The host page is not ours. Injected extension controls take the new radii, colors, and shadows, but their fill is always fully opaque and they never blur, because the background behind them is unknowable.

Glass degrades at the token level: `prefers-reduced-transparency: reduce`, `prefers-contrast: more`, and the absence of `backdrop-filter` support each resolve every glass fill to an opaque value and drop the blur.

Elevation stops meaning interactivity and starts meaning distance from the ground. Pressing a control darkens its fill and drops its shadow one step; nothing moves.

Typography becomes three families with disjoint jobs: Plus Jakarta Sans for voice, Atkinson Hyperlegible retained for everything operable and read at length, and Courier Prime narrowed from "titles, captured language, and counters" down to the learner's captured expressions and quoted source material alone.

Dark mode remains deferred. The system is light-only.

## Consequences

The design contract tests invert. Assertions that pinned square corners and two-pixel borders (`borderRadius` is `0`, `borderWidth >= 2`) now pin the opposite, and two new invariants are added: the radius scale must be ascending and non-zero, and every glass role must have an opaque fallback declared in the generated stylesheet.

The token source grows two categories, `gradient` and `glass`, and the generator emits a reduced-transparency media block that no hand-written consumer can forget.

The identity remains split. The product now reads navy-and-blue, which matches the mark and wordmark a learner sees inside the application, while the browser tab, home screen icon, and social preview card remain purple. This is an improvement — previously the tokens matched neither — but it is not resolved. Resolving it requires redrawing the icon family, which breaks the pinned master checksums and belongs to its own piece of work.

Nothing in this record governs layout. The page structure established before this change is kept as it stands.


## Amendment, 2026-10-03

The palette decision above rested on sampling only the dominant colors of each asset. That reading was wrong in a way that mattered: the wordmark is not navy alone. It sets one letter — the `x` — in `#611efc`, a violet all but identical to the retired `#6429f4`. The owner noticed what the sampling missed.

So the artwork was never navy-versus-purple; it was navy **with** a violet accent, and the system should say the same thing. The decision is corrected rather than reversed:

- `#611efc`, the violet of that letter, becomes the primary action color — buttons, focus, selection, active navigation.
- `#00207c` remains the deep brand step: gradients, brand blocks, large sweeps. It is still what the mark is drawn in.
- The warm ember accent is unchanged, and still never colors an interaction.
- The brand gradient runs navy through violet into ember, so one sweep now contains every brand color at once.
- `#6429f4` stays out of the legacy-palette guard only because its replacement is a different value; the retired lavender surfaces remain guarded.

The split with the icon family narrows but does not close: the tab icon is `#6429f4` and the product is now `#611efc`. Those read as the same color at icon size, so redrawing the icons is no longer urgent — but it is still the only way to make the two exactly agree.

The lesson worth keeping: a dominant-color sample describes a logo's mass, not its intent. An accent is usually the smallest region in the file and the most deliberate decision in it.
