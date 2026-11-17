'use client';

import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { learningMaterialMessages, MAX_LEARNING_MATERIAL_BYTES } from '../lib/learning-materials/validation';
import { supabase } from '../lib/supabase';

type MaterialStatus = 'processing' | 'failed' | 'ready';
type LearningMaterial = { id: string; fileName: string; status: MaterialStatus; createdAt: string; failureReason: string | null; byteSize: number | null };
type LearningMaterialRow = { id: string; file_name: string; status: string; created_at: string; failure_reason?: string | null; byte_size?: number | null };
type UploadResponse = { material?: { id: string; fileName: string; status: string; createdAt: string; failureReason?: string | null }; error?: unknown };
type RetryResponse = { material?: { id: string; fileName: string; status: string; createdAt: string; failureReason?: string | null }; error?: unknown };
type DeleteResponse = { deleted?: boolean; error?: unknown };

class ProductUploadError extends Error {}

function toLearningMaterial(row: LearningMaterialRow): LearningMaterial | null {
  if (row.status !== 'processing' && row.status !== 'failed' && row.status !== 'ready') return null;
  return { id: row.id, fileName: row.file_name, status: row.status, createdAt: row.created_at, failureReason: row.failure_reason ?? null, byteSize: row.byte_size ?? null };
}

function browserRejection(file: File) {
  if (!file.name.toLowerCase().endsWith('.txt')) return learningMaterialMessages.extension;
  if (file.size > MAX_LEARNING_MATERIAL_BYTES) return learningMaterialMessages.size;
  if (file.size === 0) return learningMaterialMessages.empty;
  return null;
}

export function LearningMaterials({ accessToken, learningLanguageId, onMaterialsChanged }: { accessToken: string; learningLanguageId: string; onMaterialsChanged?: (readyCount: number) => void }) {
  const online = useOnlineStatus();
  const [materials, setMaterials] = useState<LearningMaterial[]>([]);
  const [dragging, setDragging] = useState(false);
  const [menuMaterialId, setMenuMaterialId] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [retryingId, setRetryingId] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [deletingMaterial, setDeletingMaterial] = useState<LearningMaterial | null>(null);
  const [deleteNotice, setDeleteNotice] = useState('');
  const [notice, setNotice] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const loadRequestId = useRef(0);
  const dragDepth = useRef(0);
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
      .select('id,file_name,status,created_at,failure_reason,byte_size')
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
    if (loading) return;
    onMaterialsChanged?.(materials.filter((material) => material.status === 'ready').length);
  }, [loading, materials, onMaterialsChanged]);

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

  const uploadDisabled = !online || loading || uploading;

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void upload(file);
  }

  function hasFiles(event: DragEvent<HTMLElement>) {
    return Array.from(event.dataTransfer.types).includes('Files');
  }

  function dragEnter(event: DragEvent<HTMLElement>) {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  }

  function dragOver(event: DragEvent<HTMLElement>) {
    if (!hasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = uploadDisabled ? 'none' : 'copy';
  }

  function dragLeave(event: DragEvent<HTMLElement>) {
    if (!hasFiles(event)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }

  function drop(event: DragEvent<HTMLElement>) {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (uploadDisabled) return;
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 1) {
      setNotice('Drop one Learning Material file at a time.');
      return;
    }
    if (files[0]) void upload(files[0]);
  }

  async function upload(selectedFile: File) {
    if (loading || uploading) return;
    if (!online) {
      setNotice('You are offline. Learning Material uploads require a connection.');
      return;
    }
    const rejection = browserRejection(selectedFile);
    if (rejection) {
      setNotice(rejection);
      setAnnouncement('');
      return;
    }
    const pendingId = `pending-${crypto.randomUUID()}`;
    const uploadLanguageId = learningLanguageId;
    loadRequestId.current += 1;
    const pendingMaterial: LearningMaterial = { id: pendingId, fileName: selectedFile.name, status: 'processing', createdAt: new Date().toISOString(), failureReason: null, byteSize: selectedFile.size };
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
      const material = toLearningMaterial({ id: payload.material.id, file_name: payload.material.fileName, status: payload.material.status, created_at: payload.material.createdAt, failure_reason: payload.material.failureReason ?? null, byte_size: selectedFile.size });
      if (!material) throw new Error('Learning Material could not be uploaded.');
      if (activeLanguageRef.current !== uploadLanguageId) return;
      setMaterials((current) => [material, ...current.filter((entry) => entry.id !== pendingId)]);
      setAnnouncement(`${material.fileName} is ${material.status}.`);
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
      const nextMaterial = toLearningMaterial({ id: payload.material.id, file_name: payload.material.fileName, status: payload.material.status, created_at: payload.material.createdAt, failure_reason: payload.material.failureReason ?? null });
      if (!nextMaterial || activeLanguageRef.current !== retryLanguageId) return;
      setMaterials((current) => current.map((entry) => entry.id === material.id ? { ...nextMaterial, byteSize: entry.byteSize } : entry));
      setAnnouncement(`${nextMaterial.fileName} is ${nextMaterial.status}.`);
    } catch (error) {
      if (activeLanguageRef.current !== retryLanguageId) return;
      const retryError = error instanceof ProductUploadError ? error.message : 'Learning Material could not be retried.';
      setMaterials((current) => current.map((entry) => entry.id === material.id ? { ...entry, status: 'failed', failureReason: error instanceof ProductUploadError ? error.message : entry.failureReason } : entry));
      setNotice(retryError);
      setAnnouncement('');
    } finally {
      if (activeLanguageRef.current === retryLanguageId) setRetryingId('');
    }
  }

  function openDeleteDialog(material: LearningMaterial, returnFocus: HTMLElement | null) {
    deleteReturnFocus.current = returnFocus;
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

  const dropzoneClassName = ['learning-materials-dropzone', dragging && !uploadDisabled ? 'is-dragging' : '', uploadDisabled ? 'is-disabled' : ''].filter(Boolean).join(' ');

  return <section className="learning-materials" aria-labelledby="learning-materials-heading">
    <h2 className="sr-only" id="learning-materials-heading">Learning Materials</h2>
    <label className={dropzoneClassName} onDragEnter={dragEnter} onDragOver={dragOver} onDragLeave={dragLeave} onDrop={drop}>
      <input className="learning-materials-file-input" id="learning-material-file" type="file" accept=".txt,text/plain" aria-label="Learning Material file" aria-describedby="learning-material-file-help" onChange={selectFile} disabled={uploadDisabled} />
      <UploadIcon />
      <span className="learning-materials-dropzone-title">{uploading ? 'Uploading…' : dragging && !uploadDisabled ? 'Drop to upload' : <>Drop a reading text here, or <span className="learning-materials-dropzone-pick">choose a file</span></>}</span>
      <span className="learning-materials-help" id="learning-material-file-help">One UTF-8 .txt file, up to 1 MiB.</span>
    </label>
    {!online && <p className="form-notice" role="status">You are offline. Learning Material uploads require a connection.</p>}
    {notice && <p className="form-notice error" role="alert">{notice}</p>}
    {announcement && <p className="learning-materials-announcement sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>}
    {loading ? <div className="materials-skeleton" aria-hidden="true"><div className="skeleton materials-skeleton-row" /><div className="skeleton materials-skeleton-row" /><div className="skeleton materials-skeleton-row" /></div> : materials.length === 0 ? <div className="empty-state"><h3>No reading material yet.</h3><p>No Learning Materials yet. Add a reading text to get started.</p></div> : <ul className="learning-materials-list" aria-label="Learning Material list">
      {materials.map((material) => {
        const pending = material.id.startsWith('pending-');
        return <li className="learning-material-row" key={material.id}>
          <FileIcon />
          <span className="learning-material-body">
            <span className="learning-material-name">{material.fileName}</span>
            <span className="learning-material-meta">{[material.byteSize === null ? null : formatByteSize(material.byteSize), formatUploadDate(material.createdAt)].filter(Boolean).join(' · ')}</span>
            {material.status === 'failed' && material.failureReason && <span className="learning-material-failure-reason">{material.failureReason}</span>}
          </span>
          {material.status !== 'ready' && <span className={`learning-material-status ${material.status}`}>{material.status === 'processing' ? 'Processing' : 'Failed'}</span>}
          <MaterialActionsMenu
            material={material}
            open={menuMaterialId === material.id}
            disabled={!online || pending || deletingId === material.id}
            canRetry={material.status === 'failed' && !retryingId && !deletingId}
            canDelete={retryingId !== material.id}
            onOpenChange={(open) => setMenuMaterialId(open ? material.id : '')}
            onRetry={() => void retry(material)}
            onDelete={(trigger) => openDeleteDialog(material, trigger)}
          />
        </li>;
      })}
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

function formatByteSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${kilobytes < 10 ? kilobytes.toFixed(1) : Math.round(kilobytes)} KB`;
  return `${(kilobytes / 1024).toFixed(1)} MB`;
}

const uploadDateFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

function formatUploadDate(createdAt: string) {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? null : uploadDateFormat.format(date);
}

function UploadIcon() {
  return <svg aria-hidden="true" className="learning-materials-dropzone-icon" fill="none" focusable="false" height="28" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" viewBox="0 0 24 24" width="28">
    <path d="M12 15V4" />
    <path d="m7.5 8.5 4.5-4.5 4.5 4.5" />
    <path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
  </svg>;
}

function FileIcon() {
  return <svg aria-hidden="true" className="learning-material-icon" fill="none" focusable="false" height="20" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" viewBox="0 0 24 24" width="20">
    <path d="M13 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9l-6-6Z" />
    <path d="M13 3v6h6" />
    <path d="M8.5 13h7" />
    <path d="M8.5 17h4.5" />
  </svg>;
}

type MaterialActionsMenuProps = {
  material: LearningMaterial;
  open: boolean;
  disabled: boolean;
  canRetry: boolean;
  canDelete: boolean;
  onOpenChange: (open: boolean) => void;
  onRetry: () => void;
  onDelete: (trigger: HTMLElement | null) => void;
};

function MaterialActionsMenu({ material, open, disabled, canRetry, canDelete, onOpenChange, onRetry, onDelete }: MaterialActionsMenuProps) {
  const menuId = useId();
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const showRetry = material.status === 'failed';
  const actions = [
    ...(showRetry ? [{ key: 'retry', label: 'Retry', danger: false, disabled: !canRetry }] : []),
    { key: 'delete', label: 'Delete', danger: true, disabled: !canDelete },
  ];
  const expanded = open && !disabled;

  useEffect(() => {
    if (!expanded) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) onOpenChange(false);
    };
    document.addEventListener('pointerdown', closeOnOutside);
    return () => document.removeEventListener('pointerdown', closeOnOutside);
  }, [expanded, onOpenChange]);

  useEffect(() => {
    if (expanded) items.current[activeIndex]?.focus();
  }, [activeIndex, expanded]);

  function show(index: number) {
    setActiveIndex(index);
    onOpenChange(true);
  }

  function close(restoreFocus: boolean) {
    onOpenChange(false);
    if (restoreFocus) queueMicrotask(() => trigger.current?.focus());
  }

  function runAction(key: string) {
    if (key === 'retry') {
      close(true);
      onRetry();
      return;
    }
    close(false);
    onDelete(trigger.current);
  }

  function triggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      show(0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      show(actions.length - 1);
    }
  }

  function menuKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    const last = actions.length - 1;
    if (event.key === 'ArrowDown') setActiveIndex((index) => index === last ? 0 : index + 1);
    else if (event.key === 'ArrowUp') setActiveIndex((index) => index === 0 ? last : index - 1);
    else if (event.key === 'Home') setActiveIndex(0);
    else if (event.key === 'End') setActiveIndex(last);
    else if (event.key === 'Escape') close(true);
    else if (event.key === 'Tab') { onOpenChange(false); return; }
    else return;
    event.preventDefault();
  }

  return <div className="learning-material-menu" ref={container}>
    <button ref={trigger} className="learning-material-menu-trigger" type="button" aria-label={`More actions for ${material.fileName}`} aria-haspopup="menu" aria-expanded={expanded} aria-controls={expanded ? menuId : undefined} disabled={disabled} onClick={() => expanded ? close(false) : show(0)} onKeyDown={triggerKeyDown}>
      <svg aria-hidden="true" fill="currentColor" focusable="false" height="20" viewBox="0 0 24 24" width="20"><circle cx="5.5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="18.5" cy="12" r="1.6" /></svg>
    </button>
    {expanded && <ul className="learning-material-menu-list" id={menuId} role="menu" aria-label={`Actions for ${material.fileName}`} onKeyDown={menuKeyDown}>
      {actions.map((action, index) => <li key={action.label} role="none">
        <button ref={(element) => { items.current[index] = element; }} className={action.danger ? 'learning-material-menu-item danger' : 'learning-material-menu-item'} type="button" role="menuitem" tabIndex={index === activeIndex ? 0 : -1} disabled={action.disabled} onClick={() => runAction(action.key)}>{action.label}</button>
      </li>)}
    </ul>}
  </div>;
}
