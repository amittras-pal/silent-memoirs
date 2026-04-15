import { ActionIcon, Box, Breadcrumbs, Button, Card, Center, Group, Loader, Modal, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { IconChevronLeft, IconChevronRight, IconFileText, IconFolder, IconPhoto } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
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
        backgroundColor: 'var(--mantine-color-dark-8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {isVisible ? (
        <EncryptedMediaImage
          src={src}
          alt={name}
          storage={storage}
          secretKey={secretKey}
          loadingLabel="Loading preview..."
          containerStyle={{ margin: 0, width: '100%', height: '100%' }}
          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 0 }}
        />
      ) : (
        <Stack align="center" gap={4}>
          <IconPhoto size={22} stroke={1.4} />
          <Text size="xs" c="dimmed">Load preview</Text>
        </Stack>
      )}
    </Box>
  );
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
}: EntriesListProps) {
  const crumbs = buildBreadcrumb(currentPath);
  const [activeMediaIndex, setActiveMediaIndex] = useState<number | null>(null);

  const isMediaDirectory = /(^|\/)media$/.test(currentPath);
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
