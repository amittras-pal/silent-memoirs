// =============================================================
// Main-thread orchestrator for PDF export.
// Manages worker lifecycle, font loading, download handoff.
// =============================================================

import type {
  ExportJobState,
  WorkerToMainMessage,
  StartExportSingleMessage,
  StartExportDirectoryMessage,
} from './exportTypes';
import { IDLE_EXPORT_STATE } from './exportTypes';

// Font asset URLs — resolved at import time by Vite
import ralewayRegularUrl from '../../assets/fonts/Raleway-Regular.ttf?url';
import ralewayBoldUrl from '../../assets/fonts/Raleway-Bold.ttf?url';
import crimsonRegularUrl from '../../assets/fonts/CrimsonPro-Regular.ttf?url';
import crimsonBoldUrl from '../../assets/fonts/CrimsonPro-Bold.ttf?url';
import crimsonItalicUrl from '../../assets/fonts/CrimsonPro-Italic.ttf?url';
import logoUrl from '../../assets/logo-light-raster.png?url';

// --- Types ---

export interface ExportCallbacks {
  onStateChange: (state: ExportJobState) => void;
}

interface ActiveJob {
  jobId: string;
  worker: Worker;
  callbacks: ExportCallbacks;
}

// --- State ---

let activeJob: ActiveJob | null = null;

// --- Utilities ---

function generateJobId(): string {
  return `export-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function fetchAsArrayBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.arrayBuffer();
}

async function loadFonts(): Promise<Record<string, ArrayBuffer>> {
  const [ralewayRegular, ralewayBold, crimsonRegular, crimsonBold, crimsonItalic] = await Promise.all([
    fetchAsArrayBuffer(ralewayRegularUrl),
    fetchAsArrayBuffer(ralewayBoldUrl),
    fetchAsArrayBuffer(crimsonRegularUrl),
    fetchAsArrayBuffer(crimsonBoldUrl),
    fetchAsArrayBuffer(crimsonItalicUrl),
  ]);
  return {
    'Raleway-Regular.ttf': ralewayRegular,
    'Raleway-Bold.ttf': ralewayBold,
    'CrimsonPro-Regular.ttf': crimsonRegular,
    'CrimsonPro-Bold.ttf': crimsonBold,
    'CrimsonPro-Italic.ttf': crimsonItalic,
  };
}

async function loadLogo(): Promise<ArrayBuffer> {
  return fetchAsArrayBuffer(logoUrl);
}

async function fetchProfilePicture(url: string | null): Promise<ArrayBuffer | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return res.arrayBuffer();
  } catch {
    return null;
  }
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function createWorker(): Worker {
  return new Worker(
    new URL('../../workers/exportPdf.worker.ts', import.meta.url),
    { type: 'module' },
  );
}

function handleWorkerMessage(event: MessageEvent<WorkerToMainMessage>): void {
  if (!activeJob) return;
  const msg = event.data;
  if (msg.jobId !== activeJob.jobId) return;

  const { callbacks } = activeJob;

  switch (msg.type) {
    case 'PROGRESS': {
      callbacks.onStateChange({
        status: 'running',
        jobId: msg.jobId,
        percent: msg.percent,
        stage: msg.stage,
        stageText: msg.stageText,
      });
      break;
    }
    case 'COMPLETED': {
      const blob = new Blob([msg.pdfBytes], { type: 'application/pdf' });
      triggerDownload(blob, msg.filename);
      callbacks.onStateChange({
        status: 'done',
        jobId: msg.jobId,
        filename: msg.filename,
        warnings: msg.warnings,
        percent: 100,
      });
      cleanupJob();
      break;
    }
    case 'FAILED': {
      callbacks.onStateChange({
        status: 'failed',
        jobId: msg.jobId,
        error: msg.error,
        stage: msg.stage,
      });
      cleanupJob();
      break;
    }
    case 'CANCELLED': {
      callbacks.onStateChange(IDLE_EXPORT_STATE);
      cleanupJob();
      break;
    }
  }
}

function cleanupJob(): void {
  if (activeJob) {
    activeJob.worker.terminate();
    activeJob = null;
  }
}

// --- Public API ---

export function isExportActive(): boolean {
  return activeJob !== null;
}

export function cancelExport(): void {
  if (!activeJob) return;
  activeJob.worker.postMessage({ type: 'CANCEL_EXPORT', jobId: activeJob.jobId });
}

export async function startSingleEntryExport(
  params: {
    entryTitle: string;
    entryContent: string;
    entryDate: string;
    entryPath: string;
    secretKey: string;
    accessToken: string;
    userName: string;
  },
  callbacks: ExportCallbacks,
): Promise<void> {
  if (activeJob) {
    throw new Error('An export is already in progress');
  }

  const jobId = generateJobId();

  callbacks.onStateChange({
    status: 'running',
    jobId,
    jobType: 'single',
    percent: 0,
    stage: 'preparing',
    stageText: 'Loading fonts…',
  });

  try {
    const fonts = await loadFonts();
    const worker = createWorker();

    activeJob = { jobId, worker, callbacks };
    worker.onmessage = handleWorkerMessage;
    worker.onerror = (err) => {
      callbacks.onStateChange({
        status: 'failed',
        jobId,
        error: err.message || 'Worker error',
        stage: 'preparing',
      });
      cleanupJob();
    };

    // Extract media paths from content
    const { extractEncryptedMediaPaths } = await import('../media');
    const mediaPaths = extractEncryptedMediaPaths(params.entryContent);

    const msg: StartExportSingleMessage = {
      type: 'START_EXPORT_SINGLE',
      jobId,
      entryTitle: params.entryTitle,
      entryContent: params.entryContent,
      entryDate: params.entryDate,
      entryPath: params.entryPath,
      mediaPaths,
      secretKey: params.secretKey,
      accessToken: params.accessToken,
      fonts,
      userName: params.userName,
    };

    worker.postMessage(msg);
  } catch (err) {
    callbacks.onStateChange({
      status: 'failed',
      jobId,
      error: err instanceof Error ? err.message : String(err),
      stage: 'preparing',
    });
    cleanupJob();
  }
}

export async function startDirectoryExport(
  params: {
    entryPaths: string[];
    year: string;
    secretKey: string;
    accessToken: string;
    userName: string;
    profilePictureUrl: string | null;
  },
  callbacks: ExportCallbacks,
): Promise<void> {
  if (activeJob) {
    throw new Error('An export is already in progress');
  }

  const jobId = generateJobId();

  callbacks.onStateChange({
    status: 'running',
    jobId,
    jobType: 'directory',
    percent: 0,
    stage: 'preparing',
    stageText: 'Loading fonts and assets…',
  });

  try {
    const [fonts, logoBytes, profilePictureBytes] = await Promise.all([
      loadFonts(),
      loadLogo(),
      fetchProfilePicture(params.profilePictureUrl),
    ]);

    const worker = createWorker();

    activeJob = { jobId, worker, callbacks };
    worker.onmessage = handleWorkerMessage;
    worker.onerror = (err) => {
      callbacks.onStateChange({
        status: 'failed',
        jobId,
        error: err.message || 'Worker error',
        stage: 'preparing',
      });
      cleanupJob();
    };

    const transferables: ArrayBuffer[] = [logoBytes];
    if (profilePictureBytes) transferables.push(profilePictureBytes);

    const msg: StartExportDirectoryMessage = {
      type: 'START_EXPORT_DIRECTORY',
      jobId,
      entryPaths: params.entryPaths,
      year: params.year,
      secretKey: params.secretKey,
      accessToken: params.accessToken,
      fonts,
      userName: params.userName,
      profilePictureBytes: profilePictureBytes,
      logoBytes: logoBytes,
    };

    worker.postMessage(msg);
  } catch (err) {
    callbacks.onStateChange({
      status: 'failed',
      jobId,
      error: err instanceof Error ? err.message : String(err),
      stage: 'preparing',
    });
    cleanupJob();
  }
}
