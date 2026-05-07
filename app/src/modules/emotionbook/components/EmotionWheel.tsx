import { useCallback, useMemo, useRef, useState } from 'react';
import { ActionIcon, Group, Stack, Text } from '@mantine/core';
import { IconChevronUp, IconChevronDown } from '@tabler/icons-react';
import type { EChartsOption } from 'echarts';
import ReactECharts from 'echarts-for-react';
import { useEmotionTaxonomy, type SunburstNode } from '../useEmotionTaxonomy';
import type { EmotionSelection } from '../types';
import {
  getMostSpecificEmotionId,
  normalizeEmotionSelection,
  normalizeEmotionSelections,
  MAX_EMOTION_SELECTIONS,
} from '../types';

interface Props {
  selections: EmotionSelection[];
  onChange: (selections: EmotionSelection[]) => void;
  maxSelections?: number;
  mode: 'single' | 'multi';
}

type ChartLevel = 'core' | 'secondary' | 'tertiary';

/** Degrees to rotate the wheel per button click */
const ROTATION_STEP = 45;
/** Full chart canvas size (the center is placed at the left edge of the visible area) */
const CHART_SIZE = 500;
const INNER_RADIUS = 25;
const OUTER_RADIUS = 245;
const LEVEL_BAND = Math.floor((OUTER_RADIUS - INNER_RADIUS) / 3);

function getSelectedNodeIds(selections: EmotionSelection[]): Set<string> {
  const ids = new Set<string>();
  for (const s of selections) {
    if (s.coreEmotion) ids.add(s.coreEmotion);
    if (s.secondaryEmotion) ids.add(s.secondaryEmotion);
    if (s.tertiaryEmotion) ids.add(s.tertiaryEmotion);
  }
  return ids;
}

function applyNodeStyling(
  node: SunburstNode,
  selectedIds: Set<string>,
  hasSelection: boolean
): SunburstNode {
  const isSelected = selectedIds.has(node.id);
  const isFaded = hasSelection && !isSelected;

  return {
    ...node,
    itemStyle: {
      ...node.itemStyle,
      opacity: isFaded ? 0.2 : 1,
      shadowBlur: isSelected ? 10 : 0,
      shadowColor: isSelected ? 'rgba(0, 0, 0, 0.5)' : 'transparent',
    },
    ...(hasSelection ? { label: { opacity: 1, color: isFaded ? '#999' : '#fff' } } : {}),
    children: node.children?.map((c) => applyNodeStyling(c, selectedIds, hasSelection)),
  };
}

export function EmotionWheel({ selections, onChange, maxSelections = MAX_EMOTION_SELECTIONS, mode }: Props) {
  const chartRef = useRef<ReactECharts | null>(null);
  const { getEmotion, buildSunburstData } = useEmotionTaxonomy();
  const rawData = useMemo(() => buildSunburstData(), [buildSunburstData]);
  const [startAngle, setStartAngle] = useState(90);

  const selectedIds = useMemo(() => getSelectedNodeIds(selections), [selections]);

  const styledData = useMemo(() => {
    const hasSelection = selectedIds.size > 0;
    return rawData.map((n) => applyNodeStyling(n, selectedIds, hasSelection));
  }, [rawData, selectedIds]);

  const chartOption: EChartsOption = useMemo(
    () => ({
      animation: true,
      animationDurationUpdate: 300,
      series: [
        {
          type: 'sunburst',
          nodeClick: false,
          data: styledData,
          center: ['50%', '50%'],
          radius: [INNER_RADIUS, OUTER_RADIUS],
          startAngle,
          sort: undefined,
          label: { rotate: 'radial', fontSize: 12, fontWeight: 500 },
          itemStyle: { borderWidth: 1, borderColor: '#ffffff', borderRadius: 4 },
          emphasis: {
            focus: 'ancestor',
            itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0, 0, 0, 0.5)' },
          },
          levels: [
            {},
            {
              r0: INNER_RADIUS,
              r: INNER_RADIUS + LEVEL_BAND,
              label: { fontSize: 14, fontWeight: 600 },
            },
            {
              r0: INNER_RADIUS + LEVEL_BAND,
              r: INNER_RADIUS + LEVEL_BAND * 2,
              label: { fontSize: 12 },
            },
            {
              r0: INNER_RADIUS + LEVEL_BAND * 2,
              r: OUTER_RADIUS,
              label: { fontSize: 10 },
            },
          ],
        },
      ],
    }),
    [styledData, startAngle]
  );

  const buildSelection = useCallback(
    (level: ChartLevel, emotionId: string): EmotionSelection | null => {
      if (level === 'core') {
        return normalizeEmotionSelection({ coreEmotion: emotionId });
      }
      if (level === 'secondary') {
        const sec = getEmotion(emotionId);
        const core = sec?.parentId ? getEmotion(sec.parentId) : undefined;
        return normalizeEmotionSelection({ coreEmotion: core?.id, secondaryEmotion: sec?.id });
      }
      const ter = getEmotion(emotionId);
      const sec = ter?.parentId ? getEmotion(ter.parentId) : undefined;
      const core = sec?.parentId ? getEmotion(sec.parentId) : undefined;
      return normalizeEmotionSelection({
        coreEmotion: core?.id,
        secondaryEmotion: sec?.id,
        tertiaryEmotion: ter?.id,
      });
    },
    [getEmotion]
  );

  const handleClick = useCallback(
    (event: { data?: any }) => {
      const level = event.data?.level as ChartLevel | undefined;
      const emotionId = event.data?.emotionId as string | undefined;
      if (!level || !emotionId) return;

      const nextSelection = buildSelection(level, emotionId);
      if (!nextSelection) return;

      const nextId = getMostSpecificEmotionId(nextSelection);
      if (!nextId) return;

      let updated: EmotionSelection[];

      if (mode === 'multi') {
        const existingIdx = selections.findIndex(
          (s) => getMostSpecificEmotionId(s) === nextId
        );
        if (existingIdx >= 0) {
          updated = selections.filter((_, i) => i !== existingIdx);
        } else {
          if (selections.length >= maxSelections) return;
          updated = [...selections, nextSelection];
        }
      } else {
        updated = [nextSelection];
      }

      onChange(normalizeEmotionSelections(updated));
    },
    [buildSelection, mode, selections, maxSelections, onChange]
  );

  const rotateUp = useCallback(() => {
    setStartAngle((a) => a + ROTATION_STEP);
  }, []);

  const rotateDown = useCallback(() => {
    setStartAngle((a) => a - ROTATION_STEP);
  }, []);

  return (
    <div>
      <Group justify="space-between" mb="xs">
        <Text size="sm" fw={500}>
          Emotion Wheel{' '}
          {mode === 'multi' && (
            <Text component="span" size="xs" c="dimmed">
              ({selections.length}/{maxSelections})
            </Text>
          )}
        </Text>
      </Group>
      <div style={{ position: 'relative', overflow: 'hidden', height: CHART_SIZE }}>
        <ReactECharts
          ref={chartRef}
          option={chartOption}
          style={{
            width: CHART_SIZE,
            height: CHART_SIZE,
            position: 'absolute',
            left: -(CHART_SIZE / 2),
            top: 0,
          }}
          onEvents={{ click: handleClick }}
          opts={{ renderer: 'canvas' }}
        />
        <Stack
          pos="absolute"
          top="50%"
          right="25%"
          gap="xs"
          style={{ transform: 'translateY(-50%)' }}
        >
          <ActionIcon variant="default" size="xl" radius="xl" onClick={rotateUp}>
            <IconChevronUp size={22} />
          </ActionIcon>
          <ActionIcon variant="default" size="xl" radius="xl" onClick={rotateDown}>
            <IconChevronDown size={22} />
          </ActionIcon>
        </Stack>
      </div>
    </div>
  );
}
