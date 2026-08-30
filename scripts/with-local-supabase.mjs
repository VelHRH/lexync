import { spawn, spawnSync } from 'node:child_process';

const status = spawnSync('pnpm', ['dlx', 'supabase@2.115.0', 'status', '-o', 'env'], {
  encoding: 'utf8',
});

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

const [command, ...args] = process.argv.slice(2);

if (!command) {
  throw new Error('A command is required.');
}

const child = spawn(command, args, {
  env: {
    ...process.env,
    LEXYNC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
    LEXYNC_SUPABASE_URL: values.API_URL,
    WXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
    WXT_PUBLIC_SUPABASE_URL: values.API_URL,
    WXT_PUBLIC_WEB_URL: 'http://127.0.0.1:3000',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
    NEXT_PUBLIC_SUPABASE_URL: values.API_URL,
  },
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 1);
  }
});
