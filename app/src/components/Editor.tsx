import { ActionIcon, Box, Divider, Flex, Group, Menu, Switch, Text, Tooltip, useMantineColorScheme } from '@mantine/core';
import {
  IconBold,
  IconEye,
  IconH1,
  IconH2,
  IconH3,
  IconH4,
  IconHeading,
  IconItalic,
  IconLink,
  IconList,
  IconListNumbers,
  IconMaximize,
  IconMinimize,
  IconPencil,
  IconPhoto,
  IconQuote,
  IconStrikethrough,
  IconTable
} from '@tabler/icons-react';
import MDEditor, { commands, getCommands, handleKeyDown, shortcuts, TextAreaCommandOrchestrator } from '@uiw/react-md-editor';
import React, { useEffect, useRef, useState } from 'react';
import { getRandomEditorPlaceholder, getWordCount } from '../lib/editorUtils';

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
}

export function Editor({ value, onChange }: EditorProps) {
  const [previewMode, setPreviewMode] = useState<'edit' | 'preview'>('edit');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { colorScheme } = useMantineColorScheme();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const orchestratorRef = useRef<TextAreaCommandOrchestrator | null>(null);

  // Local state for blazing fast typing
  const [localValue, setLocalValue] = useState(value);
  const [editorPlaceholder] = useState(() => getRandomEditorPlaceholder());
  const debounceRef = useRef<number | null>(null);
  const lastNotifiedValue = useRef(value);

  // Sync when parent dynamically overrides value (e.g. async fetch from disk)
  useEffect(() => {
    if (value !== lastNotifiedValue.current) {
      setLocalValue(value);
      lastNotifiedValue.current = value;
    }
  }, [value]);

  // Sync debounced changes back to parent
  const debouncedOnChange = (newVal: string) => {
    if (debounceRef.current) globalThis.clearTimeout(debounceRef.current);
    debounceRef.current = globalThis.setTimeout(() => {
      lastNotifiedValue.current = newVal;
      onChange(newVal);
    }, 750); // 750ms debounce
  };

  useEffect(() => {
    if (textareaRef.current) {
      orchestratorRef.current = new TextAreaCommandOrchestrator(textareaRef.current);
    }
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    handleKeyDown(e, 2, false);
    if(orchestratorRef.current)
      shortcuts(e, getCommands(), orchestratorRef.current);
  };

  const handleTextAreaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setLocalValue(e.target.value);
    debouncedOnChange(e.target.value);
  };

  const handleBlur = () => {
    // Flush changes immediately when leaving the editor (safeguards clicks on Save/Close)
    if (debounceRef.current) globalThis.clearTimeout(debounceRef.current);
    lastNotifiedValue.current = localValue;
    onChange(localValue);
  };

  const executeCommand = (command: any) => {
    if (orchestratorRef.current && textareaRef.current) {
      orchestratorRef.current.executeCommand(command);
      setLocalValue(textareaRef.current.value);
      debouncedOnChange(textareaRef.current.value);
    }
  };

  const toolbarButton = (icon: React.ReactNode, label: string, command: any) => (
    <Tooltip label={label} withArrow position="bottom" openDelay={300}>
      <ActionIcon variant="subtle" color="gray" onClick={() => executeCommand(command)} disabled={previewMode === "preview"}>
        {icon}
      </ActionIcon>
    </Tooltip>
  );

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
        <Group justify="space-between" wrap="nowrap">
          <Group gap={4} wrap="wrap">
            {toolbarButton(<IconBold size={18} stroke={1.5} />, 'Bold', commands.bold)}
            {toolbarButton(<IconItalic size={18} stroke={1.5} />, 'Italic', commands.italic)}
            {toolbarButton(<IconStrikethrough size={18} stroke={1.5} />, 'Strikethrough', commands.strikethrough)}
            
            <Menu shadow="md" width={150} withinPortal >
              <Menu.Target>
                <Tooltip label="Headings" withArrow position="bottom" openDelay={300}>
                  <ActionIcon variant="subtle" color="gray" disabled={previewMode === "preview"}>
                    <IconHeading size={18} stroke={1.5} />
                  </ActionIcon>
                </Tooltip>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item onClick={() => executeCommand(commands.title1)} leftSection={<IconH1 size={14} stroke={1.5} />}>Heading 1</Menu.Item>
                <Menu.Item onClick={() => executeCommand(commands.title2)} leftSection={<IconH2 size={14} stroke={1.5} />}>Heading 2</Menu.Item>
                <Menu.Item onClick={() => executeCommand(commands.title3)} leftSection={<IconH3 size={14} stroke={1.5} />}>Heading 3</Menu.Item>
                <Menu.Item onClick={() => executeCommand(commands.title4)} leftSection={<IconH4 size={14} stroke={1.5} />}>Heading 4</Menu.Item>
              </Menu.Dropdown>
            </Menu>

            <Divider orientation="vertical" />

            {toolbarButton(<IconLink size={18} stroke={1.5} />, 'Link', commands.link)}
            {toolbarButton(<IconQuote size={18} stroke={1.5} />, 'Quote', commands.quote)}
            {toolbarButton(<IconPhoto size={18} stroke={1.5} />, 'Image', commands.image)}
            {toolbarButton(<IconTable size={18} stroke={1.5} />, 'Table', commands.table)}

            <Divider orientation="vertical" />

            {toolbarButton(<IconList size={18} stroke={1.5} />, 'Unordered List', commands.unorderedListCommand)}
            {toolbarButton(<IconListNumbers size={18} stroke={1.5} />, 'Ordered List', commands.orderedListCommand)}
          </Group>

          <Group gap={4} wrap="nowrap">
            <Switch
              size="md"
              color="indigo"
              checked={previewMode === "edit"}
              onChange={(event) => setPreviewMode(event.currentTarget.checked ? 'edit' : 'preview')}
              onLabel={<IconPencil size={12} stroke={2.5} />}
              offLabel={<IconEye size={12} stroke={2.5} />}
            />
            <Tooltip label={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'} withArrow position="bottom" openDelay={300}>
              <ActionIcon variant="subtle" color="gray" onClick={() => setIsFullscreen(!isFullscreen)}>
                {isFullscreen ? <IconMinimize size={18} stroke={1.5} /> : <IconMaximize size={18} stroke={1.5} />}
              </ActionIcon>
            </Tooltip>
            <Divider orientation='vertical' mx="xs" />
            <Text size='xs' c="dimmed">{getWordCount(localValue)} words</Text>
          </Group>
        </Group>
      </Box>

      <Flex style={{ flex: 1, overflow: 'hidden' }}>
        {(previewMode === 'edit') && (
          <Box style={{ flex: 1, height: '100%', position: 'relative' }}>
            <textarea
              ref={textareaRef}
              value={localValue}
              onChange={handleTextAreaChange}
              onKeyDown={onKeyDown}
              onBlur={handleBlur}
              style={{
                width: '100%',
                height: '100%',
                resize: 'none',
                border: 'none',
                outline: 'none',
                padding: '1rem',
                backgroundColor: 'transparent',
                color: 'inherit',
                fontFamily: 'monospace',
                fontSize: '14px',
                lineHeight: 1.5,
              }}
              placeholder={editorPlaceholder}
            />
          </Box>
        )}

        {(previewMode === 'preview') && (
          <Box
            style={{
              flex: 1,
              height: '100%',
              overflowY: 'auto',
              padding: '1rem',
              backgroundColor: 'var(--mantine-color-body)'
            }}
          >
            <div className="wmde-markdown" style={{ backgroundColor: 'transparent' }}>
              <MDEditor.Markdown source={localValue} style={{ backgroundColor: 'transparent' }} />
            </div>
          </Box>
        )}
      </Flex>
    </Box>
  );
}
