'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { LibraryEntry } from '../lib/libraryStore';

const AUDIO_BUCKET = 'vocabulary-audio-clips';

function recordingMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const candidate of ['audio/webm', 'audio/ogg', 'audio/mp4']) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return '';
}

function clipExtension(mimeType: string) {
  if (mimeType.startsWith('audio/ogg')) return 'ogg';
  if (mimeType.startsWith('audio/mp4')) return 'm4a';
  return 'webm';
}

function useClipUrl(path: string | null) {
  const [url, setUrl] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!path) {
        if (!cancelled) setUrl('');
        return;
      }
      const { data } = await supabase.storage.from(AUDIO_BUCKET).createSignedUrl(path, 3600);
      if (!cancelled) setUrl(data?.signedUrl ?? '');
    })();
    return () => {
      cancelled = true;
    };
  }, [path]);

  return url;
}

export function VocabularyAudioClipPlayer({ entry }: { entry: LibraryEntry }) {
  const url = useClipUrl(entry.audioClipPath);
  if (!entry.audioClipPath || !url) return null;
  return <audio className="vocabulary-audio-clip" data-ui="vocabulary-audio-clip" controls preload="none" src={url} aria-label={`Pronunciation of ${entry.expression}`} />;
}

export function VocabularyAudioClipRecorder({ entry, languageId, online, onChanged }: { entry: LibraryEntry; languageId: string; online: boolean; onChanged: () => void }) {
  const [recording, setRecording] = useState(false);
  const [preview, setPreview] = useState<{ blob: Blob; durationMs: number; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
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

  async function startRecording() {
    setNotice('');
    const mimeType = recordingMimeType();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setNotice('Lexync could not use your microphone. You can still edit and save this word.');
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

  function stopRecording() {
    recorder.current?.stop();
    recorder.current = null;
  }

  async function keepRecording() {
    if (!preview) return;
    setBusy(true);
    setNotice('');
    const extension = clipExtension(preview.blob.type);
    const path = `${await currentLearnerId()}/${languageId}/${entry.learningVocabularyEntryId}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from(AUDIO_BUCKET).upload(path, preview.blob, { contentType: preview.blob.type });
    if (uploadError) {
      setBusy(false);
      setNotice('That recording could not be saved. Try again.');
      return;
    }
    const previousPath = entry.audioClipPath;
    const { error } = await supabase.rpc('set_vocabulary_entry_audio_clip', {
      p_audio_clip_duration_ms: preview.durationMs,
      p_audio_clip_path: path,
      p_learning_vocabulary_entry_id: entry.learningVocabularyEntryId,
    });
    if (error) {
      await supabase.storage.from(AUDIO_BUCKET).remove([path]);
      setBusy(false);
      setNotice('That recording could not be saved. Try again.');
      return;
    }
    if (previousPath && previousPath !== path) await supabase.storage.from(AUDIO_BUCKET).remove([previousPath]);
    URL.revokeObjectURL(preview.url);
    setPreview(null);
    setBusy(false);
    onChanged();
  }

  async function removeRecording() {
    if (!entry.audioClipPath) return;
    setBusy(true);
    setNotice('');
    const { error } = await supabase.rpc('set_vocabulary_entry_audio_clip', {
      p_audio_clip_duration_ms: null,
      p_audio_clip_path: null,
      p_learning_vocabulary_entry_id: entry.learningVocabularyEntryId,
    });
    if (error) {
      setBusy(false);
      setNotice('That recording could not be removed. Try again.');
      return;
    }
    await supabase.storage.from(AUDIO_BUCKET).remove([entry.audioClipPath]);
    setBusy(false);
    onChanged();
  }

  function discardPreview() {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
  }

  return <fieldset className="vocabulary-audio-editor">
    <legend>Audio Clip</legend>
    {!supported && <p className="vocabulary-audio-note">This browser cannot record audio, so this word has no pronunciation yet. Everything else here still works.</p>}
    {supported && !online && <p className="vocabulary-audio-note">Recording a pronunciation needs a connection. Everything else here still works.</p>}
    {!preview && <VocabularyAudioClipPlayer entry={entry} />}
    {preview && <audio className="vocabulary-audio-clip" data-ui="vocabulary-audio-clip-preview" controls preload="none" src={preview.url} aria-label="Recording to listen back to" />}
    <div className="vocabulary-audio-actions">
      {preview
        ? <>
          <button className="secondary-button" type="button" disabled={busy} onClick={() => void keepRecording()}>{busy ? 'Saving…' : 'Keep recording'}</button>
          <button className="text-button" type="button" disabled={busy} onClick={discardPreview}>Discard recording</button>
        </>
        : recording
          ? <button className="secondary-button" type="button" onClick={stopRecording}>Stop recording</button>
          : <button className="secondary-button" type="button" disabled={!supported || !online || busy} onClick={() => void startRecording()}>{entry.audioClipPath ? 'Replace recording' : 'Record pronunciation'}</button>}
      {entry.audioClipPath && !preview && !recording && <button className="text-button danger" type="button" disabled={busy || !online} onClick={() => void removeRecording()}>Remove recording</button>}
    </div>
    {notice && <p className="vocabulary-audio-note" role="status">{notice}</p>}
  </fieldset>;
}

async function currentLearnerId() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? '';
}
