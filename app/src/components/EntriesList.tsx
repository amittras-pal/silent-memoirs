import { ActionIcon, Box, Breadcrumbs, Button, Card, Center, Group, Loader, Modal, SimpleGrid, Stack, Text, Title, Tooltip } from '@mantine/core';
import { Month } from '@mantine/dates';
import {
  IconChevronLeft,
  IconChevronRight,
  IconFileExport,
  IconFileText,
  IconLibraryPhoto,
  IconNotebook,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { resolveEntryTitle } from '../lib/entryTitle';
import type { StorageProvider } from '../lib/storage';
import type { EntryDirectory, EntryMetadata, MediaFileMetadata } from '../lib/sync';
import { EncryptedMediaImage } from './EncryptedMediaImage';

interface EntriesListProps {
  isLoading: boolean;
  currentPath: string;
  folders: EntryDirectory[];
  entries: EntryMetadata[];
  media: MediaFileMetadata[];
  storage: StorageProvider;
  secretKey: string;
  onOpenFolder: (path: string) => void;
  onOpenEntry: (path: string) => void;
  onExportDirectory?: (directoryPath: string) => void;
  isExportRunning?: boolean;
}

interface LazyMediaThumbnailProps {
  src: string;
  name: string;
  storage: StorageProvider;
  secretKey: string;
}

function LazyMediaThumbnail({ src, name, storage, secretKey }: LazyMediaThumbnailProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || isVisible) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const intersecting = entries.some((entry) => entry.isIntersecting);
        if (!intersecting) return;
        setIsVisible(true);
        observer.disconnect();
      },
      { rootMargin: '120px' },
    );

    observer.observe(host);
    return () => observer.disconnect();
  }, [isVisible]);

  return (
    <Box
      ref={hostRef}
      style={{
        height: 180,
        borderRadius: 8,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {isVisible ? (
        <EncryptedMediaImage
          src={src}
          alt={name}
          storage={storage}
          secretKey={secretKey}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          containerStyle={{ width: '100%', height: '100%', margin: 0 }}
        />
      ) : (
        <Center style={{ width: '100%', height: '100%' }}>
          <Loader size="sm" variant="dots" />
        </Center>
      )}
    </Box>
  );
}

function formatDate(dateString: string): string {
  const [datePart, timePart] = dateString.split('_');
  if (!datePart) return dateString;

  const [year, month, day] = datePart.split('-');
  if (!year || !month || !day) return dateString;

  const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
  const monthName = date.toLocaleString('default', { month: 'short' });

  if (timePart) {
    const [hour, minute] = timePart.split('-');
    return `${monthName} ${day}, ${year} at ${hour}:${minute}`;
  }

  return `${monthName} ${day}, ${year}`;
}

function buildBreadcrumb(path: string): Array<{ label: string; path: string }> {
  if (!path) return [{ label: 'Root', path: '' }];

  const parts = path.split('/').filter(Boolean);
  const crumbs = [{ label: 'Root', path: '' }];

  let current = '';
  parts.forEach((part) => {
    current = current ? `${current}/${part}` : part;
    crumbs.push({ label: part, path: current });
  });

  return crumbs;
}

export function EntriesList({
  isLoading,
  currentPath,
  folders,
  entries,
  media,
  storage,
  secretKey,
  onOpenFolder,
  onOpenEntry,
  onExportDirectory,
  isExportRunning,
}: EntriesListProps) {
  const crumbs = buildBreadcrumb(currentPath);
  const [activeMediaIndex, setActiveMediaIndex] = useState<number | null>(null);
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(null);

  const entriesByDate = useMemo(() => {
    const grouped: Record<string, EntryMetadata[]> = {};
    for (const entry of entries) {
      const dayKey = entry.date.split('_')[0];
      if (!grouped[dayKey]) grouped[dayKey] = [];
      grouped[dayKey].push(entry);
    }
    return grouped;
  }, [entries]);

  const isMediaDirectory = /(^|\/)media$/.test(currentPath);
  const isYearDirectory = /^\d{4}$/.test(currentPath);

  const monthsToRender = useMemo(() => {
    if (entries.length === 0) {
      if (isYearDirectory) {
        return [new Date(parseInt(currentPath, 10), 0, 1)];
      }
      return [new Date()];
    }

    if (isYearDirectory) {
      const year = parseInt(currentPath, 10);
      const currentYear = new Date().getFullYear();
      const lastMonth = year === currentYear ? new Date().getMonth() : 11;
      const months = [];
      for (let m = 0; m <= lastMonth; m++) {
        months.push(new Date(year, m, 1));
      }
      return months;
    } else {
      const monthKeys = new Set<string>();
      entries.forEach(e => {
        const [y, m] = e.date.split('-');
        if (y && m) monthKeys.add(`${y}-${m}-01`);
      });
      return Array.from(monthKeys).sort().map(d => new Date(d));
    }
  }, [currentPath, isYearDirectory, entries]);

  const activeMedia = activeMediaIndex === null ? null : media[activeMediaIndex] ?? null;

  useEffect(() => {
    if (activeMediaIndex === null) return;
    if (activeMediaIndex >= media.length) {
      setActiveMediaIndex(null);
    }
  }, [activeMediaIndex, media.length]);

  useEffect(() => {
    if (activeMediaIndex === null) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        setActiveMediaIndex((previous) => {
          if (previous === null || media.length === 0) return null;
          return (previous - 1 + media.length) % media.length;
        });
      }

      if (event.key === 'ArrowRight') {
        setActiveMediaIndex((previous) => {
          if (previous === null || media.length === 0) return null;
          return (previous + 1) % media.length;
        });
      }

      if (event.key === 'Escape') {
        setActiveMediaIndex(null);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeMediaIndex, media.length]);

  const openMediaPreview = (index: number) => {
    setActiveMediaIndex(index);
  };

  const goToPreviousMedia = () => {
    setActiveMediaIndex((previous) => {
      if (previous === null || media.length === 0) return null;
      return (previous - 1 + media.length) % media.length;
    });
  };

  const goToNextMedia = () => {
    setActiveMediaIndex((previous) => {
      if (previous === null || media.length === 0) return null;
      return (previous + 1) % media.length;
    });
  };

  const isEmpty = folders.length === 0 && entries.length === 0 && media.length === 0;

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
      ) : isEmpty ? (
        <Stack align="center" justify="center" style={{ flex: 1 }}>
          <Title order={4}>This folder is empty</Title>
          <Text c="dimmed">
            {isMediaDirectory
              ? 'No images found in this media folder yet.'
              : 'Use the editor to create new notes in this location.'}
          </Text>
        </Stack>
      ) : (
        <Stack gap="md">
          {folders.length > 0 && (
            <>
              <Text size="xs" fw={700} c="dimmed">FOLDERS</Text>
              <SimpleGrid cols={{ base: 2, sm: 3, lg: 5 }}>
                {folders.map((folder) => {
                  const isMedia = folder.name.toLowerCase() === 'media' || /(^|\/)media$/i.test(folder.path);
                  return (
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
                        <Group gap="xs" wrap="nowrap" justify="space-between">
                          <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                            {isMedia ? (
                              <IconLibraryPhoto size={16} stroke={1.7} />
                            ) : (
                              <IconNotebook size={16} stroke={1.7} />
                            )}
                            <Text fw={700} lineClamp={1}>{folder.name}</Text>
                          </Group>
                          {onExportDirectory && /^\d{4}$/.test(folder.name) && (
                            <Tooltip label={`Export ${folder.name} as PDF`} withArrow>
                              <ActionIcon
                                size="sm"
                                variant="subtle"
                                color="gray"
                                disabled={isExportRunning}
                                onClick={(e) => { e.stopPropagation(); onExportDirectory(folder.path); }}
                              >
                                <IconFileExport size={14} stroke={1.5} />
                              </ActionIcon>
                            </Tooltip>
                          )}
                        </Group>
                        <Text size="xs" c="dimmed" lineClamp={1}>
                          {folder.entryCount} {isMedia ? (folder.entryCount === 1 ? 'media file' : 'media files') : (folder.entryCount === 1 ? 'entry' : 'entries')}
                        </Text>
                      </Stack>
                    </Card>
                  );
                })}
              </SimpleGrid>
            </>
          )}

          {media.length > 0 && (
            <>
              <Text size="xs" fw={700} c="dimmed">MEDIA</Text>
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
                {media.map((mediaFile, index) => (
                  <Card
                    key={`media-${mediaFile.path}`}
                    withBorder
                    radius="md"
                    shadow="sm"
                    onClick={() => openMediaPreview(index)}
                    style={{ cursor: 'pointer' }}
                  >
                    <Stack gap="xs">
                      <LazyMediaThumbnail
                        src={mediaFile.path}
                        name={mediaFile.name}
                        storage={storage}
                        secretKey={secretKey}
                      />
                      <Text size="xs" c="dimmed" lineClamp={1}>{mediaFile.name}</Text>
                    </Stack>
                  </Card>
                ))}
              </SimpleGrid>
            </>
          )}

          {(entries.length > 0 || isYearDirectory) && !isMediaDirectory && (
            <>
              <Group justify="space-between" align="center" mb="md">
                <Text size="xs" fw={700} c="dimmed">ENTRIES</Text>
                {isYearDirectory && onExportDirectory && (
                  <Tooltip label={`Export ${currentPath} journal as PDF`} withArrow>
                    <ActionIcon
                      size="sm"
                      variant="light"
                      disabled={isExportRunning}
                      onClick={() => onExportDirectory(currentPath)}
                    >
                      <IconFileExport size={14} stroke={1.5} />
                    </ActionIcon>
                  </Tooltip>
                )}
              </Group>

              <Stack gap="xl" mb="xl">
                  <SimpleGrid cols={{ base: 1, md: 2, lg: 3, xl: 4 }}>
                    {monthsToRender.map((monthDate) => (
                      <Card key={monthDate.toISOString()} withBorder radius="md" p="md" shadow="sm">
                        <Text size="lg" fw={700} ta="center" mb="md">
                          {dayjs(monthDate).format('MMMM YYYY')}
                        </Text>
                        <Month
                          month={dayjs(monthDate).format('YYYY-MM-DD') as any}
                          hideOutsideDates
                          renderDay={(date) => {
                            const dayKey = dayjs(date).format('YYYY-MM-DD');
                            const dayEntries = entriesByDate[dayKey];
                            const hasEntries = dayEntries && dayEntries.length > 0;
                            const isSelected = selectedDateStr === dayKey;

                            if (!hasEntries) {
                              return <Box w="100%" h="100%" display="flex" style={{ alignItems: 'center', justifyContent: 'center' }}>{dayjs(date).date()}</Box>;
                            }

                            const tooltipLabel = dayEntries.length === 1
                              ? resolveEntryTitle(dayEntries[0].title, dayEntries[0].date)
                              : `${dayEntries.length} Entries`;

                            return (
                              <Tooltip label={tooltipLabel} withinPortal>
                                <Box
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (dayEntries.length === 1) {
                                      onOpenEntry(dayEntries[0].path);
                                    } else {
                                      setSelectedDateStr(dayKey);
                                    }
                                  }}
                                  style={(theme) => ({
                                    width: '100%',
                                    height: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    backgroundColor: isSelected ? 'var(--mantine-primary-color-filled)' : theme.colors[theme.primaryColor][4],
                                    color: isSelected ? 'var(--mantine-color-white)' : theme.colors.dark[9],
                                    borderRadius: theme.radius.sm,
                                    cursor: 'pointer'
                                  })}
                                >
                                  {dayjs(date).date()}
                                </Box>
                              </Tooltip>
                            );
                          }}
                        />
                      </Card>
                    ))}
                  </SimpleGrid>
                  {selectedDateStr && entriesByDate[selectedDateStr] && (
                    <Stack gap="xs" mt="xl">
                      <Group justify="space-between" align="center">
                        <Text size="xs" fw={700} c="dimmed">ENTRIES FOR {dayjs(selectedDateStr).format('MMMM D, YYYY').toUpperCase()}</Text>
                        <Button size="compact-xs" variant="subtle" onClick={() => setSelectedDateStr(null)}>Clear</Button>
                      </Group>
                      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
                        {entriesByDate[selectedDateStr].map((entry) => (
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
                    </Stack>
                  )}
                </Stack>
            </>
          )}
        </Stack>
      )}

      <Modal
        opened={activeMediaIndex !== null}
        onClose={() => setActiveMediaIndex(null)}
        title={activeMedia?.name ?? 'Image Preview'}
        fullScreen
      >
        <Stack gap="md" style={{ height: '100%' }}>
          <Group justify="space-between" align="center">
            <ActionIcon
              size="lg"
              variant="light"
              onClick={goToPreviousMedia}
              disabled={media.length <= 1}
              aria-label="Previous image"
            >
              <IconChevronLeft size={18} />
            </ActionIcon>

            <Text size="sm" c="dimmed">
              {activeMediaIndex === null ? 0 : activeMediaIndex + 1} / {media.length}
            </Text>

            <ActionIcon
              size="lg"
              variant="light"
              onClick={goToNextMedia}
              disabled={media.length <= 1}
              aria-label="Next image"
            >
              <IconChevronRight size={18} />
            </ActionIcon>
          </Group>

          <Center style={{ flex: 1, minHeight: 0 }}>
            {activeMedia && (
              <EncryptedMediaImage
                src={activeMedia.path}
                alt={activeMedia.name}
                storage={storage}
                secretKey={secretKey}
                containerStyle={{ margin: 0, width: '100%', maxHeight: 'calc(100vh - 180px)' }}
                style={{ maxWidth: '100%', maxHeight: 'calc(100vh - 180px)', width: 'auto', objectFit: 'contain' }}
              />
            )}
          </Center>
        </Stack>
      </Modal>
    </Stack>
  );
}
