import { ActionIcon, Alert, Box, Divider, Flex, Group, Menu, Switch, Tooltip, useMantineColorScheme } from '@mantine/core';
import {
  IconAlertCircle,
  IconBold,
  IconEye,
  IconH1,
  IconH2,
  IconH3,
  IconH4,
  IconHeading,
  IconItalic,
  IconLetterCase,
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
import { notifications } from '@mantine/notifications';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { AgeIdentity } from '../lib/crypto';
import { createMarkdownComponents } from '../lib/markdownComponents';
import { getRandomEditorPlaceholder, getWordCount } from '../lib/editorUtils';
import {
  createPendingMediaPath,
  cropImageBlob,
  getMimeTypeForExtension,
  getSupportedImageAcceptString,
  maybeDownsampleImageBlob,
  resolveSupportedImageExtension,
  type PixelCrop,
} from '../lib/media';
import { stageMedia } from '../lib/stagedMedia';
import type { StorageProvider } from '../lib/storage';
import { ImageCropModal } from './ImageCropModal';
import "./Editor.css";

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  storage: StorageProvider;
  vaultIdentity: AgeIdentity;
  entryKey: string;
}



function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Image upload failed. Please try again.';
}

function toImageAltText(fileName: string): string {
  const stripped = fileName.replace(/\.[^/.]+$/, '').trim();
  return stripped || 'image';
}

export function Editor({ value, onChange, storage, vaultIdentity, entryKey }: EditorProps) {
  const [previewMode, setPreviewMode] = useState<'edit' | 'preview'>('edit');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { colorScheme } = useMantineColorScheme();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const orchestratorRef = useRef<TextAreaCommandOrchestrator | null>(null);

  // Local state for blazing fast typing
  const [localValue, setLocalValue] = useState(value);
  const [editorPlaceholder] = useState(() => getRandomEditorPlaceholder());
  const debounceRef = useRef<number | null>(null);
  const lastNotifiedValue = useRef(value);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [cropSourceUrl, setCropSourceUrl] = useState<string | null>(null);
  const [cropModalOpened, setCropModalOpened] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const markdownComponents = useMemo(
    () => createMarkdownComponents(storage, vaultIdentity.secretKey, true),
    [storage, vaultIdentity.secretKey]
  );

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

  useEffect(() => {
    return () => {
      if (cropSourceUrl) {
        URL.revokeObjectURL(cropSourceUrl);
      }
      if (debounceRef.current) {
        globalThis.clearTimeout(debounceRef.current);
      }
    };
  }, [cropSourceUrl]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    handleKeyDown(e, 2, false);
    if (orchestratorRef.current)
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

  const closeCropModal = () => {
    setCropModalOpened(false);
    setSelectedFile(null);
    setCropSourceUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
  };

  const insertMarkdownAtCursor = (markdown: string) => {
    const textarea = textareaRef.current;

    if (!textarea) {
      const separator = localValue && !localValue.endsWith('\n') ? '\n' : '';
      const nextValue = `${localValue}${separator}${markdown}`;
      setLocalValue(nextValue);
      debouncedOnChange(nextValue);
      return;
    }

    const sourceValue = textarea.value;
    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;

    const nextValue = `${sourceValue.slice(0, selectionStart)}${markdown}${sourceValue.slice(selectionEnd)}`;

    setLocalValue(nextValue);
    debouncedOnChange(nextValue);

    const cursor = selectionStart + markdown.length;
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(cursor, cursor);
    });
  };

  const handleImagePickerClick = () => {
    if (previewMode === 'preview' || isUploadingImage) {
      return;
    }

    setImageError(null);
    fileInputRef.current?.click();
  };

  const handleImageFileSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;

    const extension = resolveSupportedImageExtension(file.name, file.type);
    if (!extension) {
      setImageError('Unsupported format. Please select png, webp, jpg, jpeg, or avif.');
      return;
    }

    setImageError(null);
    setSelectedFile(file);
    setCropSourceUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return URL.createObjectURL(file);
    });
    setCropModalOpened(true);
  };

  const handleConfirmCroppedImage = async (crop: PixelCrop) => {
    if (!selectedFile || !cropSourceUrl) {
      return;
    }

    setIsUploadingImage(true);
    setImageError(null);

    try {
      const extension = resolveSupportedImageExtension(selectedFile.name, selectedFile.type);
      if (!extension) {
        throw new Error('Unsupported format. Please select png, webp, jpg, jpeg, or avif.');
      }

      const mimeType = getMimeTypeForExtension(extension);
      const croppedBlob = await cropImageBlob(cropSourceUrl, crop, mimeType);
      const processedBlob = await maybeDownsampleImageBlob(croppedBlob, mimeType);

      if (!entryKey) {
        throw new Error('Unable to stage image without an active entry.');
      }

      const staged = await stageMedia({
        entryKey,
        fileName: selectedFile.name,
        mimeType,
        extension,
        blob: processedBlob,
      });

      const markdown = `![${toImageAltText(selectedFile.name)}](${createPendingMediaPath(staged.pendingId)})`;
      insertMarkdownAtCursor(markdown);
      closeCropModal();
    } catch (error) {
      setImageError(getErrorMessage(error));
    } finally {
      setIsUploadingImage(false);
    }
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
      <input
        ref={fileInputRef}
        type="file"
        accept={getSupportedImageAcceptString()}
        onChange={handleImageFileSelection}
        style={{ display: 'none' }}
      />

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
            <Tooltip label={isUploadingImage ? 'Uploading image...' : 'Image'} withArrow position="bottom" openDelay={300}>
              <ActionIcon
                variant="subtle"
                color="gray"
                onClick={handleImagePickerClick}
                disabled={previewMode === 'preview' || isUploadingImage}
              >
                <IconPhoto size={18} stroke={1.5} />
              </ActionIcon>
            </Tooltip>
            {toolbarButton(<IconTable size={18} stroke={1.5} />, 'Table', commands.table)}

            <Divider orientation="vertical" />

            {toolbarButton(<IconList size={18} stroke={1.5} />, 'Unordered List', commands.unorderedListCommand)}
            {toolbarButton(<IconListNumbers size={18} stroke={1.5} />, 'Ordered List', commands.orderedListCommand)}
          </Group>

          <Group gap={4} wrap="nowrap">
            <Switch
              size="md"
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
            <Tooltip label="Word Count" withArrow position="bottom" openDelay={300}>
              <ActionIcon
                variant="subtle"
                color="gray"
                onClick={() =>
                  notifications.show({
                    title: 'Word Count',
                    message: `${getWordCount(localValue)} words`,
                    color: 'terracotta',
                    icon: <IconLetterCase size={18} stroke={1.5} />,
                    autoClose: 3000,
                  })
                }
              >
                <IconLetterCase size={18} stroke={1.5} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        {imageError && (
          <Alert mt="xs" variant="light" color="red" icon={<IconAlertCircle size={16} />}>
            {imageError}
          </Alert>
        )}
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
                paddingBottom: "12rem",
                backgroundColor: 'transparent',
                color: 'inherit',
                fontFamily: '"Fira Code", monospace',
                fontSize: '14px',
                fontWeight: 400,
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
              maxHeight: "calc(100vh - 196px)",
              overflowY: 'auto',
              padding: '1rem',
              backgroundColor: 'var(--mantine-color-body)',
            }}
          >
            <MDEditor.Markdown
              className='md-editor-preview'
              source={localValue}
              style={{ backgroundColor: 'transparent' }}
              components={markdownComponents}
            />
          </Box>
        )}
      </Flex>

      <ImageCropModal
        opened={cropModalOpened}
        sourceUrl={cropSourceUrl}
        isSubmitting={isUploadingImage}
        onCancel={closeCropModal}
        onConfirm={handleConfirmCroppedImage}
      />
    </Box>
  );
}
