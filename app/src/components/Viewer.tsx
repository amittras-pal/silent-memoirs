import { ActionIcon, Box, Group, Stack, Text, Tooltip, useMantineColorScheme } from '@mantine/core';
import { IconMaximize, IconMinimize } from '@tabler/icons-react';
import MDEditor from '@uiw/react-md-editor';
import { useMemo, useState } from 'react';
import { resolveEntryTitle } from '../lib/entryTitle';
import type { StorageProvider } from '../lib/storage';
import "./Viewer.css";

interface ViewerProps {
  title: string;
  content: string;
  date: string;
  storage: StorageProvider;
  secretKey: string;
}

type MarkdownImageProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  node?: unknown;
};

export function Viewer({ title, content, date, storage, secretKey }: ViewerProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { colorScheme } = useMantineColorScheme();

  const markdownComponents = useMemo(() => ({
    img: ({ node: _node, ...props }: MarkdownImageProps) => (
      <EncryptedMediaImage
        {...props}
        storage={storage}
        secretKey={secretKey}
      />
    ),
  }), [secretKey, storage]);

  return (
    <Box
      style={isFullscreen ? {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        backgroundColor: 'var(--mantine-color-body)',
        display: 'flex',
        flexDirection: 'column'
      } : {
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        flex: 1
      }}
      data-color-mode={colorScheme}
    >
      <Box p="xs" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
        <Group justify="space-between" align="center" wrap="nowrap">
          <Stack gap={0} style={{ minWidth: 0 }}>
            <Text fw={700} size="lg" lineClamp={1}>{resolveEntryTitle(title, date)}</Text>
            <Text c="dimmed" size="xs" lineClamp={1}>{date}</Text>
          </Stack>

          <Group gap={4} wrap="nowrap">
            <Tooltip label={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'} withArrow position="bottom" openDelay={300}>
              <ActionIcon variant="subtle" color="gray" onClick={() => setIsFullscreen(!isFullscreen)}>
                {isFullscreen ? <IconMinimize size={18} stroke={1.5} /> : <IconMaximize size={18} stroke={1.5} />}
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </Box>

      <Box style={{ flex: 1, overflowY: 'auto', padding: '1rem', backgroundColor: 'var(--mantine-color-body)' }}>
          <MDEditor.Markdown
          className='md-viewer'
            source={content || '_No content yet._'}
            style={{ backgroundColor: 'transparent' }}
            components={markdownComponents}
          />
      </Box>
    </Box>
  );
}
