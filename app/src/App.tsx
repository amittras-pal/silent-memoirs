import { ActionIcon, AppShell, Burger, Button, Center, Flex, Group, Loader, Modal, NavLink, Text, TextInput, Tooltip, useMantineColorScheme } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useDisclosure } from '@mantine/hooks';
import { Editor } from './components/Editor';
import dayjs from 'dayjs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

import { IconDeviceFloppy, IconLogout, IconMoon, IconPlus, IconSun, IconX } from '@tabler/icons-react';
import { AuthWall, clearCachedGoogleToken } from './components/AuthWall';
import { EntriesList } from './components/EntriesList';
import { VaultSetupWall } from './components/VaultSetupWall';
import { Viewer } from './components/Viewer';
import { buildDefaultEntryTitle, isDateSyncedEntryTitle, parseEntryDate, resolveEntryTitle } from './lib/entryTitle';
import { buildEditorRoute, buildEntriesRoute, buildViewerRoute, decodeDirectoryPath, decodeEntryPath, ROUTES } from './lib/routes';
import { type GoogleDriveStorage, type JournalEntry, UnauthorizedError } from './lib/storage';
import { type EntryDirectory, type EntryMetadata, SyncEngine } from './lib/sync';
import { VaultManager } from './lib/vault';

import '@mantine/dates/styles.css';

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

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  const [opened, { toggle }] = useDisclosure();
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  
  // App state
  const [storage, setStorage] = useState<GoogleDriveStorage | null>(null);
  const [vaultManager, setVaultManager] = useState<VaultManager | null>(null);
  const [syncEngine, setSyncEngine] = useState<SyncEngine | null>(null);
  
  // Data state
  const [currentDirectoryPath, setCurrentDirectoryPath] = useState('');
  const [directoryFolders, setDirectoryFolders] = useState<EntryDirectory[]>([]);
  const [directoryEntries, setDirectoryEntries] = useState<EntryMetadata[]>([]);
  const [isLoadingDirectory, setIsLoadingDirectory] = useState(false);
  const [activeEntryPath, setActiveEntryPath] = useState<string | null>(null);
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  
  // Edit State
  const [editorTitle, setEditorTitle] = useState('');
  const [editorContent, setEditorContent] = useState<string>('');
  const [editorDate, setEditorDate] = useState<string>('');
  const [isDraftMode, setIsDraftMode] = useState(false);
  const [isLoadingEntry, setIsLoadingEntry] = useState(false);
  
  // Track dirty state
  const [initialEditorTitle, setInitialEditorTitle] = useState('');
  const [initialEditorContent, setInitialEditorContent] = useState<string>('');
  const [initialEditorDate, setInitialEditorDate] = useState<string>('');
  
  const [isSaving, setIsSaving] = useState(false);

  // Route-entry state bridge
  const isNewEntryRef = useRef(false);
  
  // Inactivity & Lock State
  const [lastActive, setLastActive] = useState<number>(Date.now());
  const [inactivityModalOpened, { open: openInactivityModal, close: closeInactivityModal }] = useDisclosure(false);
  const [countdown, setCountdown] = useState(30);

  const routeQuery = useMemo(() => new URLSearchParams(location.search), [location.search]);

  const routeEntryPath = useMemo(() => {
    return decodeEntryPath(routeQuery.get('e'));
  }, [routeQuery]);

  const routeDirectoryPath = useMemo(() => {
    return decodeDirectoryPath(routeQuery.get('dir'));
  }, [routeQuery]);

  const editorDateValue = useMemo(() => {
    return parseEntryDate(editorDate);
  }, [editorDate]);

  const isDirty = activeEntryPath !== null && (
    editorTitle !== initialEditorTitle ||
    editorContent !== initialEditorContent ||
    editorDate !== initialEditorDate
  );

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
  }, []);

  const confirmDiscardChanges = useCallback((message: string): boolean => {
    if (!isDirty) return true;
    return window.confirm(message);
  }, [isDirty]);

  const startDraftForDate = useCallback((date: Date = new Date()) => {
    const id = crypto.randomUUID();
    const dateStr = dayjs(date).format('YYYY-MM-DD_HH-mm');
    const path = SyncEngine.getEntryPath(dateStr);
    const defaultTitle = buildDefaultEntryTitle(dateStr);

    isNewEntryRef.current = true;
    setIsLoadingEntry(false);
    setIsDraftMode(true);
    setActiveEntryPath(path);
    setActiveEntryId(id);
    setEditorTitle(defaultTitle);
    setEditorContent('');
    setEditorDate(dateStr);
    setInitialEditorTitle(defaultTitle);
    setInitialEditorContent('');
    setInitialEditorDate(dateStr);
  }, []);

  const handleLogout = useCallback(() => {
    clearCachedGoogleToken();
    setStorage(null);
    setVaultManager(null);
    setSyncEngine(null);
    setCurrentDirectoryPath('');
    setDirectoryFolders([]);
    setDirectoryEntries([]);
    setIsLoadingDirectory(false);
    setIsSaving(false);
    resetEditorState();
    closeInactivityModal();
    navigate(ROUTES.login, { replace: true });
  }, [closeInactivityModal, navigate, resetEditorState]);

  const handleAuthFailure = useCallback((err: unknown) => {
    console.error(err);
    if (err instanceof UnauthorizedError) {
      handleLogout();
    }
  }, [handleLogout]);

  // Before unload handler
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // Inactivity tracking
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const throttledUpdate = () => {
      if (!timeout) {
        setLastActive(Date.now());
        timeout = setTimeout(() => {
          timeout = null;
        }, 1000);
      }
    };

    const listeners = ['mousemove', 'keydown', 'touchstart', 'scroll'];
    listeners.forEach(event => window.addEventListener(event, throttledUpdate, { passive: true }));

    return () => {
      listeners.forEach(event => window.removeEventListener(event, throttledUpdate));
      if (timeout) clearTimeout(timeout);
    };
  }, []);

  const handleLockVault = useCallback(() => {
    setVaultManager(null);
    setSyncEngine(null);
    closeInactivityModal();
    navigate(ROUTES.unlock, { replace: true });
  }, [closeInactivityModal, navigate]);

  useEffect(() => {
    if (!vaultManager) return; // Only track if unlocked

    const interval = setInterval(() => {
      const idleTime = Date.now() - lastActive;
      
      // 10 minutes total timeout. Show modal at 9m 30s.
      if (idleTime >= 9.5 * 60 * 1000 && idleTime < 10 * 60 * 1000) {
        setCountdown(Math.ceil((10 * 60 * 1000 - idleTime) / 1000));
        if (!inactivityModalOpened) {
          openInactivityModal();
        }
      } else if (idleTime >= 10 * 60 * 1000) {
        handleLockVault();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [handleLockVault, inactivityModalOpened, lastActive, openInactivityModal, vaultManager]);

  // Mobile/OS Background check
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const idleTime = Date.now() - lastActive;
        if (idleTime >= 10 * 60 * 1000 && vaultManager) {
          handleLockVault();
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [handleLockVault, lastActive, vaultManager]);

  useEffect(() => {
    if (vaultManager && storage) {
      let cancelled = false;

      const loadSync = async () => {
        const engine = new SyncEngine(storage, vaultManager.identity!);
        if (cancelled) return;
        setSyncEngine(engine);
      };
      loadSync().catch(handleAuthFailure);

      return () => {
        cancelled = true;
      };
    }
  }, [handleAuthFailure, storage, vaultManager]);

  useEffect(() => {
    if (!syncEngine) return;

    const isEditorRoute = location.pathname === ROUTES.editor;
    const isViewerRoute = location.pathname === ROUTES.viewer;

    if ((isEditorRoute || isViewerRoute) && routeEntryPath) {
      if (routeEntryPath !== activeEntryPath) {
        isNewEntryRef.current = false;
        setIsDraftMode(false);
        setActiveEntryPath(routeEntryPath);
      }
      return;
    }

    if (isEditorRoute && !routeEntryPath) {
      if (!isDraftMode) {
        startDraftForDate(new Date());
      }
      return;
    }

    if (isViewerRoute && !routeEntryPath) {
      navigate(buildEntriesRoute(currentDirectoryPath), { replace: true });
    }
  }, [
    activeEntryPath,
    currentDirectoryPath,
    isDraftMode,
    location.pathname,
    navigate,
    routeEntryPath,
    startDraftForDate,
    syncEngine,
  ]);

  useEffect(() => {
    if (!syncEngine || location.pathname !== ROUTES.entries) return;

    let cancelled = false;
    setIsLoadingDirectory(true);

    syncEngine.getDirectoryListing(routeDirectoryPath)
      .then((listing) => {
        if (cancelled) return;

        setCurrentDirectoryPath(listing.currentPath);
        setDirectoryFolders(listing.folders);
        setDirectoryEntries(listing.entries);

        if (listing.currentPath !== routeDirectoryPath) {
          navigate(buildEntriesRoute(listing.currentPath), { replace: true });
        }
      })
      .catch(handleAuthFailure)
      .finally(() => {
        if (!cancelled) {
          setIsLoadingDirectory(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [handleAuthFailure, location.pathname, navigate, routeDirectoryPath, syncEngine]);

  useEffect(() => {
    if (!syncEngine || !activeEntryPath) {
      setIsLoadingEntry(false);
      return;
    }

    if (isNewEntryRef.current) {
      isNewEntryRef.current = false;
      setIsLoadingEntry(false);
      return;
    }

    let cancelled = false;
    setIsLoadingEntry(true);

    syncEngine.fetchEntry(activeEntryPath)
      .then((entry) => {
        if (cancelled || !entry) return;

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
      .catch(handleAuthFailure)
      .finally(() => {
        if (!cancelled) setIsLoadingEntry(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeEntryPath, handleAuthFailure, syncEngine]);

  const openNewEntry = useCallback((date: Date = new Date()) => {
    if (!confirmDiscardChanges('You have unsaved changes. Are you sure you want to start a new entry?')) {
      return;
    }

    startDraftForDate(date);
    navigate(ROUTES.editor);
  }, [confirmDiscardChanges, navigate, startDraftForDate]);

  const openViewerEntry = useCallback((path: string) => {
    if (path !== activeEntryPath && !confirmDiscardChanges('You have unsaved changes. Change entry anyway?')) {
      return;
    }

    isNewEntryRef.current = false;
    setIsDraftMode(false);
    setActiveEntryPath(path);
    navigate(buildViewerRoute(path));
  }, [activeEntryPath, confirmDiscardChanges, navigate]);

  const openEditorEntry = useCallback((path: string) => {
    if (path !== activeEntryPath && !confirmDiscardChanges('You have unsaved changes. Change entry anyway?')) {
      return;
    }

    isNewEntryRef.current = false;
    setIsDraftMode(false);
    setActiveEntryPath(path);
    navigate(buildEditorRoute(path));
  }, [activeEntryPath, confirmDiscardChanges, navigate]);

  const openEntriesDirectory = useCallback((path: string) => {
    navigate(buildEntriesRoute(path));
  }, [navigate]);

  const handleCloseEntry = () => {
    if (!confirmDiscardChanges('You have unsaved changes. Are you sure you want to close this entry?')) {
      return;
    }
    const nextDirectory = getParentDirectory(activeEntryPath);
    resetEditorState();
    navigate(buildEntriesRoute(nextDirectory));
  };

  const handleSave = async () => {
    if (!syncEngine || !activeEntryPath) return;
    setIsSaving(true);

    try {
      const resolvedDate = editorDate || dayjs().format('YYYY-MM-DD_HH-mm');
      const resolvedTitle = resolveEntryTitle(editorTitle, resolvedDate);
      const journalEntry: JournalEntry = {
        id: activeEntryId || crypto.randomUUID(),
        title: resolvedTitle,
        plaintext: editorContent || '',
        date: resolvedDate,
        mediaIds: []
      };

      const newPath = await syncEngine.saveEntry(journalEntry);

      setIsDraftMode(false);
      setActiveEntryPath(newPath);
      setActiveEntryId(journalEntry.id);
      setEditorTitle(resolvedTitle);
      setEditorDate(resolvedDate);
      setInitialEditorTitle(journalEntry.title);
      setInitialEditorContent(journalEntry.plaintext);
      setInitialEditorDate(resolvedDate);

      navigate(buildEditorRoute(newPath), { replace: true });
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        handleLogout();
      } else {
        console.error(e);
        alert("Failed to save and sync entry.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const renderProtectedShell = (mode: 'editor' | 'entries' | 'viewer') => {
    if (!storage) {
      return <Navigate to={ROUTES.login} replace />;
    }

    if (!vaultManager) {
      return <Navigate to={ROUTES.unlock} replace />;
    }

    if (!syncEngine) {
      return (
        <Center style={{ height: '100vh' }}>
          <Loader size="xl" variant="dots" />
        </Center>
      );
    }

    return (
      <AppShell
        header={{ height: 70 }}
        navbar={{
          width: 320,
          breakpoint: 'sm',
          collapsed: { mobile: !opened },
        }}
        padding="0"
      >
        <AppShell.Header style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
          <Group h="100%" px={6} justify="space-between">
            <Group>
              <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
              <Text
                size="xl"
                fw={900}
                variant="gradient"
                gradient={{ from: 'indigo', to: 'cyan', deg: 45 }}
                style={{ letterSpacing: '1px' }}
              >
                Silent Memoirs
              </Text>
            </Group>
            <Group>
              <Tooltip label="Logout & Disconnect">
                <ActionIcon onClick={handleLogout} variant="light" color="red" size="lg" radius="md">
                  <IconLogout size={20} stroke={1.5} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Toggle theme">
                <ActionIcon onClick={toggleColorScheme} variant="default" size="lg" radius="md">
                  {colorScheme === 'dark' ? <IconSun size={20} stroke={1.5} /> : <IconMoon size={20} stroke={1.5} />}
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>
        </AppShell.Header>

        <AppShell.Navbar p="sm" style={{ borderRight: '1px solid var(--mantine-color-default-border)', display: 'flex', flexDirection: 'column' }}>
          <Button
            variant="light"
            color="indigo"
            fullWidth
            mb="md"
            mt="md"
            onClick={() => openNewEntry(new Date())}
            leftSection={<IconPlus size={16} stroke={1.5} />}
          >
            New Entry
          </Button>

          <NavLink
            label="Editor"
            active={mode === 'editor'}
            mb="xs"
            onClick={() => {
              if (activeEntryPath && !isDraftMode) {
                openEditorEntry(activeEntryPath);
                return;
              }
              if (mode !== 'editor' || routeEntryPath) {
                openNewEntry(new Date());
                return;
              }
              navigate(ROUTES.editor);
            }}
          />
          <NavLink
            label="All Entries"
            active={mode === 'entries'}
            mb="md"
            onClick={() => {
              if (!confirmDiscardChanges('You have unsaved changes. Continue to entries anyway?')) return;
              navigate(buildEntriesRoute(currentDirectoryPath));
            }}
          />
        </AppShell.Navbar>

        <AppShell.Main bg="var(--mantine-color-body)">
          <div style={{ height: 'calc(100vh - 70px)', display: 'flex', flexDirection: 'column' }}>
            {mode === 'editor' && (
              activeEntryPath ? (
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

                    {isDraftMode ? (
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
                        w={170}
                        size="xs"
                      />
                    ) : (
                      <Text size="xs" c="dimmed" pt={5}>{editorDate}</Text>
                    )}

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
                    {isLoadingEntry ? (
                      <Center style={{ flex: 1 }}>
                        <Loader variant="dots" />
                      </Center>
                    ) : (
                      <Editor
                        key={`${activeEntryPath}-${isDraftMode ? 'draft' : 'entry'}`}
                        value={editorContent}
                        onChange={(value) => setEditorContent(value)}
                      />
                    )}
                  </div>
                </>
              ) : (
                <Center style={{ flex: 1 }}>
                  <Text c="dimmed">Start a new entry to begin writing.</Text>
                </Center>
              )
            )}

            {mode === 'entries' && (
              <EntriesList
                isLoading={isLoadingDirectory}
                currentPath={currentDirectoryPath}
                folders={directoryFolders}
                entries={directoryEntries}
                onOpenFolder={openEntriesDirectory}
                onOpenEntry={openViewerEntry}
              />
            )}

            {mode === 'viewer' && (
              isLoadingEntry ? (
                <Center style={{ flex: 1 }}>
                  <Loader variant="dots" />
                </Center>
              ) : activeEntryPath ? (
                <Viewer
                  title={editorTitle}
                  content={editorContent}
                  date={editorDate}
                  onEdit={() => openEditorEntry(activeEntryPath)}
                />
              ) : (
                <Center style={{ flex: 1 }}>
                  <Text c="dimmed">Select an entry to view.</Text>
                </Center>
              )
            )}
          </div>
        </AppShell.Main>
      </AppShell>
    );
  };

  return (
    <>
      <Routes>
        <Route
          path={ROUTES.login}
          element={
            storage ? (
              <Navigate to={vaultManager ? (activeEntryPath ? buildEditorRoute(activeEntryPath) : ROUTES.editor) : ROUTES.unlock} replace />
            ) : (
              <AuthWall onAuthenticated={setStorage} />
            )
          }
        />
        <Route
          path={ROUTES.unlock}
          element={
            !storage ? (
              <Navigate to={ROUTES.login} replace />
            ) : vaultManager ? (
              <Navigate to={activeEntryPath ? buildEditorRoute(activeEntryPath) : ROUTES.editor} replace />
            ) : (
              <VaultSetupWall storage={storage} onVaultReady={setVaultManager} onAuthError={handleLogout} />
            )
          }
        />
        <Route path={ROUTES.editor} element={renderProtectedShell('editor')} />
        <Route path={ROUTES.entries} element={renderProtectedShell('entries')} />
        <Route path={ROUTES.viewer} element={renderProtectedShell('viewer')} />
        <Route path="/" element={<Navigate to={ROUTES.editor} replace />} />
        <Route path="*" element={<Navigate to={ROUTES.editor} replace />} />
      </Routes>

      <Modal
        opened={inactivityModalOpened}
        onClose={() => {}}
        title="Inactivity Warning"
        centered
        closeOnClickOutside={false}
        closeOnEscape={false}
        withCloseButton={false}
      >
        <Text mb="md">
          Your vault will lock automatically in <b>{countdown} seconds</b> due to inactivity.
        </Text>
        <Text size="sm" c="dimmed" mb="lg">
          Unsaved changes will be preserved in memory and restored when you unlock.
        </Text>
        <Group justify="flex-end">
          <Button color="gray" variant="light" onClick={handleLockVault}>Lock Now</Button>
          <Button onClick={() => { setLastActive(Date.now()); closeInactivityModal(); }}>Continue Session</Button>
        </Group>
      </Modal>
    </>
  );
}
