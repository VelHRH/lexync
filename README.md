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

## iPhone application

The native application requires Xcode 16.4 or newer, XcodeGen, and an iPhone running iOS 16 or newer. Generate the project on macOS with:

```sh
cd apps/ios
cp Config/Local.xcconfig.example Config/Local.xcconfig
xcodegen generate
open Lexync.xcodeproj
```

Set the hosted Supabase URL and browser-safe publishable key in `Config/Local.xcconfig`. Keep the `https:/$()/` form from the example because xcconfig files otherwise interpret `//` as the start of a comment. Apply the repository migrations to that Supabase project before launching the app.

In Xcode, select the `Lexync` target, choose your development team, connect the iPhone, and run the `Lexync` scheme. The app uses the same email and password credentials as the extension. A completed synchronization replaces the local SQLite library atomically; if the phone later loses connectivity or the app restarts, the last complete library remains readable.

The XCUITest fixture account must contain one Spanish-to-English Study Pair and one `caminar` Vocabulary Entry with the translations `to walk` and `to travel on foot`, plus the Example `Camino al trabajo cada mañana.`. Add `LEXYNC_TEST_EMAIL`, `LEXYNC_TEST_PASSWORD`, `LEXYNC_SUPABASE_URL`, and `LEXYNC_SUPABASE_PUBLISHABLE_KEY` to the Test action environment variables in the `Lexync` scheme, then run the `LexyncUITests` target on the connected iPhone. The later-snapshot scenario temporarily creates and removes its own uniquely named server record.
