const remote = (process.env.STUB_REMOTE_ROWS ?? '').split(',').filter(Boolean);
const local = (process.env.STUB_LOCAL_ROWS ?? '').split(',').filter(Boolean);

if (process.env.STUB_EXIT_CODE && process.env.STUB_EXIT_CODE !== '0') {
  process.stderr.write('stub supabase failure\n');
  process.exit(Number(process.env.STUB_EXIT_CODE));
}

const versions = [...new Set([...local, ...remote])].sort();

if (process.env.STUB_FORMAT === 'table') {
  process.stdout.write('Connecting to remote database...\n');
  process.stdout.write('        LOCAL      │     REMOTE     │     TIME (UTC)\n');
  process.stdout.write('  ─────────────────┼────────────────┼──────────────────────\n');
  for (const version of versions) {
    const localCell = local.includes(version) ? ` ${version} ` : ' '.repeat(17);
    const remoteCell = remote.includes(version) ? ` ${version} ` : ' '.repeat(16);
    process.stdout.write(`  ${localCell}│${remoteCell}│  2026-01-01 00:00:00\n`);
  }
} else {
  process.stdout.write('Connecting to remote database...\n');
  process.stdout.write(`${JSON.stringify({
    migrations: versions.map((version) => ({
      local: local.includes(version) ? version : '',
      remote: remote.includes(version) ? version : '',
      time: '2026-01-01 00:00:00',
    })),
    message: 'Migrations listed',
  })}\n`);
}

process.stdout.write('A new version of Supabase CLI is available: v3.0.0 (currently installed v2.115.0)\n');
