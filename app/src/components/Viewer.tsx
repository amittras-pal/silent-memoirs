import {
  ActionIcon,
  Box,
  Button,
  Divider,
  Group,
  Stack,
  Text,
  Tooltip,
  useMantineColorScheme,
} from '@mantine/core';
import {
  IconChevronLeft,
  IconChevronRight,
  IconMaximize,
  IconMinimize,
  IconMinus,
  IconPlus,
} from '@tabler/icons-react';
import MDEditor from '@uiw/react-md-editor';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocalStorage } from '@mantine/hooks';
import { resolveEntryTitle } from '../lib/entryTitle';
import { createMarkdownComponents } from '../lib/markdownComponents';
import type { StorageProvider } from '../lib/storage';
import './Viewer.css';

export interface ViewerNavEntry {
  path: string;
  title: string;
  date: string;
}

interface ViewerProps {
  title: string;
  content: string;
  date: string;
  storage: StorageProvider;
  secretKey: string;
  previousEntry?: ViewerNavEntry | null;
  nextEntry?: ViewerNavEntry | null;
  onNavigate?: (path: string) => void;
}

export function Viewer({
  title,
  content,
  date,
  storage,
  secretKey,
  previousEntry,
  nextEntry,
  onNavigate,
}: ViewerProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fontSize, setFontSize] = useLocalStorage<number>({
    key: 'viewer-font-size',
    defaultValue: 16,
  });
  const { colorScheme } = useMantineColorScheme();
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [title, date]);

  const markdownComponents = useMemo(
    () => createMarkdownComponents(storage, secretKey),
    [storage, secretKey]
  );

  const hasNavigation = previousEntry !== undefined || nextEntry !== undefined;

  return (
    <Box
      style={
        isFullscreen
          ? {
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 9999,
              backgroundColor: 'var(--mantine-color-body)',
              display: 'flex',
              flexDirection: 'column',
            }
          : {
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              flex: 1,
            }
      }
      data-color-mode={colorScheme}
    >
      <Box p="xs" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
        <Group justify="space-between" align="center" wrap="nowrap">
          <Stack gap={0} style={{ minWidth: 0 }}>
            <Text fw={700} size="lg" lineClamp={1}>
              {resolveEntryTitle(title, date)}
            </Text>
            <Text c="dimmed" size="xs" lineClamp={1}>
              {date}
            </Text>
          </Stack>

          <Group gap={4} wrap="nowrap">
            <Group gap={2} wrap="nowrap" align="center" mr="xs">
              <Tooltip label="Decrease font size" withArrow position="bottom" openDelay={300}>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  onClick={() => setFontSize(Math.max(14, fontSize - 0.5))}
                  disabled={fontSize <= 14}
                >
                  <IconMinus size={16} stroke={1.5} />
                </ActionIcon>
              </Tooltip>
              <Text size="sm" c="dimmed" style={{ width: 32, textAlign: 'center' }}>
                {fontSize}
              </Text>
              <Tooltip label="Increase font size" withArrow position="bottom" openDelay={300}>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  onClick={() => setFontSize(Math.min(20, fontSize + 0.5))}
                  disabled={fontSize >= 20}
                >
                  <IconPlus size={16} stroke={1.5} />
                </ActionIcon>
              </Tooltip>
            </Group>

            <Tooltip
              label={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              withArrow
              position="bottom"
              openDelay={300}
            >
              <ActionIcon variant="subtle" color="gray" onClick={() => setIsFullscreen(!isFullscreen)}>
                {isFullscreen ? <IconMinimize size={18} stroke={1.5} /> : <IconMaximize size={18} stroke={1.5} />}
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </Box>

      <Box
        ref={scrollContainerRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1rem',
          backgroundColor: 'var(--mantine-color-body)',
        }}
      >
        <MDEditor.Markdown
          className="md-viewer"
          source={content || '_No content yet._'}
          style={
            {
              backgroundColor: 'transparent',
              '--viewer-font-size': `${fontSize}px`,
            } as React.CSSProperties
          }
          components={markdownComponents}
        />

        {hasNavigation && (
          <Box pt="xl" pb="md">
            <Divider mb="lg" />
            <Group justify="space-between" align="center" wrap="wrap" gap="sm">
              {previousEntry ? (
                <Tooltip
                  label={resolveEntryTitle(previousEntry.title, previousEntry.date)}
                  withArrow
                  position="top"
                  openDelay={200}
                >
                  <Button
                    variant="light"
                    color="terracotta"
                    leftSection={<IconChevronLeft size={16} stroke={1.5} />}
                    onClick={() => onNavigate?.(previousEntry.path)}
                  >
                    Previous Entry
                  </Button>
                </Tooltip>
              ) : (
                <Button
                  variant="subtle"
                  color="gray"
                  disabled
                  leftSection={<IconChevronLeft size={16} stroke={1.5} />}
                >
                  Previous Entry
                </Button>
              )}

              {nextEntry ? (
                <Tooltip
                  label={resolveEntryTitle(nextEntry.title, nextEntry.date)}
                  withArrow
                  position="top"
                  openDelay={200}
                >
                  <Button
                    variant="light"
                    color="terracotta"
                    rightSection={<IconChevronRight size={16} stroke={1.5} />}
                    onClick={() => onNavigate?.(nextEntry.path)}
                  >
                    Next Entry
                  </Button>
                </Tooltip>
              ) : (
                <Button
                  variant="subtle"
                  color="gray"
                  disabled
                  rightSection={<IconChevronRight size={16} stroke={1.5} />}
                >
                  Next Entry
                </Button>
              )}
            </Group>
          </Box>
        )}
      </Box>
    </Box>
  );
}

