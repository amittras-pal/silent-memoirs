import { useMemo } from 'react';
import emotionsData from './assets/emotions.json';
import type { Emotion } from './types';

interface EmotionData {
  id: string;
  name: string;
  level: string;
  color: string;
  parentId?: string;
  secondary?: Array<{
    id: string;
    name: string;
    level: string;
    parentId: string;
    color: string;
    tertiary: Array<{
      id: string;
      name: string;
      level: string;
      parentId: string;
      color: string;
    }>;
  }>;
}

export interface SunburstNode {
  id: string;
  name: string;
  value: number;
  itemStyle: { color: string; opacity?: number; shadowBlur?: number; shadowColor?: string };
  emotionId: string;
  level: 'core' | 'secondary' | 'tertiary';
  label?: { opacity?: number; color?: string };
  children?: SunburstNode[];
}

export function useEmotionTaxonomy() {
  const { emotionsMap, coreEmotions } = useMemo(() => {
    const map = new Map<string, Emotion>();
    const cores: Emotion[] = [];
    const data = (emotionsData as { emotions: EmotionData[] }).emotions;

    data.forEach((coreEmotion) => {
      const core: Emotion = {
        id: coreEmotion.id,
        name: coreEmotion.name,
        level: 'core',
        color: coreEmotion.color,
      };
      map.set(core.id, core);
      cores.push(core);

      coreEmotion.secondary?.forEach((sec) => {
        const secondary: Emotion = {
          id: sec.id,
          name: sec.name,
          level: 'secondary',
          parentId: sec.parentId,
          color: sec.color,
        };
        map.set(secondary.id, secondary);

        sec.tertiary?.forEach((ter) => {
          const tertiary: Emotion = {
            id: ter.id,
            name: ter.name,
            level: 'tertiary',
            parentId: ter.parentId,
            color: ter.color,
          };
          map.set(tertiary.id, tertiary);
        });
      });
    });

    return { emotionsMap: map, coreEmotions: cores };
  }, []);

  const getEmotion = useMemo(
    () => (id: string) => emotionsMap.get(id),
    [emotionsMap]
  );

  const getChildren = useMemo(
    () => (parentId: string) =>
      Array.from(emotionsMap.values()).filter((e) => e.parentId === parentId),
    [emotionsMap]
  );

  const getChain = useMemo(
    () => (emotionId: string): Emotion[] => {
      const chain: Emotion[] = [];
      let current = emotionsMap.get(emotionId);
      while (current) {
        chain.unshift(current);
        current = current.parentId ? emotionsMap.get(current.parentId) : undefined;
      }
      return chain;
    },
    [emotionsMap]
  );

  const getEmotionLabel = useMemo(
    () => (emotionId: string) => emotionsMap.get(emotionId)?.name ?? emotionId,
    [emotionsMap]
  );

  const getEmotionColor = useMemo(
    () => (emotionId: string): string => {
      let current = emotionsMap.get(emotionId);
      while (current) {
        if (current.level === 'core') return current.color;
        current = current.parentId ? emotionsMap.get(current.parentId) : undefined;
      }
      return '#888888';
    },
    [emotionsMap]
  );

  const getEmotionChainFromSelection = useMemo(
    () =>
      (selection: {
        coreEmotion?: string;
        secondaryEmotion?: string;
        tertiaryEmotion?: string;
      }): Emotion[] => {
        const chain: Emotion[] = [];
        if (selection.coreEmotion) {
          const e = emotionsMap.get(selection.coreEmotion);
          if (e) chain.push(e);
        }
        if (selection.secondaryEmotion) {
          const e = emotionsMap.get(selection.secondaryEmotion);
          if (e) chain.push(e);
        }
        if (selection.tertiaryEmotion) {
          const e = emotionsMap.get(selection.tertiaryEmotion);
          if (e) chain.push(e);
        }
        return chain;
      },
    [emotionsMap]
  );

  const getMostSpecificEmotionFromSelection = useMemo(
    () =>
      (selection?: {
        coreEmotion?: string;
        secondaryEmotion?: string;
        tertiaryEmotion?: string;
      } | null): Emotion | undefined => {
        if (!selection) return undefined;
        const id =
          selection.tertiaryEmotion ||
          selection.secondaryEmotion ||
          selection.coreEmotion;
        return id ? emotionsMap.get(id) : undefined;
      },
    [emotionsMap]
  );

  const buildSunburstData = useMemo(
    () => (): SunburstNode[] => {
      return coreEmotions.map((core) => {
        const secondaryEmotions = getChildren(core.id);
        const secondaryNodes: SunburstNode[] = secondaryEmotions.map((sec) => {
          const tertiaryEmotions = getChildren(sec.id);
          return {
            id: sec.id,
            name: sec.name,
            value: tertiaryEmotions.length || 1,
            itemStyle: { color: sec.color },
            emotionId: sec.id,
            level: 'secondary' as const,
            children: tertiaryEmotions.map((ter) => ({
              id: ter.id,
              name: ter.name,
              value: 1,
              itemStyle: { color: ter.color },
              emotionId: ter.id,
              level: 'tertiary' as const,
            })),
          };
        });

        return {
          id: core.id,
          name: core.name,
          value: secondaryNodes.reduce((sum, c) => sum + c.value, 0) || 1,
          itemStyle: { color: core.color },
          emotionId: core.id,
          level: 'core' as const,
          children: secondaryNodes,
        };
      });
    },
    [coreEmotions, getChildren]
  );

  return {
    emotions: Array.from(emotionsMap.values()),
    coreEmotions,
    getEmotion,
    getChildren,
    getChain,
    getEmotionLabel,
    getEmotionColor,
    getEmotionChainFromSelection,
    getMostSpecificEmotionFromSelection,
    buildSunburstData,
  };
}
