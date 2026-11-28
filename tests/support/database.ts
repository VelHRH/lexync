import { spawnSync } from 'node:child_process';

export function linkExampleToSense(exampleId: string, senseId: string) {
  const databaseUrl = process.env.LEXYNC_SUPABASE_DB_URL;
  if (!databaseUrl) throw new Error('LEXYNC_SUPABASE_DB_URL is required.');
  const result = spawnSync('psql', [
    databaseUrl,
    '--no-psqlrc',
    '--quiet',
    '--set', 'ON_ERROR_STOP=1',
    '--set', `example_id=${exampleId}`,
    '--set', `sense_id=${senseId}`,
  ], {
    encoding: 'utf8',
    input: `insert into public.sense_examples (learner_id, sense_id, example_id)
select senses.learner_id, senses.id, :'example_id'::uuid
from public.senses
where senses.id = :'sense_id'::uuid;
`,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || 'The Example could not be linked to the Sense.');
}
