export const AUDIO_CLIP_BUCKET = 'vocabulary-audio-clips';

export function audioClipExtension(mimeType: string) {
  if (mimeType.startsWith('audio/ogg')) return 'ogg';
  if (mimeType.startsWith('audio/mp4')) return 'm4a';
  return 'webm';
}

export function audioClipPath({ clipId, entryId, languageId, learnerId, mimeType }: { clipId: string; entryId: string; languageId: string; learnerId: string; mimeType: string }) {
  return `${learnerId}/${languageId}/${entryId}/${clipId}.${audioClipExtension(mimeType)}`;
}

export type AudioClipFailureReason = 'storage-missing' | 'not-permitted' | 'upload-failed' | 'contract-missing' | 'metadata-failed';

export type AudioClipFailure = { notice: string; reason: AudioClipFailureReason };

const notices: Record<AudioClipFailureReason, string> = {
  'contract-missing': 'This server cannot keep pronunciations yet, so the recording was not saved. Everything else here still works.',
  'metadata-failed': 'That recording was stored but could not be attached to this word. Try again.',
  'not-permitted': 'Lexync was not allowed to save that recording. Sign in again and try once more.',
  'storage-missing': 'This server cannot store pronunciations yet, so the recording was not saved. Everything else here still works.',
  'upload-failed': 'That recording could not be saved. Try again.',
};

function failure(reason: AudioClipFailureReason): AudioClipFailure {
  return { notice: notices[reason], reason };
}

function errorText(error: unknown) {
  const source = error as { code?: unknown; message?: unknown } | null;
  return `${typeof source?.code === 'string' ? source.code : ''} ${typeof source?.message === 'string' ? source.message : ''}`.toLowerCase();
}

function errorStatus(error: unknown) {
  const source = error as { status?: unknown; statusCode?: unknown } | null;
  if (typeof source?.status === 'number') return source.status;
  return Number(source?.statusCode ?? NaN);
}

function refused(text: string, status: number) {
  return status === 401 || status === 403 || text.includes('42501') || text.includes('permission denied') || text.includes('row-level security');
}

export function audioClipUploadFailure(error: unknown): AudioClipFailure {
  const text = errorText(error);
  if (text.includes('bucket not found')) return failure('storage-missing');
  if (refused(text, errorStatus(error))) return failure('not-permitted');
  return failure('upload-failed');
}

export function audioClipMetadataFailure(error: unknown): AudioClipFailure {
  const text = errorText(error);
  if (text.includes('pgrst202') || text.includes('could not find the function') || text.includes('42703') || text.includes('does not exist')) return failure('contract-missing');
  if (refused(text, errorStatus(error))) return failure('not-permitted');
  return failure('metadata-failed');
}
