'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { LibraryEntry } from '../lib/libraryStore';
import { AUDIO_CLIP_BUCKET, audioClipMetadataFailure, audioClipPath, audioClipRemovalFailure, audioClipUploadFailure, type AudioClipFailure } from '../lib/audioClip';

function recordingMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const candidate of ['audio/webm', 'audio/ogg', 'audio/mp4']) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return '';
}

function clipLength(seconds: number) {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

async function signedClipUrl(path: string) {
  const { data } = await supabase.storage.from(AUDIO_CLIP_BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? '';
}

function AudioClipControl({ dataUi, durationMs, idleLabel, playingLabel, resolve }: { dataUi: string; durationMs: number | null; idleLabel: string; playingLabel: string; resolve: () => Promise<string> }) {
  const element = useRef<HTMLAudioElement | null>(null);
  const source = useRef('');
  const [playing, setPlaying] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [position, setPosition] = useState(0);
  const [length, setLength] = useState(durationMs && durationMs > 0 ? durationMs / 1000 : 0);

  async function toggle() {
    const audio = element.current;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      audio.currentTime = 0;
      setPosition(0);
      return;
    }
    setFailed(false);
    if (!source.current) {
      setPending(true);
      const resolved = await resolve();
      setPending(false);
      if (!resolved) {
        setFailed(true);
        return;
      }
      source.current = resolved;
      audio.src = resolved;
    }
    try {
      await audio.play();
    } catch {
      setFailed(true);
    }
  }

  const progress = length > 0 ? Math.min(1, position / length) : 0;

  return <span className="audio-clip" data-playing={playing ? 'true' : undefined}>
    <button
      className="audio-clip-control"
      type="button"
      style={{ ['--audio-clip-progress' as string]: progress }}
      aria-label={playing ? playingLabel : idleLabel}
      disabled={pending}
      onClick={(event) => { event.preventDefault(); void toggle(); }}
    >
      <span className="audio-clip-glyph" aria-hidden="true">
        <svg viewBox="0 0 16 16" focusable="false">{playing ? <path d="M4.5 3h2.4v10H4.5zm4.6 0h2.4v10H9.1z" /> : <path d="M5.2 3.2 12.6 8l-7.4 4.8z" />}</svg>
      </span>
      {length > 0 && <span className="audio-clip-length">{clipLength(playing ? position : length)}</span>}
    </button>
    {failed && <span className="audio-clip-note" role="status">Pronunciation unavailable</span>}
    <audio
      ref={element}
      data-ui={dataUi}
      preload="none"
      onPlay={() => setPlaying(true)}
      onPause={() => setPlaying(false)}
      onEnded={() => { setPlaying(false); setPosition(0); }}
      onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
      onLoadedMetadata={(event) => { if (Number.isFinite(event.currentTarget.duration)) setLength(event.currentTarget.duration); }}
      onError={() => { setFailed(true); setPlaying(false); }}
    />
  </span>;
}

export function AudioClipPlayer({ dataUi, durationMs, expression, path }: { dataUi: string; durationMs: number | null; expression: string; path: string }) {
  return <AudioClipControl
    key={path}
    dataUi={dataUi}
    durationMs={durationMs}
    idleLabel={`Play the pronunciation of ${expression}`}
    playingLabel={`Stop the pronunciation of ${expression}`}
    resolve={() => signedClipUrl(path)}
  />;
}

export function VocabularyAudioClipPlayer({ entry }: { entry: LibraryEntry }) {
  if (!entry.audioClipPath) return null;
  return <AudioClipPlayer dataUi="vocabulary-audio-clip" durationMs={entry.audioClipDurationMs} expression={entry.expression} path={entry.audioClipPath} />;
}

export type AudioClipRecording = { blob: Blob; durationMs: number; url: string };

export function useAudioClipRecorder({ declinedNotice }: { declinedNotice: string }) {
  const [recording, setRecording] = useState(false);
  const [preview, setPreview] = useState<AudioClipRecording | null>(null);
  const [notice, setNotice] = useState('');
  const recorder = useRef<MediaRecorder | null>(null);
  const microphone = useRef<MediaStream | null>(null);
  const startedAt = useRef(0);
  const supported = typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && Boolean(recordingMimeType());

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview.url);
  }, [preview]);

  useEffect(() => () => {
    const active = recorder.current;
    recorder.current = null;
    if (active && active.state !== 'inactive') {
      active.onstop = null;
      active.stop();
    }
    for (const track of microphone.current?.getTracks() ?? []) track.stop();
    microphone.current = null;
  }, []);

  async function start() {
    setNotice('');
    const mimeType = recordingMimeType();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setNotice(declinedNotice);
      return;
    }
    microphone.current = stream;
    const chunks: Blob[] = [];
    const active = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorder.current = active;
    startedAt.current = Date.now();
    active.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    active.onstop = () => {
      for (const track of stream.getTracks()) track.stop();
      microphone.current = null;
      const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
      setPreview({ blob, durationMs: Math.max(1, Date.now() - startedAt.current), url: URL.createObjectURL(blob) });
      setRecording(false);
    };
    active.start();
    setRecording(true);
  }

  function stop() {
    recorder.current?.stop();
    recorder.current = null;
  }

  function discard() {
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
  }

  return { discard, notice, preview, recording, setNotice, start, stop, supported };
}

export type AudioClipRecorder = ReturnType<typeof useAudioClipRecorder>;

export async function currentAudioClipPath(entryId: string): Promise<{ path: string | null } | { failure: AudioClipFailure }> {
  const { data, error } = await supabase.from('learning_vocabulary_entries').select('audio_clip_path').eq('id', entryId).maybeSingle();
  if (error) {
    const failure = audioClipMetadataFailure(error);
    console.error(`Audio Clip lookup failed (${failure.reason}) for Vocabulary Entry ${entryId}`, error);
    return { failure };
  }
  return { path: typeof data?.audio_clip_path === 'string' ? data.audio_clip_path : null };
}

export async function storeAudioClip({ durationMs, entryId, file, languageId, previousPath }: { durationMs: number; entryId: string; file: Blob; languageId: string; previousPath: string | null }): Promise<AudioClipFailure | null> {
  const path = audioClipPath({
    clipId: crypto.randomUUID(),
    entryId,
    languageId,
    learnerId: await currentLearnerId(),
    mimeType: file.type,
  });
  const { error: uploadError } = await supabase.storage.from(AUDIO_CLIP_BUCKET).upload(path, file, { contentType: file.type });
  if (uploadError) {
    const failure = audioClipUploadFailure(uploadError);
    console.error(`Audio Clip upload failed (${failure.reason}) for ${AUDIO_CLIP_BUCKET}/${path}`, uploadError);
    return failure;
  }
  const { error } = await supabase.rpc('set_vocabulary_entry_audio_clip', {
    p_audio_clip_duration_ms: durationMs,
    p_audio_clip_path: path,
    p_learning_vocabulary_entry_id: entryId,
  });
  if (error) {
    const failure = audioClipMetadataFailure(error);
    console.error(`Audio Clip metadata write failed (${failure.reason}) through set_vocabulary_entry_audio_clip`, error);
    await supabase.storage.from(AUDIO_CLIP_BUCKET).remove([path]);
    return failure;
  }
  if (previousPath && previousPath !== path) await supabase.storage.from(AUDIO_CLIP_BUCKET).remove([previousPath]);
  return null;
}

export function VocabularyCaptureAudioRecorder({ busy, online, recorder }: { busy: boolean; online: boolean; recorder: AudioClipRecorder }) {
  const preview = recorder.preview;
  const unavailable = !recorder.supported
    ? 'This browser cannot record audio, so this word saves without a pronunciation. Everything else here still works.'
    : !online
      ? 'Recording a pronunciation needs a connection. Everything else here still works.'
      : '';

  return <fieldset className="vocabulary-audio-editor">
    <legend>Audio Clip</legend>
    <div className="vocabulary-audio-row">
      {recorder.recording
        ? <span className="audio-clip-recording" role="status"><span className="audio-clip-recording-dot" aria-hidden="true" />Recording</span>
        : preview
          ? <AudioClipControl
            key={preview.url}
            dataUi="vocabulary-audio-clip-preview"
            durationMs={preview.durationMs}
            idleLabel="Play the recording to listen back"
            playingLabel="Stop the recording"
            resolve={async () => preview.url}
          />
          : <span className="vocabulary-audio-empty">No pronunciation yet</span>}
      <div className="vocabulary-audio-actions">
        {recorder.recording
          ? <button className="secondary-button" type="button" onClick={() => recorder.stop()}>Stop recording</button>
          : <button className="secondary-button" type="button" disabled={!recorder.supported || !online || busy} onClick={() => void recorder.start()}>{preview ? 'Replace recording' : 'Record pronunciation'}</button>}
        {preview && !recorder.recording && <button className="inline-button" type="button" disabled={busy} onClick={() => recorder.discard()}>Discard recording</button>}
      </div>
    </div>
    {preview && !recorder.recording && <p className="vocabulary-audio-note">This recording is kept with the word when you save it.</p>}
    {unavailable && <p className="vocabulary-audio-note">{unavailable}</p>}
    {recorder.notice && <p className="vocabulary-audio-note" role="status">{recorder.notice}</p>}
  </fieldset>;
}

export function VocabularyAudioClipRecorder({ entry, languageId, online, onChanged }: { entry: LibraryEntry; languageId: string; online: boolean; onChanged: () => void }) {
  const recorder = useAudioClipRecorder({ declinedNotice: 'Lexync could not use your microphone. You can still edit and save this word.' });
  const [busy, setBusy] = useState(false);
  const preview = recorder.preview;

  async function keepRecording() {
    if (!preview) return;
    setBusy(true);
    recorder.setNotice('');
    const failure = await storeAudioClip({
      durationMs: preview.durationMs,
      entryId: entry.learningVocabularyEntryId,
      file: preview.blob,
      languageId,
      previousPath: entry.audioClipPath,
    });
    setBusy(false);
    if (failure) {
      recorder.setNotice(failure.notice);
      return;
    }
    recorder.discard();
    onChanged();
  }

  async function removeRecording() {
    if (!entry.audioClipPath) return;
    setBusy(true);
    recorder.setNotice('');
    const { error } = await supabase.rpc('set_vocabulary_entry_audio_clip', {
      p_audio_clip_duration_ms: null,
      p_audio_clip_path: null,
      p_learning_vocabulary_entry_id: entry.learningVocabularyEntryId,
    });
    if (error) {
      const failure = audioClipRemovalFailure(error);
      console.error(`Audio Clip removal failed (${failure.reason}) through set_vocabulary_entry_audio_clip`, error);
      setBusy(false);
      recorder.setNotice(failure.notice);
      return;
    }
    await supabase.storage.from(AUDIO_CLIP_BUCKET).remove([entry.audioClipPath]);
    setBusy(false);
    onChanged();
  }

  const unavailable = !recorder.supported
    ? 'This browser cannot record audio, so this word has no pronunciation yet. Everything else here still works.'
    : !online
      ? 'Recording a pronunciation needs a connection. Everything else here still works.'
      : '';

  return <fieldset className="vocabulary-audio-editor">
    <legend>Audio Clip</legend>
    <div className="vocabulary-audio-row">
      {recorder.recording
        ? <span className="audio-clip-recording" role="status"><span className="audio-clip-recording-dot" aria-hidden="true" />Recording</span>
        : preview
          ? <AudioClipControl
            key={preview.url}
            dataUi="vocabulary-audio-clip-preview"
            durationMs={preview.durationMs}
            idleLabel="Play the recording to listen back"
            playingLabel="Stop the recording"
            resolve={async () => preview.url}
          />
          : entry.audioClipPath
            ? <VocabularyAudioClipPlayer entry={entry} />
            : <span className="vocabulary-audio-empty">No pronunciation yet</span>}
      <div className="vocabulary-audio-actions">
        {preview
          ? <>
            <button className="secondary-button" type="button" disabled={busy} onClick={() => void keepRecording()}>{busy ? 'Saving…' : 'Keep recording'}</button>
            <button className="inline-button" type="button" disabled={busy} onClick={() => recorder.discard()}>Discard recording</button>
          </>
          : recorder.recording
            ? <button className="secondary-button" type="button" onClick={() => recorder.stop()}>Stop recording</button>
            : <button className="secondary-button" type="button" disabled={!recorder.supported || !online || busy} onClick={() => void recorder.start()}>{entry.audioClipPath ? 'Replace recording' : 'Record pronunciation'}</button>}
        {entry.audioClipPath && !preview && !recorder.recording && <button className="inline-button danger" type="button" disabled={busy || !online} onClick={() => void removeRecording()}>Remove recording</button>}
      </div>
    </div>
    {unavailable && <p className="vocabulary-audio-note">{unavailable}</p>}
    {recorder.notice && <p className="vocabulary-audio-note" role="status">{recorder.notice}</p>}
  </fieldset>;
}

async function currentLearnerId() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? '';
}
