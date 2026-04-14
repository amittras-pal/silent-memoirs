import { Breadcrumbs, Button, Card, Center, Group, Loader, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { IconFileText, IconFolder } from '@tabler/icons-react';
import { resolveEntryTitle } from '../lib/entryTitle';
import type { EntryDirectory, EntryMetadata } from '../lib/sync';

interface EntriesListProps {
  isLoading: boolean;
  currentPath: string;
  folders: EntryDirectory[];
  entries: EntryMetadata[];
  onOpenFolder: (path: string) => void;
  onOpenEntry: (path: string) => void;
}

function formatDate(value: string): string {
  return value.replace('_', ' ');
}

function buildBreadcrumb(currentPath: string): Array<{ label: string; path: string }> {
  const normalized = currentPath.split('/').filter(Boolean);
  const crumbs: Array<{ label: string; path: string }> = [{ label: 'Entries', path: '' }];

  normalized.forEach((segment, index) => {
    crumbs.push({
      label: segment,
      path: normalized.slice(0, index + 1).join('/'),
    });
  });

  return crumbs;
}

export function EntriesList({ isLoading, currentPath, folders, entries, onOpenFolder, onOpenEntry }: EntriesListProps) {
  const crumbs = buildBreadcrumb(currentPath);

  return (
    <Stack p="md" gap="md" style={{ height: '100%' }}>
      <Group justify="space-between" align="center">
        <Title order={3}>Entries Explorer</Title>
      </Group>

      <Breadcrumbs>
        {crumbs.map((crumb) => (
          <Button
            key={`breadcrumb-${crumb.path || 'root'}`}
            variant="subtle"
            size="compact-xs"
            onClick={() => onOpenFolder(crumb.path)}
          >
            {crumb.label}
          </Button>
        ))}
      </Breadcrumbs>

      {isLoading ? (
        <Center style={{ flex: 1 }}>
          <Loader variant="dots" />
        </Center>
      ) : folders.length === 0 && entries.length === 0 ? (
        <Stack align="center" justify="center" style={{ flex: 1 }}>
          <Title order={4}>This folder is empty</Title>
          <Text c="dimmed">Use the editor to create new notes in this location.</Text>
        </Stack>
      ) : (
        <Stack gap="md">
          {folders.length > 0 && (
            <>
              <Text size="xs" fw={700} c="dimmed">FOLDERS</Text>
              <SimpleGrid cols={{ base: 2, sm: 3, lg: 5 }}>
                {folders.map((folder) => (
                  <Card
                    key={`folder-${folder.path || 'root'}`}
                    withBorder
                    radius="md"
                    shadow="sm"
                    p="sm"
                    onClick={() => onOpenFolder(folder.path)}
                    style={{ cursor: 'pointer' }}
                  >
                    <Stack gap={4}>
                      <Group gap="xs" wrap="nowrap">
                        <IconFolder size={16} />
                        <Text fw={700} lineClamp={1}>{folder.name}</Text>
                      </Group>
                      <Text size="xs" c="dimmed" lineClamp={1}>
                        {folder.entryCount} entries
                      </Text>
                    </Stack>
                  </Card>
                ))}
              </SimpleGrid>
            </>
          )}

          {entries.length > 0 && (
            <>
              <Text size="xs" fw={700} c="dimmed">ENTRIES</Text>
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
                {entries.map((entry) => (
                  <Card
                    key={`${entry.path}-${entry.updatedAt}`}
                    withBorder
                    radius="md"
                    shadow="sm"
                    onClick={() => onOpenEntry(entry.path)}
                    style={{ cursor: 'pointer' }}
                  >
                    <Stack gap="xs">
                      <Group gap="xs" wrap="nowrap">
                        <IconFileText size={16} />
                        <Text fw={700} lineClamp={2}>{resolveEntryTitle(entry.title, entry.date)}</Text>
                      </Group>
                      <Text size="sm" c="dimmed">{formatDate(entry.date)}</Text>
                    </Stack>
                  </Card>
                ))}
              </SimpleGrid>
            </>
          )}
        </Stack>
      )}
    </Stack>
  );
}
