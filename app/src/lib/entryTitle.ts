import dayjs from 'dayjs';

const ENTRY_TITLE_PATTERN = /^Entry For \d{2} [A-Za-z]{3}, '\d{2}$/;

export function parseEntryDate(value: string): Date | null {
  const match = /^(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const parsed = new Date(`${match[1]}T${match[2]}:${match[3]}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function buildDefaultEntryTitle(dateValue: string): string {
  const parsed = parseEntryDate(dateValue);
  const date = parsed ?? new Date();
  return `Entry For ${dayjs(date).format("DD MMM, 'YY")}`;
}

export function resolveEntryTitle(title: string | null | undefined, dateValue: string): string {
  const trimmed = title?.trim() ?? '';
  if (trimmed.length > 0) return trimmed;
  return buildDefaultEntryTitle(dateValue);
}

export function isDateSyncedEntryTitle(title: string, dateValue: string): boolean {
  const trimmed = title.trim();
  if (!ENTRY_TITLE_PATTERN.test(trimmed)) {
    return false;
  }

  return trimmed === buildDefaultEntryTitle(dateValue);
}