// =============================================================
// PDF Export Web Worker
// Handles CPU/network-heavy export pipeline off the main thread.
// =============================================================

import { decrypt_with_x25519 } from '@kanru/rage-wasm';
import { renderDirectoryPdf } from '../lib/export/pdfRenderer';
import type { ExportEntryData, TitlePageData } from '../lib/export/pdfRenderer';
import type {
  MainToWorkerMessage,
  ProgressMessage,
  CompletedMessage,
  FailedMessage,
  CancelledMessage,
  ExportStage,
} from '../lib/export/exportTypes';
import { extractEncryptedMediaPaths } from '../lib/media';
import { resolveEntryTitle } from '../lib/entryTitle';

// Google Drive API base for file downloads
const DRIVE_API = 'https://www.googleapis.com/drive/v3';

// Cache resolved Google Drive folder/file IDs to avoid redundant API lookups.
// Keyed by accumulated path prefix, e.g. "silent-memoirs" → driveId,
// "silent-memoirs/2025" → driveId, "silent-memoirs/2025/media" → driveId.
// Cleared after each export job completes.
const pathIdCache = new Map<string, string>();

let abortController: AbortController | null = null;
let activeJobId: string | null = null;

// --- Helpers ---

function postProgress(jobId: string, percent: number, stage: ExportStage, stageText: string): void {
  const msg: ProgressMessage = { type: 'PROGRESS', jobId, percent, stage, stageText };
  self.postMessage(msg);
}

function postCompleted(jobId: string, pdfBytes: Uint8Array, filename: string, warnings: string[]): void {
  const buffer = pdfBytes.buffer as ArrayBuffer;
  const msg: CompletedMessage = { type: 'COMPLETED', jobId, pdfBytes: buffer, filename, warnings };
  (self as unknown as Worker).postMessage(msg, { transfer: [buffer] });
}

function postFailed(jobId: string, error: string, stage: ExportStage, entryPath?: string): void {
  const msg: FailedMessage = { type: 'FAILED', jobId, error, stage, entryPath };
  self.postMessage(msg);
}

function postCancelled(jobId: string): void {
  const msg: CancelledMessage = { type: 'CANCELLED', jobId };
  self.postMessage(msg);
}

function checkAborted(jobId: string): void {
  if (abortController?.signal.aborted) {
    throw new AbortError(jobId);
  }
}

class AbortError extends Error {
  jobId: string;
  constructor(jobId: string) {
    super('Export cancelled');
    this.name = 'AbortError';
    this.jobId = jobId;
  }
}

// --- Google Drive download (direct file content fetch) ---

async function driveDownloadFile(
  path: string,
  accessToken: string,
  signal: AbortSignal,
): Promise<Uint8Array | null> {
  const rootFolderName = 'silent-memoirs';
  const fullPath = `${rootFolderName}/${path}`;
  const segments = fullPath.split('/').filter(Boolean);

  // Resolve each path segment to a Drive file ID, using the cache
  // for segments that have already been resolved in this export job.
  let parentId = 'root';
  let accumulatedPath = '';

  for (const segment of segments) {
    accumulatedPath = accumulatedPath ? `${accumulatedPath}/${segment}` : segment;

    const cached = pathIdCache.get(accumulatedPath);
    if (cached) {
      parentId = cached;
      continue;
    }

    const q = `name='${segment}' and '${parentId}' in parents and trashed=false`;
    const searchUrl = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id)`;
    const res = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.files || data.files.length === 0) return null;
    parentId = data.files[0].id;
    pathIdCache.set(accumulatedPath, parentId);
  }

  // Download the file content
  const downloadUrl = `${DRIVE_API}/files/${parentId}?alt=media`;
  const res = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal,
  });
  if (!res.ok) return null;
  const buffer = await res.arrayBuffer();
  return new Uint8Array(buffer);
}

// --- Concurrency helper ---

const DOWNLOAD_CONCURRENCY = 3;

async function parallelMap<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function decryptEntry(
  path: string,
  secretKey: string,
  accessToken: string,
  signal: AbortSignal,
): Promise<{ title: string; plaintext: string; date: string; mediaIds: string[] } | null> {
  const encrypted = await driveDownloadFile(path, accessToken, signal);
  if (!encrypted) return null;

  const decryptedBytes = await decrypt_with_x25519(secretKey, encrypted);
  const json = new TextDecoder().decode(decryptedBytes);
  const entry = JSON.parse(json);
  return {
    title: entry.title ?? '',
    plaintext: entry.plaintext ?? '',
    date: entry.date ?? '',
    mediaIds: Array.isArray(entry.mediaIds) ? entry.mediaIds : [],
  };
}

async function decryptImage(
  path: string,
  secretKey: string,
  accessToken: string,
  signal: AbortSignal,
): Promise<Uint8Array | null> {
  const encrypted = await driveDownloadFile(path, accessToken, signal);
  if (!encrypted) return null;

  try {
    return await decrypt_with_x25519(secretKey, encrypted);
  } catch {
    return null;
  }
}

// --- Export pipeline ---

async function handleDirectoryExport(msg: MainToWorkerMessage & { type: 'START_EXPORT_DIRECTORY' }): Promise<void> {
  const { jobId, entryPaths, year, secretKey, accessToken, fonts, userName, profilePictureBytes, logoBytes } = msg;

  try {
    postProgress(jobId, 2, 'preparing', 'Preparing directory export…');
    checkAborted(jobId);

    const warnings: string[] = [];
    const totalEntries = entryPaths.length;

    // --- Phase 1: Download and decrypt all entries in parallel ---
    postProgress(jobId, 5, 'downloading', `Downloading ${totalEntries} entries…`);

    interface EntryResult {
      entry: ExportEntryData;
      mediaPaths: string[];
    }

    const entryResults = await parallelMap(entryPaths, async (path, i) => {
      checkAborted(jobId);
      const pct = 5 + Math.round(((i + 1) / totalEntries) * 35);
      postProgress(jobId, pct, 'downloading', `Downloading entry ${i + 1}/${totalEntries}…`);

      const entry = await decryptEntry(path, secretKey, accessToken, abortController!.signal);
      if (!entry) {
        warnings.push(`Could not decrypt entry: ${path}`);
        return null;
      }

      return {
        entry: {
          title: resolveEntryTitle(entry.title, entry.date),
          date: entry.date,
          content: entry.plaintext,
        },
        mediaPaths: extractEncryptedMediaPaths(entry.plaintext),
      } satisfies EntryResult;
    }, DOWNLOAD_CONCURRENCY);

    checkAborted(jobId);

    // Collect entries and deduplicate all media paths
    const entries: ExportEntryData[] = [];
    const uniqueMediaPaths = new Set<string>();

    for (const result of entryResults) {
      if (!result) continue;
      entries.push(result.entry);
      for (const mp of result.mediaPaths) {
        uniqueMediaPaths.add(mp);
      }
    }

    // --- Phase 2: Download and decrypt all images in parallel ---
    const allImages = new Map<string, Uint8Array>();
    const mediaPathList = [...uniqueMediaPaths];

    if (mediaPathList.length > 0) {
      postProgress(jobId, 40, 'downloading', `Downloading ${mediaPathList.length} image(s)…`);

      await parallelMap(mediaPathList, async (mediaPath, i) => {
        checkAborted(jobId);
        const pct = 40 + Math.round(((i + 1) / mediaPathList.length) * 25);
        postProgress(jobId, pct, 'downloading', `Downloading image ${i + 1}/${mediaPathList.length}…`);

        const bytes = await decryptImage(mediaPath, secretKey, accessToken, abortController!.signal);
        if (bytes) {
          allImages.set(mediaPath, bytes);
        } else {
          warnings.push(`Could not export image: ${mediaPath}`);
        }
      }, DOWNLOAD_CONCURRENCY);
    }

    // Sort entries oldest to newest (January → December)
    entries.sort((a, b) => a.date.localeCompare(b.date));

    postProgress(jobId, 70, 'rendering', 'Rendering PDF…');
    checkAborted(jobId);

    const titlePageData: TitlePageData = {
      userName,
      year,
      profilePictureBytes: profilePictureBytes ? new Uint8Array(profilePictureBytes) : null,
      logoBytes: logoBytes ? new Uint8Array(logoBytes) : null,
    };

    const result = await renderDirectoryPdf(entries, fonts, allImages, titlePageData);

    postProgress(jobId, 95, 'finalizing', 'Finalizing…');
    checkAborted(jobId);

    const filename = `${year}-Journal.pdf`;
    postCompleted(jobId, result.pdfBytes, filename, [...warnings, ...result.warnings]);
  } catch (err) {
    if (err instanceof AbortError) {
      postCancelled(jobId);
    } else {
      postFailed(jobId, err instanceof Error ? err.message : String(err), 'rendering');
    }
  }
}

// --- Message handler ---

self.addEventListener('error', (e) => {
  console.error('[PDF Worker] Uncaught error:', e.error ?? e.message ?? e);
});

self.addEventListener('unhandledrejection', (e) => {
  console.error('[PDF Worker] Unhandled rejection:', e.reason);
});

self.onmessage = (event: MessageEvent<MainToWorkerMessage>) => {
  const msg = event.data;

  switch (msg.type) {
    case 'START_EXPORT_DIRECTORY': {
      // Single-flight: only one export at a time
      if (activeJobId) {
        postFailed(msg.jobId, 'Another export is already in progress', 'preparing');
        return;
      }
      activeJobId = msg.jobId;
      abortController = new AbortController();

      handleDirectoryExport(msg).finally(() => {
        activeJobId = null;
        abortController = null;
        pathIdCache.clear();
      });
      break;
    }
    case 'CANCEL_EXPORT': {
      if (activeJobId === msg.jobId && abortController) {
        abortController.abort();
      }
      break;
    }
  }
};
