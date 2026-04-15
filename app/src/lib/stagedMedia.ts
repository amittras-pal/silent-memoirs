import { openDB, type DBSchema } from 'idb';
import type { StorageProvider } from './storage';
import type { SupportedImageExtension } from './media';

const STAGED_MEDIA_DB_NAME = 'silent-memoirs-staged-media';
const STAGED_MEDIA_DB_VERSION = 1;
const STAGED_MEDIA_STORE = 'staged-media';
const STAGED_MEDIA_ENTRY_INDEX = 'by-entry-key';

interface StagedMediaDBSchema extends DBSchema {
  [STAGED_MEDIA_STORE]: {
    key: string;
    value: StagedMediaRecord;
    indexes: {
      [STAGED_MEDIA_ENTRY_INDEX]: string;
    };
  };
}

export interface StagedMediaRecord {
  pendingId: string;
  entryKey: string;
  fileName: string;
  mimeType: string;
  extension: SupportedImageExtension;
  blob: Blob;
  createdAt: number;
  updatedAt: number;
  uploadedPath: string | null;
}

export interface CreateStagedMediaInput {
  entryKey: string;
  fileName: string;
  mimeType: string;
  extension: SupportedImageExtension;
  blob: Blob;
}

let dbPromise: Promise<import('idb').IDBPDatabase<StagedMediaDBSchema>> | null = null;

function getStagedMediaDb() {
  if (!dbPromise) {
    dbPromise = openDB<StagedMediaDBSchema>(STAGED_MEDIA_DB_NAME, STAGED_MEDIA_DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore(STAGED_MEDIA_STORE, { keyPath: 'pendingId' });
        store.createIndex(STAGED_MEDIA_ENTRY_INDEX, 'entryKey', { unique: false });
      },
    });
  }

  return dbPromise;
}

export async function stageMedia(input: CreateStagedMediaInput): Promise<StagedMediaRecord> {
  const db = await getStagedMediaDb();
  const now = Date.now();

  const record: StagedMediaRecord = {
    pendingId: crypto.randomUUID(),
    entryKey: input.entryKey,
    fileName: input.fileName,
    mimeType: input.mimeType,
    extension: input.extension,
    blob: input.blob,
    createdAt: now,
    updatedAt: now,
    uploadedPath: null,
  };

  await db.put(STAGED_MEDIA_STORE, record);
  return record;
}

export async function getStagedMediaByPendingId(pendingId: string): Promise<StagedMediaRecord | null> {
  const db = await getStagedMediaDb();
  return (await db.get(STAGED_MEDIA_STORE, pendingId)) ?? null;
}

export async function getStagedMediaByPendingIds(pendingIds: string[]): Promise<Map<string, StagedMediaRecord>> {
  const db = await getStagedMediaDb();
  const records = await Promise.all(pendingIds.map((pendingId) => db.get(STAGED_MEDIA_STORE, pendingId)));

  const map = new Map<string, StagedMediaRecord>();
  records.forEach((record) => {
    if (!record) return;
    map.set(record.pendingId, record);
  });

  return map;
}

export async function listStagedMediaForEntry(entryKey: string): Promise<StagedMediaRecord[]> {
  const db = await getStagedMediaDb();
  return db.getAllFromIndex(STAGED_MEDIA_STORE, STAGED_MEDIA_ENTRY_INDEX, entryKey);
}

export async function markStagedMediaUploadedPath(pendingId: string, uploadedPath: string): Promise<void> {
  const db = await getStagedMediaDb();
  const record = await db.get(STAGED_MEDIA_STORE, pendingId);
  if (!record) return;

  await db.put(STAGED_MEDIA_STORE, {
    ...record,
    uploadedPath,
    updatedAt: Date.now(),
  });
}

export async function deleteStagedMediaByPendingIds(pendingIds: string[]): Promise<void> {
  if (pendingIds.length === 0) return;

  const db = await getStagedMediaDb();
  const tx = db.transaction(STAGED_MEDIA_STORE, 'readwrite');

  await Promise.all(pendingIds.map((pendingId) => tx.store.delete(pendingId)));
  await tx.done;
}

export async function deleteStagedMediaForEntry(entryKey: string): Promise<void> {
  const db = await getStagedMediaDb();
  const tx = db.transaction(STAGED_MEDIA_STORE, 'readwrite');

  const keys = await tx.store.index(STAGED_MEDIA_ENTRY_INDEX).getAllKeys(entryKey);
  await Promise.all(keys.map((key) => tx.store.delete(key)));
  await tx.done;
}

export async function deleteUnreferencedStagedMediaForEntry(
  entryKey: string,
  referencedPendingIds: Set<string>,
  storage?: StorageProvider,
): Promise<void> {
  const records = await listStagedMediaForEntry(entryKey);
  const toDeleteRecords = records.filter((record) => !referencedPendingIds.has(record.pendingId));
  const toDelete = toDeleteRecords.map((record) => record.pendingId);

  if (storage) {
    for (const record of toDeleteRecords) {
      if (!record.uploadedPath) continue;
      try {
        await storage.deleteFile(record.uploadedPath);
      } catch (error) {
        console.error('Failed to remove uploaded staged media while pruning unreferenced placeholders', record.uploadedPath, error);
      }
    }
  }

  await deleteStagedMediaByPendingIds(toDelete);
}

export async function clearAllStagedMedia(): Promise<void> {
  const db = await getStagedMediaDb();
  await db.clear(STAGED_MEDIA_STORE);
}

export async function deleteUploadedStagedMediaForEntry(entryKey: string, storage: StorageProvider): Promise<void> {
  const records = await listStagedMediaForEntry(entryKey);

  for (const record of records) {
    if (!record.uploadedPath) continue;

    try {
      await storage.deleteFile(record.uploadedPath);
    } catch (error) {
      console.error('Failed to remove staged uploaded media file during discard', record.uploadedPath, error);
    }
  }

  await deleteStagedMediaForEntry(entryKey);
}
