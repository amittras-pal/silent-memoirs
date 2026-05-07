import { Center, Group, Pagination, Select, Stack, Text } from '@mantine/core';
import { EmotionRecordCard } from './EmotionRecordCard';
import type { ThoughtRecord } from '../types';

const PAGE_SIZES = ['10', '20', '50', '100'];

interface Props {
  records: ThoughtRecord[];
  activeYear: string;
  page: number;
  pageSize: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onEdit: (record: ThoughtRecord) => void;
  onDelete: (record: ThoughtRecord) => void;
}

export function ListView({
  records,
  activeYear,
  page,
  pageSize,
  totalPages,
  onPageChange,
  onPageSizeChange,
  onEdit,
  onDelete,
}: Props) {
  if (records.length === 0) {
    return (
      <Center py="xl">
        <Text c="dimmed">No thought records for {activeYear}.</Text>
      </Center>
    );
  }

  return (
    <Stack gap="sm">
      {records.map((r) => (
        <EmotionRecordCard
          key={r.id}
          record={r}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
      <Group justify="space-between" mt="sm">
        <Select
          size="xs"
          data={PAGE_SIZES}
          value={String(pageSize)}
          onChange={(v) => v && onPageSizeChange(Number(v))}
          w={80}
          label="Per page"
        />
        <Pagination
          size="sm"
          total={totalPages}
          value={page}
          onChange={onPageChange}
        />
      </Group>
    </Stack>
  );
}
