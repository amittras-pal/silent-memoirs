import type { StorageProvider } from '../../lib/storage';
import { encryptData, decryptData, type AgeIdentity } from '../../lib/crypto';
import type { ThoughtRecord, EmotionBookYearFile } from './types';
import {
  normalizeEmotionSelections,
  normalizeEmotionIntensities,
  getRecordEmotionSelections,
} from './types';

const EMOTIONBOOK_DIR = 'emotionbook';

function serializeRecords(records: ThoughtRecord[]): ThoughtRecord[] {
  return records.map((r) => ({
    ...r,
    dateTime: r.dateTime instanceof Date ? r.dateTime : new Date(r.dateTime),
  }));
}

function deserializeRecords(records: ThoughtRecord[]): ThoughtRecord[] {
  return records
    .map((r) => ({
      ...r,
      dateTime: new Date(r.dateTime),
    }))
    .filter((r) => !isNaN(r.dateTime.getTime()))
    .sort((a, b) => b.dateTime.getTime() - a.dateTime.getTime());
}

export class EmotionBookSyncAdapter {
  private storage: StorageProvider;
  private identity: AgeIdentity;

  constructor(storage: StorageProvider, identity: AgeIdentity) {
    this.storage = storage;
    this.identity = identity;
  }

  async listYears(): Promise<string[]> {
    const items = await this.storage.listDirectoryItems(EMOTIONBOOK_DIR);
    return items
      .filter((item) => !item.isFolder && /^\d{4}\.age$/.test(item.name))
      .map((item) => item.name.replace('.age', ''))
      .sort((a, b) => Number(b) - Number(a));
  }

  async loadYear(year: string): Promise<ThoughtRecord[]> {
    const path = `${EMOTIONBOOK_DIR}/${year}.age`;
    const encrypted = await this.storage.downloadFile(path);
    if (!encrypted) return [];

    const json = await decryptData(this.identity.secretKey, encrypted);
    const parsed = JSON.parse(json) as EmotionBookYearFile;
    return deserializeRecords(parsed.records);
  }

  async saveYear(year: string, records: ThoughtRecord[]): Promise<void> {
    await this.ensureDirectory();
    const path = `${EMOTIONBOOK_DIR}/${year}.age`;

    const yearFile: EmotionBookYearFile = {
      version: 1,
      year,
      updatedAt: new Date().toISOString(),
      records: serializeRecords(records).sort(
        (a, b) => b.dateTime.getTime() - a.dateTime.getTime()
      ),
    };

    const json = JSON.stringify(yearFile);
    const encrypted = await encryptData(this.identity.publicKey, json);
    await this.storage.uploadFile(path, encrypted);
  }

  async deleteRecord(record: ThoughtRecord): Promise<void> {
    const year = String(new Date(record.dateTime).getFullYear());
    const records = await this.loadYear(year);
    const filtered = records.filter((r) => r.id !== record.id);

    if (filtered.length === 0) {
      await this.storage.deleteFile(`${EMOTIONBOOK_DIR}/${year}.age`);
    } else {
      await this.saveYear(year, filtered);
    }
  }

  async exportAll(): Promise<ThoughtRecord[]> {
    const years = await this.listYears();
    const allRecords: ThoughtRecord[] = [];
    for (const year of years) {
      const records = await this.loadYear(year);
      allRecords.push(...records);
    }
    return allRecords.sort((a, b) => b.dateTime.getTime() - a.dateTime.getTime());
  }

  async importAll(
    records: ThoughtRecord[]
  ): Promise<{ imported: number; skipped: number }> {
    let imported = 0;
    let skipped = 0;

    const validated = records.filter((r) => {
      if (!r.id || !r.dateTime || !r.situation) {
        skipped++;
        return false;
      }
      const dt = new Date(r.dateTime);
      if (isNaN(dt.getTime())) {
        skipped++;
        return false;
      }
      return true;
    });

    // Normalize each record
    const normalized = validated.map((r) => {
      const dt = new Date(r.dateTime);
      const selections = normalizeEmotionSelections(r.emotionSelections);
      const intensities = normalizeEmotionIntensities(r.emotionIntensities);
      const legacySelections = getRecordEmotionSelections(r);
      const primarySelection = (selections.length > 0 ? selections : legacySelections)[0];

      return {
        ...r,
        dateTime: dt,
        emotionSelections: selections.length > 0 ? selections : legacySelections,
        emotionIntensities: intensities,
        coreEmotion: primarySelection?.coreEmotion,
        secondaryEmotion: primarySelection?.secondaryEmotion,
        tertiaryEmotion: primarySelection?.tertiaryEmotion,
      };
    });

    // Partition by year
    const byYear = new Map<string, ThoughtRecord[]>();
    for (const record of normalized) {
      const year = String(record.dateTime.getFullYear());
      if (!byYear.has(year)) byYear.set(year, []);
      byYear.get(year)!.push(record);
    }

    for (const [year, incoming] of byYear) {
      const existing = await this.loadYear(year);
      const existingIds = new Set(existing.map((r) => r.id));

      const newRecords: ThoughtRecord[] = [];
      for (const record of incoming) {
        if (existingIds.has(record.id)) {
          skipped++;
        } else {
          newRecords.push(record);
          imported++;
        }
      }

      if (newRecords.length > 0) {
        await this.saveYear(year, [...existing, ...newRecords]);
      }
    }

    return { imported, skipped };
  }

  private async ensureDirectory(): Promise<void> {
    const items = await this.storage.listDirectoryItems('');
    const hasDir = items.some(
      (item) => item.isFolder && item.name === EMOTIONBOOK_DIR
    );
    if (!hasDir) {
      // Uploading a file inside the directory will auto-create it via ensurePathFolders
      // But we can trigger creation by listing — the folder is created on first saveYear
      // via uploadFile which calls ensurePathFolders internally.
    }
  }
}
