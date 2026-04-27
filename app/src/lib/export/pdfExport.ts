// =============================================================
// Main-thread orchestrator for PDF export.
// Manages worker lifecycle, font loading, download handoff.
// =============================================================

import type {
  ExportJobState,
  WorkerToMainMessage,
  StartExportDirectoryMessage,
} from './exportTypes';
import { IDLE_EXPORT_STATE } from './exportTypes';

// Font asset URLs — resolved at import time by Vite
import montserratRegularUrl from '../../assets/fonts/Montserrat/static/Montserrat-Regular.ttf?url';
import montserratBoldUrl from '../../assets/fonts/Montserrat/static/Montserrat-Bold.ttf?url';
import garamondRegularUrl from '../../assets/fonts/EB_Garamond/static/EBGaramond-Regular.ttf?url';
import garamondBoldUrl from '../../assets/fonts/EB_Garamond/static/EBGaramond-Bold.ttf?url';
import garamondItalicUrl from '../../assets/fonts/EB_Garamond/static/EBGaramond-Italic.ttf?url';
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
  const [montserratRegular, montserratBold, garamondRegular, garamondBold, garamondItalic] = await Promise.all([
    fetchAsArrayBuffer(montserratRegularUrl),
    fetchAsArrayBuffer(montserratBoldUrl),
    fetchAsArrayBuffer(garamondRegularUrl),
    fetchAsArrayBuffer(garamondBoldUrl),
    fetchAsArrayBuffer(garamondItalicUrl),
  ]);
  return {
    'Montserrat-Regular.ttf': montserratRegular,
    'Montserrat-Bold.ttf': montserratBold,
    'EBGaramond-Regular.ttf': garamondRegular,
    'EBGaramond-Bold.ttf': garamondBold,
    'EBGaramond-Italic.ttf': garamondItalic,
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
      console.error('[PDF Export] Worker error:', err);
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
