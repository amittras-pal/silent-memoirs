import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ActionIcon, Center, Flex, Group, Loader, Text, TextInput, Tooltip } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import dayjs from 'dayjs';
import { IconDeviceFloppy, IconX } from '@tabler/icons-react';

import { useAppContext } from '../../contexts/AppContext';
import { ROUTES, buildViewerRoute, buildEntriesRoute, decodeEntryPath, buildEditorRoute } from '../../lib/routes';
import { Editor } from '../../components/Editor';
import { buildDefaultEntryTitle, isDateSyncedEntryTitle, parseEntryDate, resolveEntryTitle } from '../../lib/entryTitle';
import { SyncEngine } from '../../lib/sync';
import { 
  createEncryptedMediaPathAllocator, 
  extractPendingMediaIds, 
  replacePendingMediaPaths, 
  encryptAndUploadImage,
  blobToUint8Array,
  extractEncryptedMediaPaths
} from '../../lib/media';
import { 
  deleteUnreferencedStagedMediaForEntry, 
  getStagedMediaByPendingIds, 
  markStagedMediaUploadedPath, 
  deleteStagedMediaForEntry
} from '../../lib/stagedMedia';
import { UnauthorizedError, type JournalEntry } from '../../lib/storage';

function extractTimeToken(value: string): string {
  const match = /_(\d{2}-\d{2})$/.exec(value);
  if (match) return match[1];
  return dayjs().format('HH-mm');
}

function composeEditorDate(date: Date, currentValue: string): string {
  return `${dayjs(date).format('YYYY-MM-DD')}_${extractTimeToken(currentValue)}`;
}

function getParentDirectory(path: string | null): string {
  if (!path) return '';
  const segments = path.split('/').filter(Boolean);
  if (segments.length <= 1) return '';
  return segments.slice(0, -1).join('/');
}

export default function EditorModule() {
  const {
    storage,
    vaultManager,
    syncEngine,
    isSaving,
    setIsSaving,
    activeEntryPath,
    setActiveEntryPath,
    activeEntryId,
    setActiveEntryId,
    editorTitle,
    setEditorTitle,
    editorContent,
    setEditorContent,
    editorDate,
    setEditorDate,
    setInitialEditorTitle,
    setInitialEditorContent,
    setInitialEditorDate,
    isDraftMode,
    setIsDraftMode,
    sessionEditableEntryPath,
    setSessionEditableEntryPath,
    confirmDiscardChanges,
    discardStagedForEntry,
    handleAuthFailure,
    isDirty,
    triggerManifestRepair
  } = useAppContext();

  const navigate = useNavigate();
  const location = useLocation();

  const [isLoadingEntry, setIsLoadingEntry] = useState(false);

  // Reconciliation refs
  const isNewEntryRef = useRef(false);
  const skipNextEntryFetchPathRef = useRef<string | null>(null);

  const routeQuery = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const routeEntryPath = useMemo(() => decodeEntryPath(routeQuery.get('e')), [routeQuery]);
  const forceNew = location.state?.forceNew;

  const editorDateValue = useMemo(() => parseEntryDate(editorDate), [editorDate]);

  const resetEditorState = useCallback(() => {
    setActiveEntryPath(null);
    setActiveEntryId(null);
    setEditorTitle('');
    setEditorContent('');
    setEditorDate('');
    setInitialEditorTitle('');
    setInitialEditorContent('');
    setInitialEditorDate('');
    setIsDraftMode(false);
    setSessionEditableEntryPath(null);
  }, [
    setActiveEntryId, setActiveEntryPath, setEditorContent, setEditorDate, setEditorTitle,
    setInitialEditorContent, setInitialEditorDate, setInitialEditorTitle, setIsDraftMode, setSessionEditableEntryPath
  ]);

  const startDraftForDate = useCallback((date: Date = new Date()) => {
    const id = crypto.randomUUID();
    const dateStr = dayjs(date).format('YYYY-MM-DD_HH-mm');
    const path = SyncEngine.getEntryPath(dateStr);
    const defaultTitle = buildDefaultEntryTitle(dateStr);

    isNewEntryRef.current = true;
    setIsLoadingEntry(false);
    setIsDraftMode(true);
    setSessionEditableEntryPath(null);
    setActiveEntryPath(path);
    setActiveEntryId(id);
    setEditorTitle(defaultTitle);
    setEditorContent('');
    setEditorDate(dateStr);
    setInitialEditorTitle(defaultTitle);
    setInitialEditorContent('');
    setInitialEditorDate(dateStr);
  }, [
    setActiveEntryId, setActiveEntryPath, setEditorContent, setEditorDate, setEditorTitle,
    setInitialEditorContent, setInitialEditorDate, setInitialEditorTitle, setIsDraftMode, setSessionEditableEntryPath
  ]);

  // Handle forcing a new entry via navigation state
  useEffect(() => {
    if (forceNew) {
      // Clear the state so we don't loop
      navigate(ROUTES.editor, { replace: true, state: {} });
      startDraftForDate(new Date());
    }
  }, [forceNew, navigate, startDraftForDate]);

  // Route -> State reconciliation
  useEffect(() => {
    if (!syncEngine || forceNew) return;

    if (!routeEntryPath) {
      if (activeEntryPath && (isDraftMode || activeEntryPath === sessionEditableEntryPath)) {
        return; // we are already editing something valid
      }
      if (!isDraftMode) {
        startDraftForDate(new Date());
      }
      return;
    }

    if (routeEntryPath === activeEntryPath) {
       // Normal case. We're where we want to be.
       return;
    }

    // Attempting to edit an entry by URL. Editor is strictly for drafts or recently saved `sessionEditableEntryPath`.
    // If the path isn't our currently active editable entry, we must kick the user to viewer.
    // Why? Saved entries are read-only.
    navigate(buildViewerRoute(routeEntryPath), { replace: true });
  }, [
    routeEntryPath, activeEntryPath, syncEngine, isDraftMode, sessionEditableEntryPath, forceNew, navigate, startDraftForDate
  ]);

  // Fetch entry logic (only applies if we are allowed to edit it and haven't fetched it)
  useEffect(() => {
    if (!syncEngine || !activeEntryPath) {
      setIsLoadingEntry(false);
      return;
    }

    if (skipNextEntryFetchPathRef.current === activeEntryPath) {
      skipNextEntryFetchPathRef.current = null;
      setIsLoadingEntry(false);
      return;
    }

    if (isNewEntryRef.current) {
      isNewEntryRef.current = false;
      setIsLoadingEntry(false);
      return;
    }

    // Protection against overwriting unsaved changes during remounts (like when unlocking)
    if (isDirty) {
      setIsLoadingEntry(false);
      return;
    }

    let cancelled = false;
    setIsLoadingEntry(true);

    syncEngine.fetchEntry(activeEntryPath)
      .then((entry) => {
        if (cancelled) return;
        if (!entry) {
          triggerManifestRepair().then(() => {
            navigate(ROUTES.entries, { replace: true });
          });
          return;
        }

        const resolvedTitle = resolveEntryTitle(entry.title, entry.date);

        setIsDraftMode(false);
        setActiveEntryId(entry.id);
        setEditorTitle(resolvedTitle);
        setEditorContent(entry.plaintext);
        setEditorDate(entry.date);
        setInitialEditorTitle(resolvedTitle);
        setInitialEditorContent(entry.plaintext);
        setInitialEditorDate(entry.date);
      })
      .catch((e) => {
         if(!cancelled) handleAuthFailure(e);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingEntry(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeEntryPath, handleAuthFailure, syncEngine, isDirty,
    setActiveEntryId, setEditorContent, setEditorDate, setEditorTitle,
    setInitialEditorContent, setInitialEditorDate, setInitialEditorTitle, setIsDraftMode
  ]);

  // Leave session editing privileges when unmounting editor completely
  useEffect(() => {
    return () => {
      // NOTE: This cleanup cannot directly clear sessionEditableEntryPath if we just switch routes,
      // because React router unmount cleanup happens. We just rely on navigation to viewer for saved items.
      // Wait, actually, let's keep sessionEditableEntryPath until explicitly cleared by changing entries.
    };
  }, []);

  const handleCloseEntry = async () => {
    if (!confirmDiscardChanges('You have unsaved changes. Are you sure you want to close this entry?')) {
      return;
    }

    await discardStagedForEntry(activeEntryPath);
    const nextDirectory = getParentDirectory(activeEntryPath);
    resetEditorState();
    navigate(buildEntriesRoute(nextDirectory));
  };

  const handleSave = async () => {
    if (!syncEngine || !activeEntryPath || !storage || !vaultManager?.identity) return;
    const canSaveCurrentEntry = isDraftMode || activeEntryPath === sessionEditableEntryPath;
    if (!canSaveCurrentEntry) {
      alert('Saved entries are read-only. Start a new entry to write.');
      return;
    }

    setIsSaving(true);
    const entryPathAtSaveStart = activeEntryPath;

    try {
      const resolvedDate = editorDate || dayjs().format('YYYY-MM-DD_HH-mm');
      const resolvedTitle = resolveEntryTitle(editorTitle, resolvedDate);
      const contentAtSaveStart = editorContent || '';

      const pendingIds = extractPendingMediaIds(contentAtSaveStart);
      const referencedPendingIds = new Set(pendingIds);
      await deleteUnreferencedStagedMediaForEntry(entryPathAtSaveStart, referencedPendingIds, storage);

      const baseAllocator = createEncryptedMediaPathAllocator(resolvedDate);
      const existingMediaPaths = pendingIds.length > 0
        ? await storage.listFiles(baseAllocator.directoryPath)
        : [];
      const mediaPathAllocator = createEncryptedMediaPathAllocator(resolvedDate, existingMediaPaths);

      const stagedByPendingId = await getStagedMediaByPendingIds(pendingIds);
      const missingPendingIds = pendingIds.filter((pendingId) => !stagedByPendingId.has(pendingId));
      if (missingPendingIds.length > 0) {
        throw new Error('Some staged images are missing. Please re-insert and try saving again.');
      }

      const pendingIdToEncryptedPath = new Map<string, string>();

      for (const pendingId of pendingIds) {
        const stagedRecord = stagedByPendingId.get(pendingId);
        if (!stagedRecord) continue;

        if (stagedRecord.uploadedPath) {
          pendingIdToEncryptedPath.set(pendingId, stagedRecord.uploadedPath);
          continue;
        }

        const encryptedMediaPath = mediaPathAllocator.nextPath(stagedRecord.extension);
        const stagedBytes = await blobToUint8Array(stagedRecord.blob);

        await encryptAndUploadImage(storage, vaultManager.identity.publicKey, encryptedMediaPath, stagedBytes);
        await markStagedMediaUploadedPath(pendingId, encryptedMediaPath);
        pendingIdToEncryptedPath.set(pendingId, encryptedMediaPath);
      }

      const finalContent = replacePendingMediaPaths(contentAtSaveStart, pendingIdToEncryptedPath);
      const mediaIds = extractEncryptedMediaPaths(finalContent);

      const journalEntry: JournalEntry = {
        id: activeEntryId || crypto.randomUUID(),
        title: resolvedTitle,
        plaintext: finalContent,
        date: resolvedDate,
        mediaIds
      };

      const newPath = await syncEngine.saveEntry(journalEntry);
      await deleteStagedMediaForEntry(entryPathAtSaveStart);

      skipNextEntryFetchPathRef.current = newPath;

      setIsDraftMode(false);
      setSessionEditableEntryPath(newPath);
      setActiveEntryPath(newPath);
      setActiveEntryId(journalEntry.id);
      setEditorTitle(resolvedTitle);
      setEditorContent(finalContent);
      setEditorDate(resolvedDate);
      setInitialEditorTitle(journalEntry.title);
      setInitialEditorContent(finalContent);
      setInitialEditorDate(resolvedDate);

      navigate(buildEditorRoute(newPath), { replace: true });
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        handleAuthFailure(e);
      } else {
        console.error(e);
        const message = e instanceof Error ? e.message : 'Failed to save and sync entry.';
        alert(message);
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (!activeEntryPath || !(isDraftMode || activeEntryPath === sessionEditableEntryPath)) {
    return (
      <Center style={{ flex: 1 }}>
        <Text c="dimmed">Start a new entry to begin writing.</Text>
      </Center>
    );
  }

  return (
    <>
      <Flex gap="md" align="center" style={{ padding: '0.5rem', borderBottom: '1px solid var(--mantine-color-default-border)' }}>
        <TextInput
          value={editorTitle}
          onChange={(e) => setEditorTitle(e.currentTarget.value)}
          placeholder="Entry Title"
          variant="unstyled"
          size="xl"
          fw={700}
          style={{ flex: 1 }}
        />

        <DateInput
          value={editorDateValue}
          onChange={(value) => {
            if (!value) return;
            const nextDate = typeof value === 'string' ? new Date(value) : value;
            if (Number.isNaN(nextDate.getTime())) return;

            const nextDateValue = composeEditorDate(nextDate, editorDate);
            if (isDateSyncedEntryTitle(editorTitle, editorDate)) {
              setEditorTitle(buildDefaultEntryTitle(nextDateValue));
            }
            setEditorDate(nextDateValue);
          }}
          placeholder="Entry Date"
          valueFormat="YYYY-MM-DD"
          clearable={false}
          maxDate={new Date()}
          w={170}
          size="xs"
        />

        <Group gap={6}>
          <Tooltip label="Save & Sync">
            <ActionIcon loading={isSaving} onClick={handleSave} color="teal" variant="light" size="lg">
              <IconDeviceFloppy size={20} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Close / Cancel">
            <ActionIcon onClick={handleCloseEntry} variant="light" color="red" size="lg">
              <IconX size={20} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Flex>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {isLoadingEntry || !vaultManager ? (
          <Center style={{ flex: 1 }}>
            <Loader variant="dots" />
          </Center>
        ) : (
          <Editor
            key={`${activeEntryPath}-${isDraftMode ? 'draft' : 'entry'}`}
            value={editorContent}
            onChange={(value) => setEditorContent(value)}
            storage={storage!}
            vaultIdentity={vaultManager.identity!}
            entryKey={activeEntryPath}
          />
        )}
      </div>
    </>
  );
}
