import type { StorageProvider, JournalEntry } from './storage';
import type { AgeIdentity } from './crypto';
import { encryptData, decryptData } from './crypto';

export class SyncEngine {
  private storage: StorageProvider;
  private identity: AgeIdentity;

  constructor(storage: StorageProvider, identity: AgeIdentity) {
    this.storage = storage;
    this.identity = identity;
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

  // Encrypt and upload an entry to its correct path
  public async saveEntry(entry: JournalEntry): Promise<string> {
    const path = SyncEngine.getEntryPath(entry.date);
    const payload = JSON.stringify(entry);
    const encrypted = await encryptData(this.identity.publicKey, payload);
    
    await this.storage.uploadFile(path, encrypted);
    return path;
  }

  public async deleteEntry(path: string): Promise<void> {
    await this.storage.deleteFile(path);
  }
}
