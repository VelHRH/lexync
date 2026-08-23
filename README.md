# Lexync

Lexync is a private language-learning system for deliberate capture in a Chromium extension and offline practice on iPhone.

## Requirements

- Node.js 22
- pnpm 10.30.3
- Docker

## Workspace commands

```sh
pnpm install
pnpm check
pnpm test
pnpm build
```

Run the web application locally with `pnpm dev`.

## Local backend and extension

Start Supabase and apply all migrations with:

```sh
pnpm backend:start
pnpm backend:reset
```

Run the WXT extension in development with `pnpm dev:extension`. Copy `.env.example` to `.env.local` and provide the Supabase URL, browser-safe publishable key, and web URL. Secret and service-role keys must never use a `WXT_PUBLIC_` variable.

`pnpm test` starts and resets the local Supabase project, runs the focused ownership-policy tests, builds every JavaScript/TypeScript workspace, and runs Playwright. Stop the local services with `pnpm backend:stop` when they are no longer needed.

## Sign in with Apple smoke test

The deterministic suite establishes authenticated test Learners against local Supabase. Live Apple authentication is a separate smoke check because it requires configured Apple and Supabase OAuth credentials.

Use a dedicated Chromium profile already authenticated to the test Apple account, configure Apple as the Supabase provider, allow the web `/auth/callback` URL, then run:

```sh
LEXYNC_APPLE_SMOKE=true \
LEXYNC_APPLE_PROFILE_PATH=/path/to/test-profile \
LEXYNC_APPLE_LEARNER_EMAIL=learner@example.test \
pnpm test
```
