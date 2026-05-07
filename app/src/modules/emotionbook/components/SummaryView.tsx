import { useMemo } from 'react';
import { Badge, Card, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useEmotionTaxonomy } from '../useEmotionTaxonomy';
import type { ThoughtRecord } from '../types';
import { getRecordEmotionSelections } from '../types';

interface Props {
  records: ThoughtRecord[];
  activeYear: string;
}

export function SummaryView({ records, activeYear }: Props) {
  const taxonomy = useEmotionTaxonomy();

  const topEmotions = useMemo(() => {
    const counts = new Map<string, number>();

    for (const record of records) {
      const selections = getRecordEmotionSelections(record);
      const seenCores = new Set<string>();
      for (const s of selections) {
        const coreId = s.coreEmotion;
        if (coreId && !seenCores.has(coreId)) {
          seenCores.add(coreId);
          counts.set(coreId, (counts.get(coreId) ?? 0) + 1);
        }
      }
    }

    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, count]) => {
        const emotion = taxonomy.getEmotion(id);
        return {
          id,
          name: emotion?.name ?? id,
          color: emotion?.color ?? '#888',
          count,
        };
      });
  }, [records, taxonomy]);

  return (
    <Stack gap="lg">
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <Card withBorder padding="lg" radius="md">
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">
            Records in {activeYear}
          </Text>
          <Title order={2} mt="xs">
            {records.length}
          </Title>
        </Card>

        <Card withBorder padding="lg" radius="md">
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">
            Top Emotions
          </Text>
          {topEmotions.length === 0 ? (
            <Text size="sm" c="dimmed" mt="xs">
              No data yet.
            </Text>
          ) : (
            <Group gap="xs" mt="sm" wrap="wrap">
              {topEmotions.map((e) => (
                <Badge key={e.id} size="lg" color={e.color} variant="light">
                  {e.name} ({e.count})
                </Badge>
              ))}
            </Group>
          )}
        </Card>
      </SimpleGrid>
    </Stack>
  );
}
