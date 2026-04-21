import { isSupportedImageExtension } from './media';
import type { JournalEntry, StorageProvider } from './storage';
import type { AgeIdentity } from './crypto';
import { encryptData, decryptData } from './crypto';
import { resolveEntryTitle } from './entryTitle';

import instructionsText from '../assets/vault-directory-instructions.txt?raw';

const MANIFEST_FILE = 'manifest.age';
const MANIFEST_CACHE_STALE_MS = 5 * 60 * 1000;

export interface EntryMetadata {
  id: string;
  path: string;
  name: string;
  parentPath: string;
  title: string;
  date: string;
  year: string;
  updatedAt: string;
  mediaIds: string[];
}

export interface EntryDirectory {
  path: string;
  name: string;
  parentPath: string;
  folderCount: number;
  entryCount: number;
  updatedAt: string;
}

export interface MediaFileMetadata {
  path: string;
  name: string;
  parentPath: string;
  year: string;
  updatedAt: string;
}

export interface DirectoryListing {
  currentPath: string;
  folders: EntryDirectory[];
  entries: EntryMetadata[];
  media: MediaFileMetadata[];
}

interface ManifestFile {
  version: number;
  updatedAt: string;
  entries: EntryMetadata[];
  directories: EntryDirectory[];
}

interface ExplorerIndex {
  knownPaths: Set<string>;
  foldersByParentPath: Map<string, EntryDirectory[]>;
  entriesByParentPath: Map<string, EntryMetadata[]>;
  mediaByParentPath: Map<string, MediaFileMetadata[]>;
}

export class SyncEngine {
  private storage: StorageProvider;
  private identity: AgeIdentity;
  private manifestCache: ManifestFile | null = null;
  private manifestCacheLoadedAt = 0;
  private explorerIndex: ExplorerIndex | null = null;
  private manifestLoadPromise: Promise<ManifestFile> | null = null;

  constructor(storage: StorageProvider, identity: AgeIdentity) {
    this.storage = storage;
    this.identity = identity;
  }

  public async ensureInstructionsFile(): Promise<void> {
    try {
      const files = await this.storage.listFiles('');
      if (!files.includes('README-Silent-Memoirs.txt')) {
        await this.storage.uploadFile(
          'README-Silent-Memoirs.txt',
          new TextEncoder().encode(instructionsText),
          'text/plain'
        );
      }
    } catch (error) {
      console.warn("Failed to backfill instructions file:", error);
    }
  }

  private normalizeDirectoryPath(path: string | null | undefined): string {
    if (!path) return '';
    return path.split('/').filter(Boolean).join('/');
  }

  private getParentPath(path: string): string {
    const segments = path.split('/').filter(Boolean);
    if (segments.length <= 1) return '';
    return segments.slice(0, -1).join('/');
  }

  private getEntryName(path: string): string {
    const fileName = path.split('/').pop() || '';
    return fileName.replace(/\.age$/, '');
  }

  private getYearFromDate(date: string): string {
    return date.split('-')[0] || new Date().getFullYear().toString();
  }

  private toMetadata(entry: JournalEntry, path: string): EntryMetadata {
    const parentPath = this.getParentPath(path);

    return {
      id: entry.id,
      path,
      name: this.getEntryName(path),
      parentPath,
      title: resolveEntryTitle(entry.title, entry.date),
      date: entry.date,
      year: this.getYearFromDate(entry.date),
      updatedAt: new Date().toISOString(),
      mediaIds: entry.mediaIds || [],
    };
  }

  private sortMetadata(entries: EntryMetadata[]): EntryMetadata[] {
    return [...entries].sort((a, b) => {
      const byDate = b.date.localeCompare(a.date);
      if (byDate !== 0) return byDate;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }

  private sortFolderChildren(folders: EntryDirectory[]): EntryDirectory[] {
    return [...folders].sort((a, b) => {
      const aYearFolder = /^\d{4}$/.test(a.name);
      const bYearFolder = /^\d{4}$/.test(b.name);

      if (aYearFolder && bYearFolder) {
        return b.name.localeCompare(a.name);
      }

      if (aYearFolder) return -1;
      if (bYearFolder) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  private sortMediaFiles(files: MediaFileMetadata[]): MediaFileMetadata[] {
    return [...files].sort((a, b) => b.name.localeCompare(a.name));
  }

  private addToGroupedMap<K, V>(map: Map<K, V[]>, key: K, value: V): void {
    const existing = map.get(key);
    if (existing) {
      existing.push(value);
      return;
    }

    map.set(key, [value]);
  }

  private buildMediaFilesFromEntries(entries: EntryMetadata[]): Map<string, MediaFileMetadata[]> {
    const uniqueMedia = new Map<string, MediaFileMetadata>();

    for (const entry of entries) {
      const mediaIds = Array.isArray(entry.mediaIds) ? entry.mediaIds : [];

      for (const rawMediaPath of mediaIds) {
        if (typeof rawMediaPath !== 'string') continue;

        const mediaPath = this.normalizeDirectoryPath(rawMediaPath);
        if (!mediaPath) continue;

        const extension = mediaPath.split('.').pop()?.toLowerCase();
        if (!extension || !isSupportedImageExtension(extension)) continue;

        const parentPath = this.normalizeDirectoryPath(this.getParentPath(mediaPath));
        const existing = uniqueMedia.get(mediaPath);

        if (existing) {
          if (entry.updatedAt > existing.updatedAt) {
            existing.updatedAt = entry.updatedAt;
          }
          continue;
        }

        uniqueMedia.set(mediaPath, {
          path: mediaPath,
          name: mediaPath.split('/').pop() || mediaPath,
          parentPath,
          year: mediaPath.split('/')[0] || '',
          updatedAt: entry.updatedAt,
        });
      }
    }

    const mediaByParentPath = new Map<string, MediaFileMetadata[]>();
    for (const media of uniqueMedia.values()) {
      this.addToGroupedMap(mediaByParentPath, media.parentPath, media);
    }

    for (const [parentPath, files] of mediaByParentPath.entries()) {
      mediaByParentPath.set(parentPath, this.sortMediaFiles(files));
    }

    return mediaByParentPath;
  }

  private buildExplorerIndex(manifest: ManifestFile): ExplorerIndex {
    const foldersByParentPath = new Map<string, EntryDirectory[]>();
    const entriesByParentPath = new Map<string, EntryMetadata[]>();

    for (const folder of manifest.directories) {
      if (folder.path === folder.parentPath) continue;
      this.addToGroupedMap(foldersByParentPath, folder.parentPath, folder);
    }

    for (const [parentPath, folders] of foldersByParentPath.entries()) {
      foldersByParentPath.set(parentPath, this.sortFolderChildren(folders));
    }

    for (const entry of manifest.entries) {
      this.addToGroupedMap(entriesByParentPath, entry.parentPath, entry);
    }

    for (const [parentPath, entries] of entriesByParentPath.entries()) {
      entriesByParentPath.set(parentPath, this.sortMetadata(entries));
    }

    const knownPaths = new Set<string>(manifest.directories.map((folder) => folder.path));
    knownPaths.add('');

    return {
      knownPaths,
      foldersByParentPath,
      entriesByParentPath,
      mediaByParentPath: this.buildMediaFilesFromEntries(manifest.entries),
    };
  }

  private setManifestCache(manifest: ManifestFile): ManifestFile {
    this.manifestCache = manifest;
    this.manifestCacheLoadedAt = Date.now();
    this.explorerIndex = this.buildExplorerIndex(manifest);
    return manifest;
  }

  private isManifestCacheStale(maxAgeMs: number): boolean {
    if (!this.manifestCache) return true;
    return Date.now() - this.manifestCacheLoadedAt > maxAgeMs;
  }

  private buildDirectories(entries: EntryMetadata[]): EntryDirectory[] {
    const now = new Date().toISOString();
    const directories = new Map<string, EntryDirectory>();

    const ensureDirectory = (rawPath: string) => {
      const path = this.normalizeDirectoryPath(rawPath);
      if (directories.has(path)) return;

      const parentPath = this.getParentPath(path);
      const name = path ? path.split('/').pop() || path : 'Entries';

      directories.set(path, {
        path,
        name,
        parentPath,
        folderCount: 0,
        entryCount: 0,
        updatedAt: now,
      });

      if (path) {
        ensureDirectory(parentPath);
      }
    };

    ensureDirectory('');

    for (const entry of entries) {
      const parentPath = this.normalizeDirectoryPath(entry.parentPath);
      ensureDirectory(parentPath);

      const directParent = directories.get(parentPath);
      if (directParent) {
        directParent.entryCount += 1;
      }

      const chain = parentPath ? ['', ...parentPath.split('/').map((_, index, parts) => parts.slice(0, index + 1).join('/'))] : [''];
      for (const path of chain) {
        const dir = directories.get(path);
        if (dir && entry.updatedAt > dir.updatedAt) {
          dir.updatedAt = entry.updatedAt;
        }
      }

      if (entry.mediaIds && Array.isArray(entry.mediaIds)) {
        for (const mediaPath of entry.mediaIds) {
          const mediaParentPath = this.normalizeDirectoryPath(this.getParentPath(mediaPath));
          ensureDirectory(mediaParentPath);
          
          const mediaDir = directories.get(mediaParentPath);
          if (mediaDir) {
            mediaDir.entryCount += 1;
          }

          const mediaChain = mediaParentPath ? ['', ...mediaParentPath.split('/').map((_, index, parts) => parts.slice(0, index + 1).join('/'))] : [''];
          for (const path of mediaChain) {
            const dir = directories.get(path);
            if (dir && entry.updatedAt > dir.updatedAt) {
              dir.updatedAt = entry.updatedAt;
            }
          }
        }
      }
    }

    for (const dir of directories.values()) {
      if (!dir.path) continue;
      const parent = directories.get(dir.parentPath);
      if (parent) {
        parent.folderCount += 1;
      }
    }

    return [...directories.values()].sort((a, b) => a.path.localeCompare(b.path));
  }

  private normalizeManifestEntries(rawEntries: unknown[]): EntryMetadata[] {
    const normalized = rawEntries
      .map((item) => {
        if (!item || typeof item !== 'object') return null;

        const candidate = item as Partial<EntryMetadata>;
        const path = typeof candidate.path === 'string' ? candidate.path : '';
        const date = typeof candidate.date === 'string' ? candidate.date : '';

        if (!path || !date) return null;

        const parentPath = this.normalizeDirectoryPath(
          typeof candidate.parentPath === 'string' ? candidate.parentPath : this.getParentPath(path),
        );

        return {
          id: typeof candidate.id === 'string' && candidate.id ? candidate.id : path,
          path,
          name: typeof candidate.name === 'string' && candidate.name ? candidate.name : this.getEntryName(path),
          parentPath,
          title: resolveEntryTitle(typeof candidate.title === 'string' ? candidate.title : '', date),
          date,
          year: typeof candidate.year === 'string' && candidate.year ? candidate.year : this.getYearFromDate(date),
          updatedAt: typeof candidate.updatedAt === 'string' && candidate.updatedAt ? candidate.updatedAt : new Date().toISOString(),
          mediaIds: Array.isArray(candidate.mediaIds) ? candidate.mediaIds : [],
        };
      })
      .filter((entry): entry is EntryMetadata => Boolean(entry));

    return this.sortMetadata(normalized);
  }

  private createManifest(entries: EntryMetadata[]): ManifestFile {
    const sortedEntries = this.sortMetadata(entries);

    return {
      version: 3,
      updatedAt: new Date().toISOString(),
      entries: sortedEntries,
      directories: this.buildDirectories(sortedEntries),
    };
  }

  private async readManifest(): Promise<ManifestFile | null> {
    const bytes = await this.storage.downloadFile(MANIFEST_FILE);
    if (!bytes) return null;

    const decrypted = await decryptData(this.identity.secretKey, bytes);
    const parsed = JSON.parse(decrypted) as Partial<ManifestFile>;
    if (parsed.version !== 3) return null; // Force rebuild for new schema
    if (!Array.isArray(parsed.entries)) return null;

    const entries = this.normalizeManifestEntries(parsed.entries);

    return {
      version: parsed.version || 3,
      updatedAt: parsed.updatedAt || new Date().toISOString(),
      entries,
      directories: this.buildDirectories(entries),
    };
  }

  private async writeManifest(entries: EntryMetadata[]): Promise<ManifestFile> {
    const payload = this.createManifest(entries);

    const encrypted = await encryptData(this.identity.publicKey, JSON.stringify(payload));
    await this.storage.uploadFile(MANIFEST_FILE, encrypted);
    return this.setManifestCache(payload);
  }

  private async getManifest(forceRefresh = false): Promise<ManifestFile> {
    if (!forceRefresh && this.manifestCache) {
      return this.manifestCache;
    }

    if (this.manifestLoadPromise) {
      return this.manifestLoadPromise;
    }

    this.manifestLoadPromise = (async () => {
      const manifest = await this.readManifest();
      if (manifest) {
        return this.setManifestCache(manifest);
      }

      const entries = await this.rebuildManifest();
      if (this.manifestCache) {
        return this.manifestCache;
      }

      return this.setManifestCache(this.createManifest(entries));
    })();

    try {
      return await this.manifestLoadPromise;
    } finally {
      this.manifestLoadPromise = null;
    }
  }

  // Generate entry path depending on the date (e.g. 2024-04-08_12-30 -> 2024/2024-04-08_12-30.age)
  public static getEntryPath(dateStr: string): string {
    const year = dateStr.split('-')[0] || new Date().getFullYear().toString();
    return `${year}/${dateStr}.age`;
  }

  // Fetch top-level years dynamically directly from storage
  public async getYears(): Promise<string[]> {
    const files = await this.storage.listFiles('');
    // Filter to exactly 4 digits, which denote year folders
    return files.filter(f => /^\d{4}$/.test(f)).sort((a, b) => b.localeCompare(a)); // sort descending
  }

  // Fetch all file names under a specific year folder
  public async getEntriesForYear(year: string): Promise<string[]> {
    const files = await this.storage.listFiles(year);
    // files returned are prefixed with year (e.g. '2024/2024-04-08_12-30.age')
    // We filter for .age files.
    return files
      .filter(f => f.endsWith('.age') && f !== 'vault.age')
      .sort((a, b) => b.localeCompare(a)); // sort descending (latest first)
  }

  // Fetch and decrypt a specific entry by its path
  public async fetchEntry(path: string): Promise<JournalEntry | null> {
    const fileBytes = await this.storage.downloadFile(path);
    if (!fileBytes) return null;

    const decrypted = await decryptData(this.identity.secretKey, fileBytes);
    return JSON.parse(decrypted) as JournalEntry;
  }

  public async getEntryMetadata(): Promise<EntryMetadata[]> {
    const manifest = await this.getManifest();
    return manifest.entries;
  }

  public async getRawManifest() {
    return await this.getManifest();
  }

  public async refreshManifestIfStale(maxAgeMs = MANIFEST_CACHE_STALE_MS): Promise<boolean> {
    if (!this.isManifestCacheStale(maxAgeMs)) {
      return false;
    }

    await this.getManifest(true);
    return true;
  }

  public async getDirectoryListing(directoryPath = ''): Promise<DirectoryListing> {
    const manifest = await this.getManifest();
    const explorerIndex = this.explorerIndex ?? this.buildExplorerIndex(manifest);
    if (!this.explorerIndex) {
      this.explorerIndex = explorerIndex;
    }

    const normalizedPath = this.normalizeDirectoryPath(directoryPath);
    const currentPath = explorerIndex.knownPaths.has(normalizedPath) ? normalizedPath : '';

    return {
      currentPath,
      folders: [...(explorerIndex.foldersByParentPath.get(currentPath) ?? [])],
      entries: [...(explorerIndex.entriesByParentPath.get(currentPath) ?? [])],
      media: [...(explorerIndex.mediaByParentPath.get(currentPath) ?? [])],
    };
  }

  public async rebuildManifest(onProgress?: (msg: string) => void): Promise<EntryMetadata[]> {
    if (onProgress) onProgress('Scanning vault for year directories...');
    const years = await this.getYears();
    const entries: EntryMetadata[] = [];

    for (const year of years) {
      if (onProgress) onProgress(`Listing entries for year ${year}...`);
      const paths = await this.getEntriesForYear(year);

      let processed = 0;
      for (const path of paths) {
        processed++;
        if (onProgress) onProgress(`Decrypting entry: ${path} (${processed}/${paths.length})`);
        const entry = await this.fetchEntry(path);
        if (entry) {
          entries.push(this.toMetadata(entry, path));
        }
      }
    }

    if (onProgress) onProgress('Finalizing and encrypting new manifest...');
    const manifest = await this.writeManifest(entries);
    return manifest.entries;
  }

  // Encrypt and upload an entry to its correct path
  public async saveEntry(entry: JournalEntry): Promise<string> {
    const path = SyncEngine.getEntryPath(entry.date);
    const payload = JSON.stringify(entry);
    const encrypted = await encryptData(this.identity.publicKey, payload);
    
    await this.storage.uploadFile(path, encrypted);

    const manifest = await this.getManifest();

    const updatedEntries = manifest.entries.filter((item) => item.path !== path && item.id !== entry.id);
    updatedEntries.unshift(this.toMetadata(entry, path));
    await this.writeManifest(updatedEntries);

    return path;
  }

  public async deleteEntry(path: string): Promise<void> {
    await this.storage.deleteFile(path);

    const manifest = await this.getManifest();

    const updatedEntries = manifest.entries.filter((item) => item.path !== path);
    await this.writeManifest(updatedEntries);
  }
}
