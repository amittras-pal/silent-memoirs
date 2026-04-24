// =============================================================
// PDF Export Web Worker
// Handles CPU/network-heavy export pipeline off the main thread.
// =============================================================

import { decrypt_with_x25519 } from '@kanru/rage-wasm';
import { renderSingleEntryPdf, renderDirectoryPdf } from '../lib/export/pdfRenderer';
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
  // We need to resolve the file path to a file ID first.
  // The storage module on main thread uses a path-based resolution.
  // Here we replicate a simplified version using the Drive API search.
  const rootFolderName = 'silent-memoirs';
  const fullPath = `${rootFolderName}/${path}`;
  const segments = fullPath.split('/').filter(Boolean);

  let parentId = 'root';
  for (const segment of segments) {
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

// --- Export pipelines ---

async function handleSingleExport(msg: MainToWorkerMessage & { type: 'START_EXPORT_SINGLE' }): Promise<void> {
  const { jobId, entryTitle, entryContent, entryDate, entryPath, mediaPaths, secretKey, accessToken, fonts, userName } = msg;

  try {
    postProgress(jobId, 5, 'preparing', 'Preparing export…');
    checkAborted(jobId);

    // Download and decrypt images
    const images = new Map<string, Uint8Array>();
    const warnings: string[] = [];

    for (let i = 0; i < mediaPaths.length; i++) {
      checkAborted(jobId);
      const mediaPath = mediaPaths[i];
      const pct = 5 + Math.round((i / Math.max(mediaPaths.length, 1)) * 50);
      postProgress(jobId, pct, 'downloading', `Downloading image ${i + 1}/${mediaPaths.length}…`);

      const bytes = await decryptImage(mediaPath, secretKey, accessToken, abortController!.signal);
      if (bytes) {
        images.set(mediaPath, bytes);
      } else {
        warnings.push(`Could not export image: ${mediaPath}`);
      }
    }

    postProgress(jobId, 60, 'rendering', 'Rendering PDF…');
    checkAborted(jobId);

    const entry: ExportEntryData = { title: resolveEntryTitle(entryTitle, entryDate), date: entryDate, content: entryContent };
    const result = await renderSingleEntryPdf(entry, fonts, images, userName);

    postProgress(jobId, 95, 'finalizing', 'Finalizing…');
    checkAborted(jobId);

    // Derive filename
    const baseName = entryPath.split('/').pop()?.replace(/\.age$/, '') ?? 'entry';
    const filename = `${baseName}.pdf`;

    postCompleted(jobId, result.pdfBytes, filename, [...warnings, ...result.warnings]);
  } catch (err) {
    if (err instanceof AbortError) {
      postCancelled(jobId);
    } else {
      postFailed(jobId, err instanceof Error ? err.message : String(err), 'rendering', entryPath);
    }
  }
}

async function handleDirectoryExport(msg: MainToWorkerMessage & { type: 'START_EXPORT_DIRECTORY' }): Promise<void> {
  const { jobId, entryPaths, year, secretKey, accessToken, fonts, userName, profilePictureBytes, logoBytes } = msg;

  try {
    postProgress(jobId, 2, 'preparing', 'Preparing directory export…');
    checkAborted(jobId);

    const entries: ExportEntryData[] = [];
    const allImages = new Map<string, Uint8Array>();
    const warnings: string[] = [];
    const totalEntries = entryPaths.length;

    // Download and decrypt each entry + its media
    for (let i = 0; i < totalEntries; i++) {
      checkAborted(jobId);
      const path = entryPaths[i];
      const entryPct = 5 + Math.round((i / Math.max(totalEntries, 1)) * 60);
      postProgress(jobId, entryPct, 'downloading', `Downloading entry ${i + 1}/${totalEntries}…`);

      const entry = await decryptEntry(path, secretKey, accessToken, abortController!.signal);
      if (!entry) {
        warnings.push(`Could not decrypt entry: ${path}`);
        continue;
      }

      entries.push({
        title: resolveEntryTitle(entry.title, entry.date),
        date: entry.date,
        content: entry.plaintext,
      });

      // Extract and download media for this entry
      const mediaPaths = extractEncryptedMediaPaths(entry.plaintext);
      for (let j = 0; j < mediaPaths.length; j++) {
        checkAborted(jobId);
        const mediaPath = mediaPaths[j];
        if (allImages.has(mediaPath)) continue; // skip duplicates

        postProgress(jobId, entryPct, 'decrypting', `Decrypting image ${j + 1} for entry ${i + 1}…`);
        const bytes = await decryptImage(mediaPath, secretKey, accessToken, abortController!.signal);
        if (bytes) {
          allImages.set(mediaPath, bytes);
        } else {
          warnings.push(`Could not export image: ${mediaPath}`);
        }
      }
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

self.onmessage = (event: MessageEvent<MainToWorkerMessage>) => {
  const msg = event.data;

  switch (msg.type) {
    case 'START_EXPORT_SINGLE':
    case 'START_EXPORT_DIRECTORY': {
      // Single-flight: only one export at a time
      if (activeJobId) {
        postFailed(msg.jobId, 'Another export is already in progress', 'preparing');
        return;
      }
      activeJobId = msg.jobId;
      abortController = new AbortController();

      const promise = msg.type === 'START_EXPORT_SINGLE'
        ? handleSingleExport(msg as MainToWorkerMessage & { type: 'START_EXPORT_SINGLE' })
        : handleDirectoryExport(msg as MainToWorkerMessage & { type: 'START_EXPORT_DIRECTORY' });

      promise.finally(() => {
        activeJobId = null;
        abortController = null;
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
