import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const SUPABASE_CLI = 'pnpm dlx supabase@2.115.0';

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function parseArguments(argumentsList) {
  const options = { migrations: 'supabase/migrations' };

  for (let index = 0; index < argumentsList.length; index += 2) {
    const flag = argumentsList[index];
    const value = argumentsList[index + 1];

    if (flag !== '--migrations' || value === undefined || value.startsWith('--')) {
      fail(`Invalid argument: ${flag ?? ''}`);
    }

    options.migrations = value;
  }

  return options;
}

function reportedMigrations(text) {
  for (const line of text.split('\n')) {
    if (!line.trimStart().startsWith('{')) continue;
    try {
      const parsed = JSON.parse(line);
      if (Array.isArray(parsed?.migrations)) return parsed.migrations;
    } catch {
      continue;
    }
  }

  const rows = text
    .split('\n')
    .map((line) => line.split(/[│|]/))
    .filter((cells) => cells.length >= 3)
    .map((cells) => cells.map((cell) => cell.match(/\b(\d{14})\b/)?.[1] ?? ''))
    .filter((cells) => cells[0] || cells[1]);

  if (!rows.length) return null;

  return rows.map((cells) => ({ local: cells[0], remote: cells[1] }));
}

function appliedVersions(migrations) {
  return migrations
    .map((migration) => (typeof migration?.remote === 'string' ? migration.remote.trim() : ''))
    .filter((version) => /^\d{14}$/.test(version));
}

const options = parseArguments(process.argv.slice(2));

if (!process.env.SUPABASE_ACCESS_TOKEN) {
  fail('SUPABASE_ACCESS_TOKEN is required to read the linked project migration history. See docs/database-migrations.md.');
}

if (!process.env.SUPABASE_PROJECT_REF) {
  fail('SUPABASE_PROJECT_REF is required to read the linked project migration history. See docs/database-migrations.md.');
}

const linkedRef = await readFile(process.env.LEXYNC_LINKED_REF_FILE ?? 'supabase/.temp/project-ref', 'utf8').then((value) => value.trim()).catch(() => '');

if (linkedRef && linkedRef !== process.env.SUPABASE_PROJECT_REF) {
  fail(`This checkout is linked to ${linkedRef} but SUPABASE_PROJECT_REF names ${process.env.SUPABASE_PROJECT_REF}. Link the project you mean to verify. See docs/database-migrations.md.`);
}

let local;

try {
  local = (await readdir(options.migrations))
    .map((entry) => entry.match(/^(\d{14})_.*\.sql$/))
    .filter((match) => match)
    .map((match) => match[1])
    .sort();
} catch (error) {
  fail(`Unable to read ${options.migrations}: ${error.message}`);
}

if (!local.length) {
  fail(`No migrations were found in ${options.migrations}.`);
}

const [command, ...commandArguments] = (process.env.LEXYNC_SUPABASE_COMMAND ?? SUPABASE_CLI).split(' ');
const history = spawnSync(command, [...commandArguments, 'migration', 'list', '--linked'], {
  encoding: 'utf8',
  env: { ...process.env, SUPABASE_YES: '1' },
});

if (history.status !== 0) {
  process.stderr.write(history.stderr ?? '');
  fail(`Unable to read the linked project migration history for ${process.env.SUPABASE_PROJECT_REF}.`);
}

const reported = reportedMigrations(history.stdout);

if (!reported) {
  fail(`Unable to read the linked project migration history for ${process.env.SUPABASE_PROJECT_REF}: the Supabase CLI reported no migration rows in a recognized format.`);
}

const remote = appliedVersions(reported);
const pending = local.filter((version) => !remote.includes(version));
const unknown = remote.filter((version) => !local.includes(version));

if (unknown.length) {
  fail(`The linked project holds ${unknown.length} migration(s) this repository does not carry: ${unknown.join(', ')}. Reconcile the history before pushing. See docs/database-migrations.md.`);
}

if (pending.length) {
  fail(`The linked project is behind ${options.migrations} by ${pending.length} pending migration(s): ${pending.join(', ')}. Push them through the Push database migrations workflow. See docs/database-migrations.md.`);
}

process.stdout.write(`The linked project ${process.env.SUPABASE_PROJECT_REF} holds all ${local.length} migrations in ${options.migrations}.\n`);
