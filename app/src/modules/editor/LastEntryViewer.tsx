import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Center,
  Divider,
  Group,
  Loader,
  Stack,
  Text,
  Title,
  Tooltip,
  useMantineColorScheme,
} from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import {
  IconAlertCircle,
  IconArrowLeft,
  IconCalendarSearch,
  IconHistory,
  IconMinus,
  IconPlus,
  IconRefresh,
  IconX,
} from '@tabler/icons-react';
import MDEditor from '@uiw/react-md-editor';
import dayjs from 'dayjs';
import React, { useMemo } from 'react';

import '../../components/Viewer.css';
import { parseEntryDate, resolveEntryTitle } from '../../lib/entryTitle';
import { createMarkdownComponents } from '../../lib/markdownComponents';
import type { JournalEntry, StorageProvider } from '../../lib/storage';
import type { EntryMetadata } from '../../lib/sync';
import { PastEntryDatePicker } from './PastEntryDatePicker';
import { PastEntryDayList } from './PastEntryDayList';
import type { PastEntryViewState } from './useLastEntry';

interface LastEntryViewerProps {
  entry: JournalEntry | null;
  selectedDate: Date | null;
  entriesByDate: Map<string, EntryMetadata[]>;
  activeDayEntries: EntryMetadata[];
  viewState: PastEntryViewState;
  isLoading: boolean;
  error: string | null;
  hasPreviousEntry: boolean;
  canGoBack: boolean;
  storage: StorageProvider;
  secretKey: string;
  onClose: () => void;
  onSelectDate: (date: Date) => void;
  onSelectEntry: (entryPath: string) => void;
  onGoBack: () => void;
  onRefresh?: () => void;
  isModal?: boolean;
}

function formatEntryTimestamp(dateStr: string): string {
  if (!dateStr) return '';
  const parsed = parseEntryDate(dateStr);
  if (parsed && !Number.isNaN(parsed.getTime())) {
    return dayjs(parsed).format('MMMM D, YYYY [at] HH:mm');
  }
  return dateStr.replace('_', ' ');
}

export function LastEntryViewer({
  entry,
  selectedDate,
  entriesByDate,
  activeDayEntries,
  viewState,
  isLoading,
  error,
  hasPreviousEntry,
  canGoBack,
  storage,
  secretKey,
  onClose,
  onSelectDate,
  onSelectEntry,
  onGoBack,
  onRefresh,
  isModal = false,
}: LastEntryViewerProps) {
  const { colorScheme } = useMantineColorScheme();

  const [fontSize, setFontSize] = useLocalStorage<number>({
    key: 'viewer-font-size',
    defaultValue: 16,
  });

  const markdownComponents = useMemo(
    () => createMarkdownComponents(storage, secretKey),
    [storage, secretKey]
  );

  const backTooltipLabel =
    viewState === 'entry' && activeDayEntries.length > 1
      ? 'Back to Day List'
      : 'Back to Empty View';

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
      {/* Header bar */}
      <Box
        p="xs"
        style={{
          borderBottom: '1px solid var(--mantine-color-default-border)',
          backgroundColor: 'var(--mantine-color-default-hover)',
        }}
      >
        <Group justify="space-between" align="center" wrap="nowrap">
          <Group gap="xs" wrap="nowrap" align="center" style={{ minWidth: 0 }}>
            {canGoBack && (
              <Tooltip label={backTooltipLabel} withArrow position="bottom" openDelay={300}>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="sm"
                  onClick={onGoBack}
                  aria-label="Go back"
                >
                  <IconArrowLeft size={16} stroke={1.5} />
                </ActionIcon>
              </Tooltip>
            )}

            <PastEntryDatePicker
              selectedDate={selectedDate}
              entriesByDate={entriesByDate}
              onSelectDate={onSelectDate}
              disabled={!hasPreviousEntry}
            />
          </Group>

          <Group gap={4} wrap="nowrap">
            {viewState === 'entry' && (
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
                <Text size="xs" c="dimmed" style={{ minWidth: 28, textAlign: 'center' }}>
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
            )}

            {!isModal && (
              <Tooltip label="Close panel" withArrow position="bottom" openDelay={300}>
                <ActionIcon variant="subtle" color="gray" size="sm" onClick={onClose}>
                  <IconX size={16} stroke={1.5} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
        </Group>
      </Box>

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
                Loading entry...
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

        {!isLoading && !error && hasPreviousEntry && viewState === 'day_selection' && (
          <PastEntryDayList
            date={selectedDate}
            entries={activeDayEntries}
            onSelectEntry={onSelectEntry}
          />
        )}

        {!isLoading && !error && hasPreviousEntry && viewState === 'empty' && (
          <Center style={{ height: '100%', minHeight: 250 }}>
            <Stack align="center" gap="xs">
              <IconCalendarSearch size={40} style={{ opacity: 0.35 }} />
              <Text fw={600} size="sm" c="dimmed">
                No Entry Selected
              </Text>
              <Text size="xs" c="dimmed" ta="center" maw={260}>
                Select a date from the header above to reference past journal entries while writing.
              </Text>
            </Stack>
          </Center>
        )}

        {!isLoading && !error && hasPreviousEntry && viewState === 'entry' && entry && (
          <Stack gap="md">
            <Stack gap={2}>
              <Title order={3} fw={700} style={{ wordBreak: 'break-word' }}>
                {resolveEntryTitle(entry.title, entry.date)}
              </Title>
              {entry.date && (
                <Text size="xs" c="dimmed">
                  {formatEntryTimestamp(entry.date)}
                </Text>
              )}
            </Stack>

            <Divider />

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
          </Stack>
        )}
      </Box>
    </Box>
  );
}
