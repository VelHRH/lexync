import { expect, test } from '@playwright/test';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const script = 'scripts/verify-deployed-migrations.mjs';

async function migrationsDirectory(versions: string[]) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lexync-migrations-'));
  for (const version of versions) {
    await writeFile(path.join(directory, `${version}_stub.sql`), 'select 1;\n');
  }
  return directory;
}

function verify({ directory, environment }: { directory: string; environment: Record<string, string | undefined> }) {
  const result = spawnSync('node', [script, '--migrations', directory], {
    encoding: 'utf8',
    env: {
      ...process.env,
      LEXYNC_SUPABASE_COMMAND: `node ${path.resolve('tests/support/stub-supabase.mjs')}`,
      LEXYNC_LINKED_REF_FILE: path.resolve('tests/support/stub-project-ref'),
      SUPABASE_ACCESS_TOKEN: 'stub-token',
      SUPABASE_PROJECT_REF: 'stubprojectref000000',
      ...environment,
    },
  });
  return { code: result.status, output: `${result.stdout}${result.stderr}` };
}

test.describe('deployed migration verification', () => {
  test('confirms the linked project holds every migration the repository carries', async () => {
    const directory = await migrationsDirectory(['20261026120000', '20261102120000']);
    const { code, output } = verify({
      directory,
      environment: { STUB_LOCAL_ROWS: '20261026120000,20261102120000', STUB_REMOTE_ROWS: '20261026120000,20261102120000' },
    });

    expect(output).toContain('2 migrations');
    expect(code).toBe(0);
  });

  test('names every migration the linked project never received and fails', async () => {
    const directory = await migrationsDirectory(['20261026120000', '20261029120000', '20261102120000']);
    const { code, output } = verify({
      directory,
      environment: { STUB_LOCAL_ROWS: '20261026120000,20261029120000,20261102120000', STUB_REMOTE_ROWS: '20261026120000' },
    });

    expect(output).toContain('20261029120000');
    expect(output).toContain('20261102120000');
    expect(output).not.toMatch(/pending[\s\S]*20261026120000/);
    expect(code).toBe(1);
  });

  test('fails when the linked project holds a migration the repository does not', async () => {
    const directory = await migrationsDirectory(['20261026120000']);
    const { code, output } = verify({
      directory,
      environment: { STUB_LOCAL_ROWS: '20261026120000', STUB_REMOTE_ROWS: '20261026120000,29991231120000' },
    });

    expect(output).toContain('29991231120000');
    expect(code).toBe(1);
  });

  test('reads the migration history in either format the Supabase CLI reports', async () => {
    const directory = await migrationsDirectory(['20261026120000', '20261102120000']);
    const environment = { STUB_LOCAL_ROWS: '20261026120000,20261102120000', STUB_REMOTE_ROWS: '20261026120000' };

    for (const format of ['json', 'table']) {
      const { code, output } = verify({ directory, environment: { ...environment, STUB_FORMAT: format } });

      expect(output, `${format} output must name the pending migration`).toContain('20261102120000');
      expect(code, `${format} output must fail`).toBe(1);
    }
  });

  test('fails closed when the Supabase CLI reports a history it cannot recognize', async () => {
    const directory = await migrationsDirectory(['20261026120000']);
    const { code, output } = verify({ directory, environment: { STUB_FORMAT: 'table', STUB_LOCAL_ROWS: '', STUB_REMOTE_ROWS: '' } });

    expect(output).toContain('recognized format');
    expect(code).toBe(1);
  });

  test('refuses to report on a project other than the one the checkout is linked to', async () => {
    const directory = await migrationsDirectory(['20261026120000']);
    const linked = path.join(directory, 'project-ref');
    await writeFile(linked, 'someotherprojectref\n');
    const { code, output } = verify({
      directory,
      environment: { LEXYNC_LINKED_REF_FILE: linked, STUB_LOCAL_ROWS: '20261026120000', STUB_REMOTE_ROWS: '20261026120000' },
    });

    expect(output).toContain('someotherprojectref');
    expect(code).toBe(1);
  });

  test('fails closed when the linked project is not configured', async () => {
    const directory = await migrationsDirectory(['20261026120000']);
    const missingToken = verify({ directory, environment: { SUPABASE_ACCESS_TOKEN: '' } });
    const missingRef = verify({ directory, environment: { SUPABASE_PROJECT_REF: '' } });

    expect(missingToken.output).toContain('SUPABASE_ACCESS_TOKEN');
    expect(missingToken.code).toBe(1);
    expect(missingRef.output).toContain('SUPABASE_PROJECT_REF');
    expect(missingRef.code).toBe(1);
  });

  test('fails closed when the Supabase CLI itself cannot report the history', async () => {
    const directory = await migrationsDirectory(['20261026120000']);
    const { code, output } = verify({ directory, environment: { STUB_EXIT_CODE: '1' } });

    expect(output).toContain('migration history');
    expect(code).toBe(1);
  });
});

test.describe('the single supported push path', () => {
  test('every Supabase CLI invocation in the repository is pinned to one version', async () => {
    const sources = await Promise.all([
      readFile('package.json', 'utf8'),
      readFile(script, 'utf8'),
      readFile('.github/workflows/database-migrations.yml', 'utf8'),
    ]);
    const versions = new Set(sources.flatMap((source) => [...source.matchAll(/supabase@(\d+\.\d+\.\d+)/g)].map((match) => match[1])));

    expect(versions.size).toBe(1);
  });

  test('pushing migrations runs through pnpm so the script is executable', async () => {
    const manifest = JSON.parse(await readFile('package.json', 'utf8')) as { scripts: Record<string, string> };

    for (const [name, command] of Object.entries(manifest.scripts)) {
      expect(command, `${name} must not call dlx without pnpm`).not.toMatch(/(^|&&\s*|\|\|\s*|;\s*)dlx\s/);
    }
    expect(manifest.scripts['db:push']).toMatch(/^pnpm dlx supabase@\d+\.\d+\.\d+ db push\b/);
    expect(manifest.scripts['db:verify']).toContain(script);
  });
});
