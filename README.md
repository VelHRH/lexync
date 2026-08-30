# Lexync

Lexync is a private language-learning system for deliberate capture in a Chromium extension and offline practice on Android.

## Requirements

- Node.js 22.20.0
- pnpm 10.30.3
- Docker
- JDK 17
- Android SDK 36

## Workspace commands

```sh
pnpm install
pnpm check
pnpm test
pnpm build
pnpm android:test
pnpm android:build
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

## Android

The native Kotlin and Jetpack Compose application is in `apps/android`. Configure its browser-safe Supabase connection in `~/.gradle/gradle.properties`:

```properties
lexync.supabase.url=https://your-project.supabase.co
lexync.supabase.publishableKey=your-publishable-key
```

For the local Supabase stack, use `http://10.0.2.2:54321` from the Android emulator and the publishable key printed by `pnpm backend:start`. Never configure a secret or service-role key in the Android build.

Build the debug APK with `pnpm android:build`. Run the JVM contract tests with `pnpm android:test`. Seed the local acceptance account with `pnpm android:seed`. With an emulator running, compile and run the Room and Compose journeys with:

```sh
cd apps/android
./gradlew connectedDebugAndroidTest \
  -Plexync.supabase.url=http://10.0.2.2:54321 \
  -Plexync.supabase.publishableKey=your-local-publishable-key \
  -Pandroid.testInstrumentationRunnerArguments.lexyncTestEmail=android-learner@example.test \
  -Pandroid.testInstrumentationRunnerArguments.lexyncTestPassword=Lexync-Android-test-37
```

The synchronized library is replaced in one Room transaction and remains available after an offline restart. Failed or invalid snapshots leave the previous complete library intact.

## Continuous integration

Pull requests and updates to `main` run the JavaScript, browser, Supabase, and Android validation lanes. Successful runs retain the deterministic Chromium extension ZIP and installable Android debug APK. Failed runs retain the available Playwright, emulator, and local Supabase diagnostics. The stable required check is `CI / Aggregate`.

The iPhone requirements remain in `SPEC.md`, but iPhone delivery is paused. Xcode builds and XCUITest do not run in continuous integration and do not block pull requests until that roadmap resumes.
