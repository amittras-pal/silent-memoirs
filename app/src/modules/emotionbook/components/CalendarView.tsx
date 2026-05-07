import { useMemo } from 'react';
import { ActionIcon, Badge, Card, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { useEmotionTaxonomy } from '../useEmotionTaxonomy';
import type { ThoughtRecord } from '../types';
import { getRecordEmotionSelections, getEmotionIntensityForSelection } from '../types';
import { EmotionRecordCard } from './EmotionRecordCard';

interface Props {
  records: ThoughtRecord[];
  currentMonth: Date;
  selectedDay: Date | null;
  onNavigateMonth: (direction: -1 | 1) => void;
  onSelectDay: (date: Date) => void;
  dayRecords: ThoughtRecord[];
  onEditRecord: (record: ThoughtRecord) => void;
  onDeleteRecord: (record: ThoughtRecord) => void;
}

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  emotionData: { color: string; intensity: number }[];
  hasRecords: boolean;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function CalendarView({
  records,
  currentMonth,
  selectedDay,
  onNavigateMonth,
  onSelectDay,
  dayRecords,
  onEditRecord,
  onDeleteRecord,
}: Props) {
  const taxonomy = useEmotionTaxonomy();

  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDow = firstDay.getDay();
    const daysInMonth = lastDay.getDate();

    const days: CalendarDay[] = [];

    // Previous month
    const prevLast = new Date(year, month, 0).getDate();
    for (let i = startDow - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, prevLast - i);
      days.push(buildDay(d, false, records, taxonomy));
    }

    // Current month
    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(year, month, i);
      days.push(buildDay(d, true, records, taxonomy));
    }

    // Next month padding
    const remaining = days.length % 7 === 0 ? 0 : 7 - (days.length % 7);
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      days.push(buildDay(d, false, records, taxonomy));
    }

    return days;
  }, [currentMonth, records, taxonomy]);

  const monthLabel = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <ActionIcon variant="subtle" onClick={() => onNavigateMonth(-1)}>
          <IconChevronLeft size={18} />
        </ActionIcon>
        <Title order={5}>{monthLabel}</Title>
        <ActionIcon variant="subtle" onClick={() => onNavigateMonth(1)}>
          <IconChevronRight size={18} />
        </ActionIcon>
      </Group>

      <SimpleGrid cols={7} spacing={0}>
        {WEEKDAYS.map((d) => (
          <Text key={d} ta="center" size="xs" fw={600} c="dimmed" pb={4}>
            {d}
          </Text>
        ))}

        {calendarDays.map((day, i) => {
          const isSelected = selectedDay ? isSameDay(day.date, selectedDay) : false;

          return (
            <Card
              key={i}
              padding={4}
              radius={0}
              withBorder
              style={{
                minHeight: 60,
                cursor: day.hasRecords ? 'pointer' : 'default',
                opacity: day.isCurrentMonth ? 1 : 0.35,
                backgroundColor: isSelected
                  ? 'var(--mantine-color-blue-light)'
                  : undefined,
                outline: isSelected ? '2px solid var(--mantine-color-blue-filled)' : undefined,
              }}
              onClick={() => day.hasRecords && onSelectDay(day.date)}
            >
              <Text size="xs">
                {day.date.getDate()}
              </Text>
              <Group gap={2} mt={2} wrap="wrap">
                {day.emotionData.map((e, j) => {
                  const height = mapIntensityToHeight(e.intensity);
                  return (
                    <div
                      key={j}
                      style={{
                        width: 12,
                        height,
                        borderRadius: 2,
                        backgroundColor: e.color,
                      }}
                    />
                  );
                })}
              </Group>
            </Card>
          );
        })}
      </SimpleGrid>

      {selectedDay && (
        <Stack gap="sm">
          <Group justify="space-between">
            <Text size="sm" fw={500}>
              Records for {selectedDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </Text>
            <Badge size="sm" variant="light">
              {dayRecords.length} record{dayRecords.length !== 1 ? 's' : ''}
            </Badge>
          </Group>
          {dayRecords.length === 0 ? (
            <Text size="sm" c="dimmed">
              No records for this day.
            </Text>
          ) : (
            dayRecords.map((r) => (
              <EmotionRecordCard key={r.id} record={r} onEdit={onEditRecord} onDelete={onDeleteRecord} />
            ))
          )}
        </Stack>
      )}
    </Stack>
  );
}

function buildDay(
  date: Date,
  isCurrentMonth: boolean,
  records: ThoughtRecord[],
  taxonomy: ReturnType<typeof useEmotionTaxonomy>
): CalendarDay {
  const dayRecords = records.filter((r) => isSameDay(new Date(r.dateTime), date));
  const emotionMap = new Map<string, { color: string; intensities: number[] }>();

  dayRecords.forEach((record) => {
    getRecordEmotionSelections(record).forEach((selection) => {
      const emotion = taxonomy.getMostSpecificEmotionFromSelection(selection);
      if (!emotion) return;
      const intensity = getEmotionIntensityForSelection(record, selection);
      const existing = emotionMap.get(emotion.color);
      if (existing) {
        existing.intensities.push(intensity);
      } else {
        emotionMap.set(emotion.color, { color: emotion.color, intensities: [intensity] });
      }
    });
  });

  return {
    date,
    isCurrentMonth,
    hasRecords: dayRecords.length > 0,
    emotionData: Array.from(emotionMap.values()).map((d) => ({
      color: d.color,
      intensity: Math.round(d.intensities.reduce((a, b) => a + b, 0) / d.intensities.length),
    })),
  };
}

function mapIntensityToHeight(intensity: number): number {
  const min = 10, max = 100, minH = 6, maxH = 20;
  return minH + ((intensity - min) / (max - min)) * (maxH - minH);
}
