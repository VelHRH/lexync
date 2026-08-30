import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('artifacts/supabase');

await mkdir(output, { recursive: true });

const status = spawnSync('pnpm', ['dlx', 'supabase@2.115.0', 'status'], { encoding: 'utf8' });
await writeFile(path.join(output, 'status.txt'), `Supabase CLI status exit code: ${status.status ?? 1}\n`);

const containers = spawnSync('docker', ['ps', '--filter', 'name=supabase', '--format', '{{.Names}}'], {
  encoding: 'utf8',
});

for (const container of (containers.stdout ?? '').split('\n').filter(Boolean)) {
  const logs = spawnSync('docker', ['logs', container], { encoding: 'utf8' });
  await writeFile(path.join(output, `${container}.log`), `${logs.stdout ?? ''}${logs.stderr ?? ''}`);
}
