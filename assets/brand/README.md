# Lexync brand assets

This directory is the canonical source for Lexync product artwork. The five files in `masters/` preserve the supplied PNG bytes exactly. Generated files in `platform/` are reproducible derivatives for product integration.

## Semantic roles

| Asset | Role | Use |
| --- | --- | --- |
| `masters/icon-primary-purple.png` | Primary icon source | Starting point for installed application, extension, and store icons |
| `masters/mark-dark-on-light.png` | Dark fox mark | Light surfaces where the full wordmark is too wide |
| `masters/mark-light-on-dark.png` | Light fox mark | Dark surfaces where the full wordmark is too wide |
| `masters/wordmark-dark-on-light.png` | Dark full wordmark | Light sign-in, launch, marketing, and wide product surfaces |
| `masters/wordmark-light-on-dark.png` | Light full wordmark | Dark sign-in, launch, marketing, and wide product surfaces |

The words `dark` and `light` describe the artwork, while `on-light` and `on-dark` name the intended background. `catalog.json` is the machine-readable contract for roles, dimensions, alpha behavior, content bounds, and checksums.

## Platform outputs

- Chromium receives 16, 24, 32, 48, and 128 pixel transparent PNGs. The 128 pixel store icon intentionally centers 96 pixel artwork inside 16 pixels of transparent padding on each side.
- Android receives 48, 72, 96, 144, and 192 pixel legacy PNGs, a 432 pixel adaptive foreground and background pair representing 108dp at xxxhdpi, and a 512 pixel Google Play icon. The adaptive foreground keeps the fox mark inside the 66dp safe region and leaves the outer mask/effects region available to the launcher.
- Apple receives one opaque, edge-to-edge 1024 pixel application icon source without a pre-applied rounded mask.

Web favicon, touch-icon, and sharing-image integration belongs to the consuming web ticket because its exact output policy is not fixed here. Product surfaces should consume files from `platform/` or derive additional outputs from a semantic master; they should never use an opaque generated filename or modify a master in place.

## Maintenance

Run `pnpm brand:generate` after an intentional source update, then commit the regenerated catalog and platform files. Run `pnpm brand:validate` to reject missing files, malformed PNGs, incorrect dimensions, changed checksums, unexpected alpha modes, or geometry drift. Root `pnpm check` includes the validator.

Lexync remains a working product name pending trademark, domain, and store clearance as recorded in `SPEC.md`.
