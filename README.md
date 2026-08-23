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

## Email and password authentication

The extension supports account creation, email and password sign-in, email confirmation, and password recovery through Supabase Auth. No external OAuth provider credentials are required.

Local Supabase disables email confirmation so deterministic tests can create authenticated Learners immediately. In a hosted project, enable email confirmation and add the web callback URL to the allowed Auth redirect URLs:

```text
https://your-web-host/auth/callback
```

Configure a production SMTP provider before sending confirmation and password recovery emails to real users.
