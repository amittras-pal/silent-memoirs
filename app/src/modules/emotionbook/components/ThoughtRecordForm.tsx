import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Group,
  Modal,
  SegmentedControl,
  Slider,
  Stack,
  Text,
  Textarea,
} from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import { EmotionWheel } from './EmotionWheel';
import { useEmotionTaxonomy } from '../useEmotionTaxonomy';
import type { EmotionSelection, EmotionIntensity, ThoughtRecord } from '../types';
import {
  getMostSpecificEmotionId,
  getRecordEmotionSelections,
  getRecordEmotionIntensities,
  DEFAULT_EMOTION_INTENSITY,
  MIN_EMOTION_INTENSITY,
  MAX_EMOTION_INTENSITY,
  MAX_EMOTION_SELECTIONS,
} from '../types';

interface Props {
  opened: boolean;
  onClose: () => void;
  onSubmit: (record: Omit<ThoughtRecord, 'id'> | ThoughtRecord) => void;
  editRecord?: ThoughtRecord;
}

export function ThoughtRecordForm({ opened, onClose, onSubmit, editRecord }: Props) {
  const taxonomy = useEmotionTaxonomy();

  const isEditMode = !!editRecord;

  const [dateTime, setDateTime] = useState<Date>(
    editRecord ? new Date(editRecord.dateTime) : new Date()
  );
  const [situation, setSituation] = useState(editRecord?.situation ?? '');
  const [automaticThoughts, setAutomaticThoughts] = useState(editRecord?.automaticThoughts ?? '');
  const [selectMode, setSelectMode] = useState<'single' | 'multi'>('multi');

  const initialSelections = useMemo(
    () => (editRecord ? getRecordEmotionSelections(editRecord) : []),
    [editRecord]
  );

  const initialIntensities = useMemo(() => {
    if (!editRecord) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const entry of getRecordEmotionIntensities(editRecord)) {
      map.set(entry.emotionId, entry.intensity);
    }
    return map;
  }, [editRecord]);

  const [selections, setSelections] = useState<EmotionSelection[]>(initialSelections);
  const [intensities, setIntensities] = useState<Map<string, number>>(initialIntensities);

  // Reset form state when the modal opens or editRecord changes
  useEffect(() => {
    if (opened) {
      setDateTime(editRecord ? new Date(editRecord.dateTime) : new Date());
      setSituation(editRecord?.situation ?? '');
      setAutomaticThoughts(editRecord?.automaticThoughts ?? '');
      setSelections(initialSelections);
      setIntensities(initialIntensities);
      setSelectMode('multi');
    }
  }, [opened, editRecord, initialSelections, initialIntensities]);

  const handleSelectionsChange = useCallback(
    (newSelections: EmotionSelection[]) => {
      setSelections(newSelections);
      // Preserve existing intensities, add defaults for new
      setIntensities((prev) => {
        const next = new Map(prev);
        for (const s of newSelections) {
          const id = getMostSpecificEmotionId(s);
          if (id && !next.has(id)) {
            next.set(id, DEFAULT_EMOTION_INTENSITY);
          }
        }
        // Remove intensities for removed selections
        const activeIds = new Set(
          newSelections.map((s) => getMostSpecificEmotionId(s)).filter(Boolean)
        );
        for (const key of next.keys()) {
          if (!activeIds.has(key)) next.delete(key);
        }
        return next;
      });
    },
    []
  );

  const handleIntensityChange = useCallback((emotionId: string, value: number) => {
    setIntensities((prev) => {
      const next = new Map(prev);
      next.set(emotionId, value);
      return next;
    });
  }, []);

  const canSubmit = situation.trim().length > 0 && selections.length > 0;

  const handleSubmit = useCallback(() => {
    const emotionIntensities: EmotionIntensity[] = selections
      .map((s) => getMostSpecificEmotionId(s))
      .filter((id): id is string => !!id)
      .map((emotionId) => ({
        emotionId,
        intensity: intensities.get(emotionId) ?? DEFAULT_EMOTION_INTENSITY,
      }));

    const avgIntensity =
      emotionIntensities.length > 0
        ? Math.round(
            emotionIntensities.reduce((sum, e) => sum + e.intensity, 0) /
              emotionIntensities.length
          )
        : DEFAULT_EMOTION_INTENSITY;

    const primarySelection = selections[0];
    const record: Omit<ThoughtRecord, 'id'> = {
      dateTime,
      situation: situation.trim(),
      automaticThoughts: automaticThoughts.trim(),
      emotionIntensity: avgIntensity,
      emotionIntensities,
      emotionSelections: selections,
      coreEmotion: primarySelection?.coreEmotion,
      secondaryEmotion: primarySelection?.secondaryEmotion,
      tertiaryEmotion: primarySelection?.tertiaryEmotion,
    };

    if (editRecord) {
      onSubmit({ ...record, id: editRecord.id });
    } else {
      onSubmit(record);
    }

    onClose();
  }, [dateTime, situation, automaticThoughts, selections, intensities, editRecord, onSubmit, onClose]);

  // Reset form on open
  const handleClose = useCallback(() => {
    if (!editRecord) {
      setSituation('');
      setAutomaticThoughts('');
      setSelections([]);
      setIntensities(new Map());
      setDateTime(new Date());
    }
    onClose();
  }, [editRecord, onClose]);

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={isEditMode ? 'Edit Thought Record' : 'New Thought Record'}
      fullScreen
      styles={{ body: { overflowY: 'auto' } }}
    >
      <Stack gap="md" maw={700} mx="auto">
        <DateTimePicker
          label="When did this happen?"
          value={dateTime}
          onChange={(v) => v && setDateTime(new Date(v))}
          maxDate={new Date()}
        />

        <Textarea
          label="Situation"
          placeholder="What was happening?"
          value={situation}
          onChange={(e) => setSituation(e.currentTarget.value)}
          minRows={3}
          autosize
          maxRows={6}
        />

        <Textarea
          label="Automatic Thoughts"
          placeholder="What went through your mind?"
          value={automaticThoughts}
          onChange={(e) => setAutomaticThoughts(e.currentTarget.value)}
          minRows={3}
          autosize
          maxRows={6}
        />

        <Group justify="space-between" align="center">
          <Text size="sm" fw={500}>
            Emotion Selection Mode
          </Text>
          <SegmentedControl
            size="xs"
            data={[
              { value: 'multi', label: 'Multi' },
              { value: 'single', label: 'Single' },
            ]}
            value={selectMode}
            onChange={(v) => {
              const mode = v as 'single' | 'multi';
              setSelectMode(mode);
              if (mode === 'single' && selections.length > 1) {
                handleSelectionsChange([selections[selections.length - 1]]);
              }
            }}
          />
        </Group>

        <EmotionWheel
          selections={selections}
          onChange={handleSelectionsChange}
          mode={selectMode}
          maxSelections={MAX_EMOTION_SELECTIONS}
        />

        {selections.length > 0 && (
          <Stack gap="sm">
            <Text size="sm" fw={500}>
              Intensity per emotion
            </Text>
            {selections.map((s) => {
              const emotionId = getMostSpecificEmotionId(s);
              if (!emotionId) return null;
              const label = taxonomy.getEmotionLabel(emotionId);
              const color = taxonomy.getEmotionColor(emotionId);
              const value = intensities.get(emotionId) ?? DEFAULT_EMOTION_INTENSITY;
              return (
                <div key={emotionId}>
                  <Text size="xs" mb={4}>
                    {label}: {value}
                  </Text>
                  <Slider
                    value={value}
                    onChange={(v) => handleIntensityChange(emotionId, v)}
                    min={MIN_EMOTION_INTENSITY}
                    max={MAX_EMOTION_INTENSITY}
                    step={1}
                    mb={"md"}
                    marks={[
                      { value: 10, label: '' },
                      { value: 20, label: '' },
                      { value: 30, label: '' },
                      { value: 40, label: '' },
                      { value: 50, label: '' },
                      { value: 60, label: '' },
                      { value: 70, label: '' },
                      { value: 80, label: '' },
                      { value: 90, label: '' },
                      { value: 100, label: '' },
                    ]}
                    color={color}
                  />
                </div>
              );
            })}
          </Stack>
        )}

        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {isEditMode ? 'Update' : 'Save'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
