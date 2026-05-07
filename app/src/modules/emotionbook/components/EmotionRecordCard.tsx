import { ActionIcon, Badge, Card, Group, Spoiler, Text } from '@mantine/core';
import { IconEdit, IconTrash } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useEmotionTaxonomy } from '../useEmotionTaxonomy';
import type { ThoughtRecord } from '../types';
import {
  getRecordEmotionSelections,
  getEmotionIntensityForSelection,
  calculateAverageEmotionIntensity,
} from '../types';

interface Props {
  record: ThoughtRecord;
  onEdit: (record: ThoughtRecord) => void;
  onDelete: (record: ThoughtRecord) => void;
}

function intensityColor(value: number): string {
  if (value < 40) return 'green';
  if (value < 70) return 'yellow';
  return 'red';
}

export function EmotionRecordCard({ record, onEdit, onDelete }: Props) {
  const taxonomy = useEmotionTaxonomy();
  const selections = getRecordEmotionSelections(record);
  const avgIntensity = calculateAverageEmotionIntensity(record.emotionIntensities, record.emotionIntensity);
  const primaryColor = selections.length > 0
    ? taxonomy.getEmotionColor(
        selections[0].tertiaryEmotion ||
          selections[0].secondaryEmotion ||
          selections[0].coreEmotion ||
          ''
      )
    : undefined;

  return (
    <Card
      withBorder
      padding="sm"
      radius="md"
      style={primaryColor ? { borderLeftColor: primaryColor, borderLeftWidth: 3 } : undefined}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <Text size="sm" fw={500}>
            {dayjs(record.dateTime).format('DD MMM YYYY, HH:mm')}
          </Text>
          <Badge size="sm" color={intensityColor(avgIntensity)} variant="light">
            {avgIntensity}
          </Badge>
        </Group>
        <Group gap={4}>
          <ActionIcon variant="subtle" size="sm" onClick={() => onEdit(record)}>
            <IconEdit size={16} />
          </ActionIcon>
          <ActionIcon variant="subtle" size="sm" color="red" onClick={() => onDelete(record)}>
            <IconTrash size={16} />
          </ActionIcon>
        </Group>
      </Group>

      <Group gap="xs" mb="xs" wrap="wrap">
        {selections.map((s, i) => {
          const emotion = taxonomy.getMostSpecificEmotionFromSelection(s);
          if (!emotion) return null;
          const intensity = getEmotionIntensityForSelection(record, s);
          return (
            <Badge key={i} size="sm" color={emotion.color} variant="light">
              {emotion.name} ({intensity})
            </Badge>
          );
        })}
      </Group>

      <Spoiler maxHeight={44} showLabel="Show more" hideLabel="Show less">
        <Text size="sm" lineClamp={2}>
          {record.situation}
        </Text>
        {record.automaticThoughts && (
          <Text size="xs" c="dimmed" mt={4}>
            {record.automaticThoughts}
          </Text>
        )}
      </Spoiler>
    </Card>
  );
}
