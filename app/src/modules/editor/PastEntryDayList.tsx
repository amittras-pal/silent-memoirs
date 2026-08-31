import { Card, Group, Stack, Text } from '@mantine/core';
import { IconChevronRight, IconFileText } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { resolveEntryTitle } from '../../lib/entryTitle';
import type { EntryMetadata } from '../../lib/sync';

interface PastEntryDayListProps {
  date: Date | null;
  entries: EntryMetadata[];
  onSelectEntry: (entryPath: string) => void;
}

function formatEntryTime(dateStr: string): string {
  const parts = dateStr.split('_');
  if (parts.length > 1 && parts[1]) {
    const [hour, minute] = parts[1].split('-');
    if (hour && minute) {
      return `${hour}:${minute}`;
    }
  }
  return '';
}

export function PastEntryDayList({
  date,
  entries,
  onSelectEntry,
}: PastEntryDayListProps) {
  const formattedDate = date
    ? dayjs(date).format('MMMM D, YYYY')
    : 'Selected Day';

  return (
    <Stack gap="md">
      <Stack gap={2}>
        <Text size="xs" fw={700} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.5px' }}>
          Multiple Entries on {formattedDate}
        </Text>
        <Text size="xs" c="dimmed">
          Select an entry to view its contents alongside your editor canvas:
        </Text>
      </Stack>

      <Stack gap="xs">
        {entries.map((entry) => {
          const displayTitle = resolveEntryTitle(entry.title, entry.date);
          const timeStr = formatEntryTime(entry.date);

          return (
            <Card
              key={entry.path}
              onClick={() => onSelectEntry(entry.path)}
              withBorder
              radius="md"
              p="sm"
              style={{
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                backgroundColor: 'var(--mantine-color-default)',
              }}
            >
              <Group justify="space-between" align="center" wrap="nowrap">
                <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                  <IconFileText
                    size={20}
                    color="var(--mantine-primary-color-filled, #cd784d)"
                    style={{ flexShrink: 0 }}
                  />
                  <Stack gap={2} style={{ minWidth: 0 }}>
                    <Text fw={600} size="sm" lineClamp={1}>
                      {displayTitle}
                    </Text>
                    {timeStr && (
                      <Text size="xs" c="dimmed">
                        Recorded at {timeStr}
                      </Text>
                    )}
                  </Stack>
                </Group>

                <IconChevronRight
                  size={16}
                  style={{ opacity: 0.45, flexShrink: 0 }}
                />
              </Group>
            </Card>
          );
        })}
      </Stack>
    </Stack>
  );
}
