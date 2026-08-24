import type { LearningModeEntry } from './learning-mode-messages';

const databaseName = 'lexync-learning-mode';
const storeName = 'expression-snapshots';

type Snapshot = {
  entries: LearningModeEntry[];
  studyPairId: string;
  updatedAt: number;
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: 'studyPairId' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readExpressionSnapshot(studyPairId: string): Promise<LearningModeEntry[]> {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly');
    const request = transaction.objectStore(storeName).get(studyPairId);
    request.onsuccess = () => resolve((request.result as Snapshot | undefined)?.entries ?? []);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

export async function writeExpressionSnapshot(studyPairId: string, entries: LearningModeEntry[]): Promise<void> {
  const database = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put({ entries, studyPairId, updatedAt: Date.now() } satisfies Snapshot);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}
