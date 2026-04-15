import { decryptBinary, encryptData } from './crypto';
import type { StorageProvider } from './storage';

const IMAGE_BYTES_DOWNSAMPLE_THRESHOLD = 1_000_000;
const IMAGE_SHORT_SIDE_MAX = 1440;
const MEDIA_IMAGE_CACHE_CAPACITY = 20;

const SUPPORTED_IMAGE_EXTENSIONS = ['png', 'webp', 'jpg', 'jpeg', 'avif'] as const;

export type SupportedImageExtension = (typeof SUPPORTED_IMAGE_EXTENSIONS)[number];

const MIME_BY_EXTENSION: Record<SupportedImageExtension, string> = {
  png: 'image/png',
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  avif: 'image/avif',
};

const EXTENSION_BY_MIME = new Map<string, SupportedImageExtension>([
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/jpeg', 'jpg'],
  ['image/jpg', 'jpg'],
  ['image/avif', 'avif'],
]);

const ENCRYPTED_MEDIA_PATH_PATTERN = /^\d{4}\/media\/\d{4}-\d{2}-\d{2}_\d{2}-\d{2}(?:-\d{2})?\.(png|webp|jpg|jpeg|avif)$/i;
const PENDING_MEDIA_PATH_PATTERN = /^pending-media:\/\/([0-9a-fA-F-]{36})$/;

interface CachedMediaImage {
  bytes: Uint8Array;
  mimeType: string;
}

const mediaImageCache = new Map<string, CachedMediaImage>();
const mediaUploadSuffixCursor = new Map<string, number>();

export interface PixelCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EncryptedMediaPathAllocator {
  directoryPath: string;
  nextPath: (extension: SupportedImageExtension) => string;
}

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}

function formatDateToken(date: Date): string {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const hours = pad2(date.getHours());
  const minutes = pad2(date.getMinutes());
  return `${year}-${month}-${day}_${hours}-${minutes}`;
}

function parseEntryDateToken(entryDateToken: string | undefined): Date | null {
  if (!entryDateToken) return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})$/.exec(entryDateToken.trim());
  if (!match) return null;

  const [, year, month, day, hours, minutes] = match;
  const parsed = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hours),
    Number(minutes),
    0,
    0,
  );

  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function getMediaDirectory(entryDateToken?: string): { year: string; date: Date } {
  const parsed = parseEntryDateToken(entryDateToken);
  const date = parsed ?? new Date();
  return {
    year: String(date.getFullYear()),
    date,
  };
}

function getFileNameFromPath(path: string): string {
  const segments = path.split('/');
  return segments[segments.length - 1] ?? path;
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Unable to encode image blob.'));
        return;
      }

      resolve(blob);
    }, mimeType, quality);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to decode image.'));
    image.src = src;
  });
}

function normalizePathCandidate(rawPath: string): string {
  return rawPath.trim().replace(/^<|>$/g, '');
}

function cloneBytes(bytes: Uint8Array): Uint8Array {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

function getCachedMediaImage(path: string): CachedMediaImage | null {
  const cached = mediaImageCache.get(path);
  if (!cached) return null;

  mediaImageCache.delete(path);
  mediaImageCache.set(path, cached);

  return {
    bytes: cloneBytes(cached.bytes),
    mimeType: cached.mimeType,
  };
}

function cacheMediaImage(path: string, mimeType: string, bytes: Uint8Array): void {
  if (mediaImageCache.has(path)) {
    mediaImageCache.delete(path);
  }

  mediaImageCache.set(path, {
    mimeType,
    bytes: cloneBytes(bytes),
  });

  while (mediaImageCache.size > MEDIA_IMAGE_CACHE_CAPACITY) {
    const oldestKey = mediaImageCache.keys().next().value;
    if (!oldestKey) break;
    mediaImageCache.delete(oldestKey);
  }
}

export function clearMediaImageCache(): void {
  mediaImageCache.clear();
}

export function clearMediaUploadPathCursor(): void {
  mediaUploadSuffixCursor.clear();
}

export function getSupportedImageAcceptString(): string {
  return SUPPORTED_IMAGE_EXTENSIONS.map((ext) => `.${ext}`).join(',');
}

export function isSupportedImageExtension(value: string): value is SupportedImageExtension {
  const normalized = value.trim().toLowerCase();
  return SUPPORTED_IMAGE_EXTENSIONS.includes(normalized as SupportedImageExtension);
}

export function isSupportedImageMimeType(value: string): boolean {
  return EXTENSION_BY_MIME.has(value.trim().toLowerCase());
}

export function getMimeTypeForExtension(extension: SupportedImageExtension): string {
  return MIME_BY_EXTENSION[extension];
}

export function getMimeTypeForMediaPath(path: string): string | null {
  const extension = path.split('.').pop();
  if (!extension || !isSupportedImageExtension(extension.toLowerCase())) {
    return null;
  }

  const supportedExtension = extension.toLowerCase() as SupportedImageExtension;
  return MIME_BY_EXTENSION[supportedExtension];
}

export function getExtensionForMimeType(mimeType: string): SupportedImageExtension | null {
  return EXTENSION_BY_MIME.get(mimeType.trim().toLowerCase()) ?? null;
}

export function resolveSupportedImageExtension(fileName: string, mimeType: string): SupportedImageExtension | null {
  const fromMime = getExtensionForMimeType(mimeType);
  if (fromMime) return fromMime;

  const extension = fileName.split('.').pop();
  if (!extension) return null;

  const normalized = extension.toLowerCase();
  if (!isSupportedImageExtension(normalized)) return null;
  return normalized;
}

export function isEncryptedMediaPath(path: string): boolean {
  return ENCRYPTED_MEDIA_PATH_PATTERN.test(path.trim());
}

export function createPendingMediaPath(pendingId: string): string {
  return `pending-media://${pendingId}`;
}

export function parsePendingMediaId(path: string): string | null {
  const match = PENDING_MEDIA_PATH_PATTERN.exec(path.trim());
  if (!match) return null;
  return match[1];
}

export function isPendingMediaPath(path: string): boolean {
  return parsePendingMediaId(path) !== null;
}

export function extractPendingMediaIds(markdown: string): string[] {
  const matches = markdown.matchAll(/!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g);
  const unique = new Set<string>();

  for (const match of matches) {
    const raw = match[1];
    if (!raw) continue;

    const path = normalizePathCandidate(raw);
    const pendingId = parsePendingMediaId(path);
    if (!pendingId) continue;
    unique.add(pendingId);
  }

  return [...unique];
}

export function replacePendingMediaPaths(markdown: string, pendingIdToEncryptedPath: Map<string, string>): string {
  if (pendingIdToEncryptedPath.size === 0) {
    return markdown;
  }

  return markdown.replace(
    /!\[([^\]]*)\]\(([^)\s]+)(\s+"[^"]*")?\)/g,
    (fullMatch, altText: string, src: string, titlePart: string | undefined) => {
      const normalizedSrc = normalizePathCandidate(src);
      const pendingId = parsePendingMediaId(normalizedSrc);
      if (!pendingId) return fullMatch;

      const encryptedPath = pendingIdToEncryptedPath.get(pendingId);
      if (!encryptedPath) return fullMatch;

      return `![${altText}](${encryptedPath}${titlePart ?? ''})`;
    },
  );
}

export function extractEncryptedMediaPaths(markdown: string): string[] {
  const matches = markdown.matchAll(/!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g);
  const unique = new Set<string>();

  for (const match of matches) {
    const raw = match[1];
    if (!raw) continue;

    const path = normalizePathCandidate(raw);
    if (!isEncryptedMediaPath(path)) continue;
    unique.add(path);
  }

  return [...unique];
}

export function createEncryptedMediaPathAllocator(
  entryDateToken?: string,
  existingFilePaths: string[] = [],
): EncryptedMediaPathAllocator {
  const { year, date } = getMediaDirectory(entryDateToken);
  const directoryPath = `${year}/media`;
  const timestamp = formatDateToken(date);
  const existingFileNames = new Set(existingFilePaths.map(getFileNameFromPath));

  return {
    directoryPath,
    nextPath: (extension: SupportedImageExtension) => {
      const cursorKey = `${directoryPath}/${timestamp}.${extension}`;
      let suffix = mediaUploadSuffixCursor.get(cursorKey) ?? 0;

      while (true) {
        const candidateName = suffix === 0
          ? `${timestamp}.${extension}`
          : `${timestamp}-${pad2(suffix)}.${extension}`;

        if (!existingFileNames.has(candidateName)) {
          existingFileNames.add(candidateName);
          mediaUploadSuffixCursor.set(cursorKey, suffix + 1);
          return `${directoryPath}/${candidateName}`;
        }

        suffix += 1;
      }
    },
  };
}

export async function createUniqueEncryptedMediaPath(
  storage: StorageProvider,
  extension: SupportedImageExtension,
  entryDateToken?: string,
): Promise<string> {
  const seedAllocator = createEncryptedMediaPathAllocator(entryDateToken);
  const existingFiles = await storage.listFiles(seedAllocator.directoryPath);
  const allocator = createEncryptedMediaPathAllocator(entryDateToken, existingFiles);
  return allocator.nextPath(extension);
}

export async function encryptAndUploadImage(
  storage: StorageProvider,
  recipientPublicKey: string,
  path: string,
  bytes: Uint8Array,
): Promise<void> {
  const encrypted = await encryptData(recipientPublicKey, bytes);
  await storage.uploadFile(path, encrypted);
}

export async function downloadAndDecryptImage(
  storage: StorageProvider,
  secretKey: string,
  path: string,
): Promise<Uint8Array> {
  const cached = getCachedMediaImage(path);
  if (cached) {
    return cached.bytes;
  }

  const encrypted = await storage.downloadFile(path);
  if (!encrypted) {
    throw new Error('Image not found in vault storage.');
  }

  const decrypted = await decryptBinary(secretKey, encrypted);
  cacheMediaImage(path, getMimeTypeForMediaPath(path) ?? 'application/octet-stream', decrypted);
  return cloneBytes(decrypted);
}

export async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  const arrayBuffer = await blob.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

export async function cropImageBlob(
  sourceUrl: string,
  crop: PixelCrop,
  mimeType: string,
): Promise<Blob> {
  const image = await loadImageElement(sourceUrl);

  const x = Math.max(0, Math.floor(crop.x));
  const y = Math.max(0, Math.floor(crop.y));
  const width = Math.max(1, Math.floor(crop.width));
  const height = Math.max(1, Math.floor(crop.height));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Unable to initialize canvas rendering context.');
  }

  context.drawImage(image, x, y, width, height, 0, 0, width, height);
  return canvasToBlob(canvas, mimeType);
}

export async function maybeDownsampleImageBlob(blob: Blob, mimeType: string): Promise<Blob> {
  if (blob.size < IMAGE_BYTES_DOWNSAMPLE_THRESHOLD) {
    return blob;
  }

  const sourceUrl = URL.createObjectURL(blob);

  try {
    const image = await loadImageElement(sourceUrl);
    const sourceWidth = image.naturalWidth;
    const sourceHeight = image.naturalHeight;

    const shortSide = Math.min(sourceWidth, sourceHeight);
    if (shortSide <= IMAGE_SHORT_SIDE_MAX) {
      return blob;
    }

    const ratio = IMAGE_SHORT_SIDE_MAX / shortSide;
    const targetWidth = Math.max(1, Math.round(sourceWidth * ratio));
    const targetHeight = Math.max(1, Math.round(sourceHeight * ratio));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Unable to initialize canvas rendering context.');
    }

    context.drawImage(image, 0, 0, sourceWidth, sourceHeight, 0, 0, targetWidth, targetHeight);
    return canvasToBlob(canvas, mimeType);
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}
