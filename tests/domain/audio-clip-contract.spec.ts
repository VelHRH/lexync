import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { audioClipMetadataFailure, audioClipPath, audioClipRemovalFailure, audioClipUploadFailure } from '../../apps/web/lib/audioClip';

const learnerId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const languageId = 'a1000000-0000-0000-0000-000000000001';
const entryId = 'a3000000-0000-0000-0000-000000000001';

async function audioClipMigration() {
  return readFile('supabase/migrations/20261026120000_vocabulary_audio_clips.sql', 'utf8');
}

test.describe('Audio Clip storage contract', () => {
  test('the path a Learner uploads under is the path the Vocabulary Entry accepts', async () => {
    const migration = await audioClipMigration();

    expect(migration).toContain("audio_clip_path like learner_id::text || '/' || learning_language_id::text || '/' || id::text || '/%'");

    const path = audioClipPath({ clipId: 'clip', entryId, languageId, learnerId, mimeType: 'audio/webm' });

    expect(path.split('/').slice(0, 3)).toEqual([learnerId, languageId, entryId]);
    expect(path).toBe(`${learnerId}/${languageId}/${entryId}/clip.webm`);
  });

  test('the storage policies read the Learner, Learning Language and Vocabulary Entry from the same positions', async () => {
    const migration = await audioClipMigration();
    const segments = audioClipPath({ clipId: 'clip', entryId, languageId, learnerId, mimeType: 'audio/webm' }).split('/');

    expect(migration).toContain("(storage.foldername(name))[1] = (select auth.uid()::text)");
    expect(migration).toContain("where id::text = (storage.foldername(name))[3]");
    expect(migration).toContain("and learning_language_id::text = (storage.foldername(name))[2]");

    expect(segments[0]).toBe(learnerId);
    expect(segments[1]).toBe(languageId);
    expect(segments[2]).toBe(entryId);
    expect(segments).toHaveLength(4);
  });

  test('every recordable media type lands on a media type the bucket allows', async () => {
    const migration = await audioClipMigration();

    for (const mimeType of ['audio/webm', 'audio/ogg', 'audio/mp4']) {
      expect(migration).toContain(`'${mimeType}'`);
      expect(audioClipPath({ clipId: 'clip', entryId, languageId, learnerId, mimeType })).toMatch(/\.(webm|ogg|m4a)$/);
    }
  });
});

test.describe('Audio Clip failures a Learner can act on', () => {
  test('a storage bucket the deployed project never received is named as such', () => {
    const failure = audioClipUploadFailure({ message: 'Bucket not found', status: 404 });

    expect(failure.reason).toBe('storage-missing');
    expect(failure.notice).toContain('cannot store pronunciations yet');
  });

  test('a write contract the deployed project never received is named as such', () => {
    const failure = audioClipMetadataFailure({ code: 'PGRST202', message: 'Could not find the function public.set_vocabulary_entry_audio_clip(...) in the schema cache' });

    expect(failure.reason).toBe('contract-missing');
    expect(failure.notice).toContain('cannot keep pronunciations yet');
  });

  test('a missing Audio Clip column is read as the same missing contract', () => {
    expect(audioClipMetadataFailure({ code: '42703', message: 'column "audio_clip_path" does not exist' }).reason).toBe('contract-missing');
  });

  test('a refused write is told apart from a server that cannot keep recordings', () => {
    expect(audioClipUploadFailure({ message: 'new row violates row-level security policy', status: 403 }).reason).toBe('not-permitted');
    expect(audioClipMetadataFailure({ code: '42501', message: 'permission denied for function set_vocabulary_entry_audio_clip' }).reason).toBe('not-permitted');
  });

  test('an ordinary failure stays an ordinary failure the Learner can retry', () => {
    const upload = audioClipUploadFailure({ message: 'Failed to fetch' });
    const metadata = audioClipMetadataFailure({ message: 'Failed to fetch' });

    expect(upload.reason).toBe('upload-failed');
    expect(upload.notice).toBe('That recording could not be saved. Try again.');
    expect(metadata.reason).toBe('metadata-failed');
    expect(metadata.notice).toContain('Try again.');
  });

  test('a recording that cannot be removed says so, and still names a server that cannot keep pronunciations', () => {
    const ordinary = audioClipRemovalFailure({ message: 'Failed to fetch' });

    expect(ordinary.reason).toBe('removal-failed');
    expect(ordinary.notice).toBe('That recording could not be removed. Try again.');
    expect(audioClipRemovalFailure({ code: 'PGRST202', message: 'Could not find the function' }).reason).toBe('contract-missing');
    expect(audioClipRemovalFailure({ code: '42501', message: 'permission denied' }).reason).toBe('not-permitted');
  });

  test('each distinct reason carries its own sentence, and a refusal reads the same from either step', () => {
    const failures = [
      audioClipUploadFailure({ message: 'Bucket not found', status: 404 }),
      audioClipUploadFailure({ message: 'Failed to fetch' }),
      audioClipMetadataFailure({ code: 'PGRST202', message: 'Could not find the function' }),
      audioClipMetadataFailure({ message: 'Failed to fetch' }),
      audioClipUploadFailure({ message: 'new row violates row-level security policy', status: 403 }),
    ];

    expect(new Set(failures.map((failure) => failure.reason)).size).toBe(failures.length);
    expect(new Set(failures.map((failure) => failure.notice)).size).toBe(failures.length);
    expect(audioClipMetadataFailure({ code: '42501', message: 'permission denied' }).notice)
      .toBe(audioClipUploadFailure({ message: 'new row violates row-level security policy', status: 403 }).notice);
  });
});
