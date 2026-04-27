// ============================================================
// Shared type definitions for the PDF export pipeline.
// Used by both the main-thread orchestrator and the web worker.
// ============================================================

// --- Job types ---

export type ExportJobType = 'directory';

export type ExportStage =
  | 'preparing'
  | 'downloading'
  | 'decrypting'
  | 'rendering'
  | 'encoding'
  | 'finalizing';

export type ExportStatus = 'idle' | 'running' | 'done' | 'failed';

// --- Main → Worker messages ---

export interface StartExportDirectoryMessage {
  type: 'START_EXPORT_DIRECTORY';
  jobId: string;
  /** List of entry file paths in the directory (e.g. "2026/2026-04-15_09-30.age") */
  entryPaths: string[];
  /** The year being exported */
  year: string;
  /** Vault secret key for decrypting entries and media */
  secretKey: string;
  /** OAuth bearer token for Google Drive fetch */
  accessToken: string;
  /** Font file bytes (ArrayBuffer) keyed by font name */
  fonts: Record<string, ArrayBuffer>;
  /** User profile info for title page */
  userName: string;
  /** User profile picture bytes (PNG/JPEG), null if unavailable */
  profilePictureBytes: ArrayBuffer | null;
  /** App logo bytes (PNG) for title page */
  logoBytes: ArrayBuffer;
}

export interface CancelExportMessage {
  type: 'CANCEL_EXPORT';
  jobId: string;
}

export type MainToWorkerMessage =
  | StartExportDirectoryMessage
  | CancelExportMessage;

// --- Worker → Main messages ---

export interface ProgressMessage {
  type: 'PROGRESS';
  jobId: string;
  percent: number;
  stage: ExportStage;
  stageText: string;
}

export interface CompletedMessage {
  type: 'COMPLETED';
  jobId: string;
  /** Final PDF bytes as transferable ArrayBuffer */
  pdfBytes: ArrayBuffer;
  filename: string;
  /** Warnings accumulated during export (e.g. skipped images) */
  warnings: string[];
}

export interface FailedMessage {
  type: 'FAILED';
  jobId: string;
  error: string;
  stage: ExportStage;
  /** Optional entry path where the failure occurred */
  entryPath?: string;
}

export interface CancelledMessage {
  type: 'CANCELLED';
  jobId: string;
}

export type WorkerToMainMessage =
  | ProgressMessage
  | CompletedMessage
  | FailedMessage
  | CancelledMessage;

// --- UI state ---

export interface ExportJobState {
  status: ExportStatus;
  jobId?: string;
  jobType?: ExportJobType;
  percent?: number;
  stage?: ExportStage;
  stageText?: string;
  filename?: string;
  warnings?: string[];
  error?: string;
}

export const IDLE_EXPORT_STATE: ExportJobState = { status: 'idle' };
