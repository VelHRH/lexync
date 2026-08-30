import { spawnSync } from 'node:child_process';

function run(command, args, environment = process.env) {
  const result = spawnSync(command, args, { env: environment, stdio: 'inherit' });

  if (result.signal) {
    process.kill(process.pid, result.signal);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const status = spawnSync('pnpm', ['dlx', 'supabase@2.115.0', 'status', '-o', 'env'], { encoding: 'utf8' });

if (status.status !== 0) {
  process.stderr.write(status.stderr);
  process.exit(status.status ?? 1);
}

const values = Object.fromEntries(
  status.stdout
    .split('\n')
    .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
    .filter((match) => match)
    .map((match) => [match[1], match[2]]),
);
const publishableKey = values.PUBLISHABLE_KEY ?? values.ANON_KEY;

if (!values.API_URL || !publishableKey) {
  throw new Error('Local Supabase API_URL and publishable key are unavailable.');
}

const environment = {
  ...process.env,
  LEXYNC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
  LEXYNC_SUPABASE_URL: values.API_URL,
};

run(process.execPath, ['scripts/seed-android-test.mjs'], environment);
run('apps/android/gradlew', [
  '-p',
  'apps/android',
  ':app:connectedDebugAndroidTest',
  '-Plexync.supabase.url=http://10.0.2.2:54321',
  `-Plexync.supabase.publishableKey=${publishableKey}`,
  '-Pandroid.testInstrumentationRunnerArguments.lexyncTestEmail=android-learner@example.test',
  '-Pandroid.testInstrumentationRunnerArguments.lexyncTestPassword=Lexync-Android-test-37',
]);
