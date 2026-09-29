'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { supabase } from '../lib/supabase';

type MaterialStatus = 'processing' | 'ready';
type LearningMaterial = { id: string; fileName: string; status: MaterialStatus; createdAt: string };
type LearningMaterialRow = { id: string; file_name: string; status: string; created_at: string };
type UploadResponse = { material?: { id: string; fileName: string; status: string; createdAt: string }; error?: unknown };

class ProductUploadError extends Error {}

function toLearningMaterial(row: LearningMaterialRow): LearningMaterial | null {
  if (row.status !== 'processing' && row.status !== 'ready') return null;
  return { id: row.id, fileName: row.file_name, status: row.status, createdAt: row.created_at };
}

export function LearningMaterials({ accessToken, learningLanguageId }: { accessToken: string; learningLanguageId: string }) {
  const online = useOnlineStatus();
  const [materials, setMaterials] = useState<LearningMaterial[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const loadRequestId = useRef(0);

  const loadMaterials = useCallback(async (showLoading = true) => {
    const requestId = ++loadRequestId.current;
    if (showLoading) setLoading(true);
    const { data, error } = await supabase
      .from('learning_materials')
      .select('id,file_name,status,created_at')
      .eq('learning_language_id', learningLanguageId)
      .in('status', ['processing', 'ready'])
      .order('created_at', { ascending: false });
    if (requestId !== loadRequestId.current) return;
    if (error) {
      setNotice('Learning Materials could not be loaded.');
      setMaterials([]);
      setLoading(false);
      return;
    }
    setMaterials((data ?? []).map((row) => toLearningMaterial(row as LearningMaterialRow)).filter((row): row is LearningMaterial => row !== null));
    setNotice('');
    setLoading(false);
  }, [learningLanguageId]);

  useEffect(() => {
    queueMicrotask(() => void loadMaterials());
  }, [loadMaterials]);

  useEffect(() => {
    const hasPersistedProcessing = materials.some((material) => material.status === 'processing' && !material.id.startsWith('pending-'));
    if (uploading || !hasPersistedProcessing) return;
    const interval = window.setInterval(() => void loadMaterials(false), 750);
    return () => window.clearInterval(interval);
  }, [loadMaterials, materials, uploading]);

  function selectFile(event: React.ChangeEvent<HTMLInputElement>) {
    setSelectedFile(event.target.files?.[0] ?? null);
    setNotice('');
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!online) {
      setNotice('You are offline. Learning Material uploads require a connection.');
      return;
    }
    if (!selectedFile) {
      setNotice('Choose a .txt Learning Material file to upload.');
      return;
    }
    const pendingId = `pending-${crypto.randomUUID()}`;
    loadRequestId.current += 1;
    const pendingMaterial: LearningMaterial = { id: pendingId, fileName: selectedFile.name, status: 'processing', createdAt: new Date().toISOString() };
    setMaterials((current) => [pendingMaterial, ...current]);
    setAnnouncement(`${selectedFile.name} is processing.`);
    setNotice('');
    setUploading(true);
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('learningLanguageId', learningLanguageId);
    try {
      const response = await fetch('/api/learning-materials', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData,
      });
      let payload: UploadResponse;
      try {
        payload = await response.json() as UploadResponse;
      } catch {
        throw new Error('Learning Material could not be uploaded.');
      }
      const apiError = typeof payload?.error === 'string' ? payload.error : null;
      if (!response.ok || apiError) throw new ProductUploadError(apiError ?? 'Learning Material could not be uploaded.');
      if (!payload.material) throw new Error('Learning Material could not be uploaded.');
      const material = toLearningMaterial({ id: payload.material.id, file_name: payload.material.fileName, status: payload.material.status, created_at: payload.material.createdAt });
      if (!material) throw new Error('Learning Material could not be uploaded.');
      setMaterials((current) => [material, ...current.filter((entry) => entry.id !== pendingId)]);
      setAnnouncement(`${material.fileName} is ${material.status}.`);
      setSelectedFile(null);
      form.reset();
    } catch (error) {
      setMaterials((current) => current.filter((entry) => entry.id !== pendingId));
      setNotice(error instanceof ProductUploadError ? error.message : 'Learning Material could not be uploaded.');
      setAnnouncement('');
    } finally {
      setUploading(false);
    }
  }

  return <section className="learning-materials" aria-labelledby="learning-materials-heading">
    <div className="learning-materials-heading">
      <div>
        <h2 id="learning-materials-heading">Learning Materials</h2>
        <p>Keep a private reading text ready for future Lessons.</p>
      </div>
      <span className="learning-materials-language">Active language</span>
    </div>
    <form className="learning-materials-form" onSubmit={upload}>
      <label htmlFor="learning-material-file">Learning Material file</label>
      <input id="learning-material-file" type="file" accept=".txt,text/plain" aria-describedby="learning-material-file-help" onChange={selectFile} disabled={!online || loading || uploading} />
      <p className="learning-materials-help" id="learning-material-file-help">Upload one UTF-8 .txt file, up to 1 MiB.</p>
      <button className="primary-button" type="submit" disabled={!online || loading || uploading}>{uploading ? 'Uploading…' : 'Upload Learning Material'}</button>
    </form>
    {!online && <p className="form-notice" role="status">You are offline. Learning Material uploads require a connection.</p>}
    {notice && <p className="form-notice error" role="alert">{notice}</p>}
    {announcement && <p className="learning-materials-announcement" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>}
    {loading ? <p className="learning-materials-empty" role="status">Loading your Learning Materials…</p> : materials.length === 0 ? <p className="learning-materials-empty">No Learning Materials yet. Add a reading text to get started.</p> : <ul className="learning-materials-list" aria-label="Learning Material list">
      {materials.map((material) => <li className="learning-material-row" key={material.id}>
        <span className="learning-material-name">{material.fileName}</span>
        <span className={`learning-material-status ${material.status}`}>{material.status}</span>
      </li>)}
    </ul>}
  </section>;
}
