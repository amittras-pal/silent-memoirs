// Emotion taxonomy types

export interface Emotion {
  id: string;
  name: string;
  level: 'core' | 'secondary' | 'tertiary';
  parentId?: string;
  color: string;
}

export interface EmotionTree {
  core: Emotion;
  secondary: Array<Emotion & { tertiary: Emotion[] }>;
}

// Thought record types

export interface EmotionSelection {
  coreEmotion?: string;
  secondaryEmotion?: string;
  tertiaryEmotion?: string;
}

export interface EmotionIntensity {
  emotionId: string;
  intensity: number;
}

export interface ThoughtRecord {
  id: string;
  dateTime: Date;
  situation: string;
  automaticThoughts: string;
  emotionIntensity: number;
  emotionIntensities?: EmotionIntensity[];
  emotionSelections?: EmotionSelection[];
  coreEmotion?: string;
  secondaryEmotion?: string;
  tertiaryEmotion?: string;
}

export interface EmotionBookYearFile {
  version: 1;
  year: string;
  updatedAt: string;
  records: ThoughtRecord[];
}

// Constants

export const MAX_EMOTION_SELECTIONS = 5;
export const MIN_EMOTION_INTENSITY = 0;
export const MAX_EMOTION_INTENSITY = 100;
export const DEFAULT_EMOTION_INTENSITY = 50;

// Utility functions

type ThoughtRecordEmotionShape = Pick<
  ThoughtRecord,
  'emotionSelections' | 'coreEmotion' | 'secondaryEmotion' | 'tertiaryEmotion'
>;

type ThoughtRecordIntensityShape = Pick<
  ThoughtRecord,
  | 'emotionIntensity'
  | 'emotionIntensities'
  | 'emotionSelections'
  | 'coreEmotion'
  | 'secondaryEmotion'
  | 'tertiaryEmotion'
>;

function sanitizeEmotionId(emotionId?: string): string | undefined {
  const trimmed = emotionId?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeEmotionIntensityValue(
  intensity: number | string | null | undefined
): number | null {
  const numericIntensity = Number(intensity);
  if (!Number.isFinite(numericIntensity)) {
    return null;
  }
  const roundedIntensity = Math.round(numericIntensity);
  return Math.min(MAX_EMOTION_INTENSITY, Math.max(MIN_EMOTION_INTENSITY, roundedIntensity));
}

export function normalizeEmotionIntensities(
  intensities?: EmotionIntensity[] | null
): EmotionIntensity[] {
  if (!Array.isArray(intensities)) {
    return [];
  }

  const uniqueIntensities = new Map<string, number>();
  for (const entry of intensities) {
    const emotionId = sanitizeEmotionId(entry?.emotionId);
    const intensity = normalizeEmotionIntensityValue(entry?.intensity);
    if (!emotionId || intensity === null || uniqueIntensities.has(emotionId)) {
      continue;
    }
    uniqueIntensities.set(emotionId, intensity);
    if (uniqueIntensities.size >= MAX_EMOTION_SELECTIONS) break;
  }

  return Array.from(uniqueIntensities.entries()).map(([emotionId, intensity]) => ({
    emotionId,
    intensity,
  }));
}

export function normalizeEmotionSelection(
  selection?: EmotionSelection | null
): EmotionSelection | null {
  if (!selection) return null;

  const coreEmotion = sanitizeEmotionId(selection.coreEmotion);
  const secondaryEmotion = sanitizeEmotionId(selection.secondaryEmotion);
  const tertiaryEmotion = sanitizeEmotionId(selection.tertiaryEmotion);

  if (!coreEmotion && !secondaryEmotion && !tertiaryEmotion) return null;

  return {
    ...(coreEmotion ? { coreEmotion } : {}),
    ...(secondaryEmotion ? { secondaryEmotion } : {}),
    ...(tertiaryEmotion ? { tertiaryEmotion } : {}),
  };
}

export function getMostSpecificEmotionId(
  selection?: EmotionSelection | null
): string | null {
  const normalized = normalizeEmotionSelection(selection);
  if (!normalized) return null;
  return normalized.tertiaryEmotion || normalized.secondaryEmotion || normalized.coreEmotion || null;
}

export function normalizeEmotionSelections(
  selections?: EmotionSelection[] | null
): EmotionSelection[] {
  if (!Array.isArray(selections)) return [];

  const uniqueSelections = new Map<string, EmotionSelection>();
  for (const selection of selections) {
    const normalized = normalizeEmotionSelection(selection);
    if (!normalized) continue;
    const key = getMostSpecificEmotionId(normalized);
    if (!key || uniqueSelections.has(key)) continue;
    uniqueSelections.set(key, normalized);
    if (uniqueSelections.size >= MAX_EMOTION_SELECTIONS) break;
  }

  return Array.from(uniqueSelections.values());
}

export function alignEmotionIntensitiesWithSelections(
  selections?: EmotionSelection[] | null,
  intensities?: EmotionIntensity[] | null,
  fallbackIntensity: number = DEFAULT_EMOTION_INTENSITY
): EmotionIntensity[] {
  const normalizedSelections = normalizeEmotionSelections(selections);
  if (normalizedSelections.length === 0) return [];

  const normalizedFallback =
    normalizeEmotionIntensityValue(fallbackIntensity) ?? DEFAULT_EMOTION_INTENSITY;
  const intensityByEmotionId = new Map(
    normalizeEmotionIntensities(intensities).map((e) => [e.emotionId, e.intensity] as const)
  );

  return normalizedSelections
    .map((s) => getMostSpecificEmotionId(s))
    .filter((id): id is string => !!id)
    .map((emotionId) => ({
      emotionId,
      intensity: intensityByEmotionId.get(emotionId) ?? normalizedFallback,
    }));
}

export function calculateAverageEmotionIntensity(
  intensities?: EmotionIntensity[] | null,
  fallbackIntensity: number = DEFAULT_EMOTION_INTENSITY
): number {
  const normalized = normalizeEmotionIntensities(intensities);
  if (normalized.length === 0) {
    return normalizeEmotionIntensityValue(fallbackIntensity) ?? DEFAULT_EMOTION_INTENSITY;
  }
  const total = normalized.reduce((sum, e) => sum + e.intensity, 0);
  return Math.round(total / normalized.length);
}

export function getRecordEmotionSelections(
  record?: ThoughtRecordEmotionShape | null
): EmotionSelection[] {
  if (!record) return [];

  const normalizedSelections = normalizeEmotionSelections(record.emotionSelections);
  if (normalizedSelections.length > 0) return normalizedSelections;

  const legacySelection = normalizeEmotionSelection({
    coreEmotion: record.coreEmotion,
    secondaryEmotion: record.secondaryEmotion,
    tertiaryEmotion: record.tertiaryEmotion,
  });

  return legacySelection ? [legacySelection] : [];
}

export function getRecordEmotionIntensities(
  record?: ThoughtRecordIntensityShape | null
): EmotionIntensity[] {
  if (!record) return [];
  const fallbackIntensity =
    normalizeEmotionIntensityValue(record.emotionIntensity) ?? DEFAULT_EMOTION_INTENSITY;
  return alignEmotionIntensitiesWithSelections(
    getRecordEmotionSelections(record),
    record.emotionIntensities,
    fallbackIntensity
  );
}

export function getEmotionIntensityForSelection(
  record: ThoughtRecordIntensityShape | null | undefined,
  selection?: EmotionSelection | null
): number {
  const fallbackIntensity =
    normalizeEmotionIntensityValue(record?.emotionIntensity) ?? DEFAULT_EMOTION_INTENSITY;
  const emotionId = getMostSpecificEmotionId(selection);
  if (!emotionId) return fallbackIntensity;

  const entry = getRecordEmotionIntensities(record).find((e) => e.emotionId === emotionId);
  return entry?.intensity ?? fallbackIntensity;
}

export function getPrimaryEmotionSelection(
  record?: ThoughtRecordEmotionShape | null
): EmotionSelection | undefined {
  return getRecordEmotionSelections(record)[0];
}
