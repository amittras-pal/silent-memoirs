import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Center,
  Group,
  Loader,
  Stack,
  Text,
  Tooltip,
  useMantineColorScheme,
} from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import {
  IconAlertCircle,
  IconExternalLink,
  IconHistory,
  IconMinus,
  IconPlus,
  IconRefresh,
  IconX,
} from '@tabler/icons-react';
import MDEditor from '@uiw/react-md-editor';
import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { resolveEntryTitle } from '../../lib/entryTitle';
import { createMarkdownComponents } from '../../lib/markdownComponents';
import { buildViewerRoute } from '../../lib/routes';
import type { JournalEntry, StorageProvider } from '../../lib/storage';

interface LastEntryViewerProps {
  entry: JournalEntry | null;
  entryPath: string | null;
  isLoading: boolean;
  error: string | null;
  hasPreviousEntry: boolean;
  storage: StorageProvider;
  secretKey: string;
  onClose: () => void;
  onRefresh?: () => void;
  isModal?: boolean;
}

export function LastEntryViewer({
  entry,
  entryPath,
  isLoading,
  error,
  hasPreviousEntry,
  storage,
  secretKey,
  onClose,
  onRefresh,
  isModal = false,
}: LastEntryViewerProps) {
  const navigate = useNavigate();
  const { colorScheme } = useMantineColorScheme();

  const [fontSize, setFontSize] = useLocalStorage<number>({
    key: 'viewer-font-size',
    defaultValue: 16,
  });

  const markdownComponents = useMemo(
    () => createMarkdownComponents(storage, secretKey),
    [storage, secretKey]
  );

  const displayTitle = useMemo(() => {
    if (!entry) return 'Previous Entry';
    return resolveEntryTitle(entry.title, entry.date);
  }, [entry]);

  const handleOpenInFullViewer = () => {
    if (entryPath) {
      navigate(buildViewerRoute(entryPath));
    }
  };

  return (
    <Box
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        backgroundColor: 'var(--mantine-color-body)',
        position: 'relative',
      }}
      data-color-mode={colorScheme}
    >
      {/* Header bar (only rendered if not wrapped in standard modal header) */}
      {!isModal && (
        <Box
          p="xs"
          style={{
            borderBottom: '1px solid var(--mantine-color-default-border)',
            backgroundColor: 'var(--mantine-color-default-hover)',
          }}
        >
          <Group justify="space-between" align="center" wrap="nowrap">
            <Stack gap={2} style={{ minWidth: 0 }}>
              <Group gap="xs" wrap="nowrap">
                <Badge
                  variant="light"
                  color="terracotta"
                  size="sm"
                  leftSection={<IconHistory size={12} />}
                >
                  Last Entry
                </Badge>
                {entry?.date && (
                  <Text c="dimmed" size="xs" lineClamp={1}>
                    {entry.date}
                  </Text>
                )}
              </Group>
              <Text fw={700} size="sm" lineClamp={1}>
                {displayTitle}
              </Text>
            </Stack>

            <Group gap={4} wrap="nowrap">
              <Group gap={2} wrap="nowrap" align="center">
                <Tooltip label="Decrease font size" withArrow position="bottom" openDelay={300}>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    onClick={() => setFontSize(Math.max(14, fontSize - 0.5))}
                    disabled={fontSize <= 14}
                  >
                    <IconMinus size={14} stroke={1.5} />
                  </ActionIcon>
                </Tooltip>
                <Text size="xs" c="dimmed" style={{ width: 24, textAlign: 'center' }}>
                  {fontSize}
                </Text>
                <Tooltip label="Increase font size" withArrow position="bottom" openDelay={300}>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    onClick={() => setFontSize(Math.min(20, fontSize + 0.5))}
                    disabled={fontSize >= 20}
                  >
                    <IconPlus size={14} stroke={1.5} />
                  </ActionIcon>
                </Tooltip>
              </Group>

              {entryPath && (
                <Tooltip label="Open in Full Viewer" withArrow position="bottom" openDelay={300}>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    onClick={handleOpenInFullViewer}
                  >
                    <IconExternalLink size={16} stroke={1.5} />
                  </ActionIcon>
                </Tooltip>
              )}

              <Tooltip label="Close panel" withArrow position="bottom" openDelay={300}>
                <ActionIcon variant="subtle" color="gray" size="sm" onClick={onClose}>
                  <IconX size={16} stroke={1.5} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>
        </Box>
      )}

      {/* Content body */}
      <Box
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1rem',
          backgroundColor: 'var(--mantine-color-body)',
        }}
      >
        {isLoading && (
          <Center style={{ height: '100%', minHeight: 200 }}>
            <Stack align="center" gap="xs">
              <Loader size="md" variant="dots" color="terracotta" />
              <Text size="sm" c="dimmed">
                Loading previous entry...
              </Text>
            </Stack>
          </Center>
        )}

        {!isLoading && error && (
          <Center style={{ height: '100%', minHeight: 200 }}>
            <Alert
              variant="light"
              color="red"
              title="Error loading entry"
              icon={<IconAlertCircle size={18} />}
              style={{ maxWidth: 400 }}
            >
              <Text size="sm" mb="xs">
                {error}
              </Text>
              {onRefresh && (
                <Button
                  size="xs"
                  variant="outline"
                  color="red"
                  leftSection={<IconRefresh size={14} />}
                  onClick={onRefresh}
                >
                  Retry
                </Button>
              )}
            </Alert>
          </Center>
        )}

        {!isLoading && !error && !hasPreviousEntry && (
          <Center style={{ height: '100%', minHeight: 200 }}>
            <Stack align="center" gap="xs">
              <IconHistory size={36} style={{ opacity: 0.35 }} />
              <Text fw={600} size="sm" c="dimmed">
                No previous entries found
              </Text>
              <Text size="xs" c="dimmed" ta="center" maw={260}>
                This appears to be your first entry. Once you save an entry, it will be available here for quick reference.
              </Text>
            </Stack>
          </Center>
        )}

        {!isLoading && !error && hasPreviousEntry && entry && (
          <MDEditor.Markdown
            className="md-viewer"
            source={entry.plaintext || '_No content recorded._'}
            style={
              {
                backgroundColor: 'transparent',
                '--viewer-font-size': `${fontSize}px`,
              } as React.CSSProperties
            }
            components={markdownComponents}
          />
        )}
      </Box>
    </Box>
  );
}
