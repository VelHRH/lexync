'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { supabase } from '../lib/supabase';

type MaterialStatus = 'processing' | 'failed' | 'ready';
type LearningMaterial = { id: string; fileName: string; status: MaterialStatus; createdAt: string };
type LearningMaterialRow = { id: string; file_name: string; status: string; created_at: string };
type UploadResponse = { material?: { id: string; fileName: string; status: string; createdAt: string }; error?: unknown };
type RetryResponse = { material?: { id: string; fileName: string; status: string; createdAt: string }; error?: unknown };
type DeleteResponse = { deleted?: boolean; error?: unknown };

class ProductUploadError extends Error {}

function toLearningMaterial(row: LearningMaterialRow): LearningMaterial | null {
  if (row.status !== 'processing' && row.status !== 'failed' && row.status !== 'ready') return null;
  return { id: row.id, fileName: row.file_name, status: row.status, createdAt: row.created_at };
}

export function LearningMaterials({ accessToken, learningLanguageId, learningLanguageLabel }: { accessToken: string; learningLanguageId: string; learningLanguageLabel: string }) {
  const online = useOnlineStatus();
  const [materials, setMaterials] = useState<LearningMaterial[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [retryingId, setRetryingId] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [deletingMaterial, setDeletingMaterial] = useState<LearningMaterial | null>(null);
  const [deleteNotice, setDeleteNotice] = useState('');
  const [notice, setNotice] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const loadRequestId = useRef(0);
  const activeLanguageRef = useRef(learningLanguageId);
  const previousLanguageRef = useRef(learningLanguageId);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  const deleteReturnFocus = useRef<HTMLElement | null>(null);
  const setDeleteDialogRef = useCallback((dialog: HTMLDialogElement | null) => {
    deleteDialogRef.current = dialog;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    activeLanguageRef.current = learningLanguageId;
  }, [learningLanguageId]);

  const loadMaterials = useCallback(async (showLoading = true) => {
    const requestId = ++loadRequestId.current;
    if (showLoading) setLoading(true);
    const { data, error } = await supabase
      .from('learning_materials')
      .select('id,file_name,status,created_at')
      .eq('learning_language_id', learningLanguageId)
      .in('status', ['processing', 'failed', 'ready'])
      .order('created_at', { ascending: false });
    if (requestId !== loadRequestId.current || activeLanguageRef.current !== learningLanguageId) return;
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
    return () => {
      loadRequestId.current += 1;
    };
  }, [loadMaterials]);

  useEffect(() => {
    if (previousLanguageRef.current === learningLanguageId) return;
    previousLanguageRef.current = learningLanguageId;
    if (!deletingMaterial) return;
    const dialog = deleteDialogRef.current;
    if (dialog?.open) dialog.close();
    deleteReturnFocus.current = null;
    queueMicrotask(() => {
      setDeletingMaterial(null);
      setDeleteNotice('');
      setDeletingId('');
    });
  }, [learningLanguageId, deletingMaterial]);

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
    const uploadLanguageId = learningLanguageId;
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
      if (activeLanguageRef.current !== uploadLanguageId) return;
      setMaterials((current) => [material, ...current.filter((entry) => entry.id !== pendingId)]);
      setAnnouncement(`${material.fileName} is ${material.status}.`);
      setSelectedFile(null);
      form.reset();
    } catch (error) {
      if (activeLanguageRef.current !== uploadLanguageId) return;
      const uploadError = error instanceof ProductUploadError ? error.message : 'Learning Material could not be uploaded.';
      setMaterials((current) => current.filter((entry) => entry.id !== pendingId));
      setAnnouncement('');
      try {
        await loadMaterials();
      } finally {
        if (activeLanguageRef.current === uploadLanguageId) setNotice(uploadError);
      }
    } finally {
      if (activeLanguageRef.current === uploadLanguageId) setUploading(false);
    }
  }

  function safeApiError(payload: { error?: unknown }, fallback: string) {
    return typeof payload.error === 'string' && payload.error.trim() ? payload.error : fallback;
  }

  async function retry(material: LearningMaterial) {
    if (!online || retryingId || deletingId) return;
    const retryLanguageId = learningLanguageId;
    setRetryingId(material.id);
    setNotice('');
    setAnnouncement(`${material.fileName} is processing.`);
    setMaterials((current) => current.map((entry) => entry.id === material.id ? { ...entry, status: 'processing' } : entry));
    try {
      const response = await fetch(`/api/learning-materials/${encodeURIComponent(material.id)}/retry`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ learningLanguageId: retryLanguageId }),
      });
      let payload: RetryResponse;
      try {
        payload = await response.json() as RetryResponse;
      } catch {
        throw new Error('Learning Material could not be retried.');
      }
      if (!response.ok || typeof payload.error === 'string' && payload.error.trim()) throw new ProductUploadError(safeApiError(payload, 'Learning Material could not be retried.'));
      if (!payload.material) throw new Error('Learning Material could not be retried.');
      const nextMaterial = toLearningMaterial({ id: payload.material.id, file_name: payload.material.fileName, status: payload.material.status, created_at: payload.material.createdAt });
      if (!nextMaterial || activeLanguageRef.current !== retryLanguageId) return;
      setMaterials((current) => current.map((entry) => entry.id === material.id ? nextMaterial : entry));
      setAnnouncement(`${nextMaterial.fileName} is ${nextMaterial.status}.`);
    } catch (error) {
      if (activeLanguageRef.current !== retryLanguageId) return;
      setMaterials((current) => current.map((entry) => entry.id === material.id ? { ...entry, status: 'failed' } : entry));
      setNotice(error instanceof ProductUploadError ? error.message : 'Learning Material could not be retried.');
      setAnnouncement('');
    } finally {
      if (activeLanguageRef.current === retryLanguageId) setRetryingId('');
    }
  }

  function openDeleteDialog(material: LearningMaterial) {
    deleteReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDeleteNotice('');
    setDeletingMaterial(material);
  }

  function closeDeleteDialog(restoreFocus = true) {
    const dialog = deleteDialogRef.current;
    if (dialog?.open) dialog.close();
    const returnFocus = deleteReturnFocus.current;
    deleteReturnFocus.current = null;
    setDeletingMaterial(null);
    setDeleteNotice('');
    if (restoreFocus && returnFocus?.isConnected) queueMicrotask(() => returnFocus.focus());
  }

  async function deleteMaterial() {
    if (!deletingMaterial || !online || deletingId) return;
    const material = deletingMaterial;
    const deleteLanguageId = learningLanguageId;
    setDeletingId(material.id);
    setDeleteNotice('');
    try {
      const response = await fetch(`/api/learning-materials/${encodeURIComponent(material.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ learningLanguageId: deleteLanguageId }),
      });
      let payload: DeleteResponse;
      try {
        payload = await response.json() as DeleteResponse;
      } catch {
        throw new Error('Learning Material could not be deleted.');
      }
      if (!response.ok || typeof payload.error === 'string' && payload.error.trim()) throw new ProductUploadError(safeApiError(payload, 'Learning Material could not be deleted.'));
      if (!payload.deleted) throw new Error('Learning Material could not be deleted.');
      if (activeLanguageRef.current !== deleteLanguageId) return;
      setMaterials((current) => current.filter((entry) => entry.id !== material.id));
      closeDeleteDialog(false);
      setAnnouncement(`${material.fileName} deleted.`);
    } catch (error) {
      if (activeLanguageRef.current !== deleteLanguageId) return;
      setDeleteNotice(error instanceof ProductUploadError ? error.message : 'Learning Material could not be deleted.');
    } finally {
      if (activeLanguageRef.current === deleteLanguageId) setDeletingId('');
    }
  }

  return <section className="learning-materials" aria-labelledby="learning-materials-heading">
    <div className="learning-materials-heading">
      <div>
        <h2 id="learning-materials-heading">Learning Materials</h2>
        <p>Keep a private reading text ready for future Lessons.</p>
      </div>
      <span className="learning-materials-language">{learningLanguageLabel}</span>
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
        <span className="learning-material-row-details">
          <span className={`learning-material-status ${material.status}`}>Status: {material.status}.</span>
          <span className="learning-material-actions">
            {material.status === 'failed' && <button className="secondary-button" type="button" aria-label={`Retry ${material.fileName}`} disabled={!online || retryingId === material.id || Boolean(deletingId)} onClick={() => void retry(material)}>{retryingId === material.id ? 'Retrying…' : 'Retry'}</button>}
            <button className="secondary-button danger" type="button" aria-label={`Delete ${material.fileName}`} disabled={!online || material.id.startsWith('pending-') || retryingId === material.id || deletingId === material.id} onClick={() => openDeleteDialog(material)} onKeyDown={(event) => { if (event.key !== 'Enter' && event.key !== ' ') return; event.preventDefault(); openDeleteDialog(material); }}>Delete</button>
          </span>
        </span>
      </li>)}
    </ul>}
    {deletingMaterial && <dialog className="pair-delete-dialog learning-material-delete-dialog" ref={setDeleteDialogRef} aria-labelledby="delete-learning-material-heading" aria-describedby="delete-learning-material-description" onCancel={(event) => { event.preventDefault(); if (!deletingId) closeDeleteDialog(); }}>
        <h2 id="delete-learning-material-heading">Delete “{deletingMaterial.fileName}”?</h2>
        <p id="delete-learning-material-description">This will remove the Learning Material from your list.</p>
        {deleteNotice && <p className="form-notice error" role="alert">{deleteNotice}</p>}
        <div>
          <button className="secondary-button danger" type="button" disabled={!online || deletingId === deletingMaterial.id} onClick={() => void deleteMaterial()}>{deletingId === deletingMaterial.id ? 'Deleting…' : 'Delete Learning Material'}</button>
          <button className="secondary-button" type="button" disabled={Boolean(deletingId)} onClick={() => closeDeleteDialog()}>Cancel</button>
        </div>
    </dialog>}
  </section>;
}
