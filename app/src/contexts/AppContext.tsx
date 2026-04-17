import { Button, Center, Group, Loader, Modal, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { clearCachedGoogleToken } from '../components/AuthWall';
import { useSessionManager } from '../components/SessionManager';
import {
  clearMediaImageCache,
  clearMediaUploadPathCursor
} from '../lib/media';
import { ROUTES, buildEditorRoute, buildViewerRoute } from '../lib/routes';
import {
  clearAllStagedMedia,
  deleteUploadedStagedMediaForEntry
} from '../lib/stagedMedia';
import { UnauthorizedError, type GoogleDriveStorage } from '../lib/storage';
import { SyncEngine } from '../lib/sync';
import { VaultManager } from '../lib/vault';

interface AppContextType {
  storage: GoogleDriveStorage | null;
  setStorage: (s: GoogleDriveStorage | null) => void;
  vaultManager: VaultManager | null;
  setVaultManager: (v: VaultManager | null) => void;
  syncEngine: SyncEngine | null;

  isDirty: boolean;
  setIsDirty: (val: boolean) => void;
  isSaving: boolean;
  setIsSaving: (val: boolean) => void;

  activeEntryPath: string | null;
  setActiveEntryPath: (path: string | null) => void;
  activeEntryId: string | null;
  setActiveEntryId: (id: string | null) => void;

  editorTitle: string;
  setEditorTitle: (val: string) => void;
  editorContent: string;
  setEditorContent: (val: string) => void;
  editorDate: string;
  setEditorDate: (val: string) => void;
  initialEditorTitle: string;
  setInitialEditorTitle: (val: string) => void;
  initialEditorContent: string;
  setInitialEditorContent: (val: string) => void;
  initialEditorDate: string;
  setInitialEditorDate: (val: string) => void;

  isDraftMode: boolean;
  setIsDraftMode: (val: boolean) => void;
  sessionEditableEntryPath: string | null;
  setSessionEditableEntryPath: (val: string | null) => void;

  confirmDiscardChanges: (message: string) => boolean;
  discardStagedForEntry: (entryPath: string | null) => Promise<void>;

  handleAuthFailure: (err: unknown) => void;
  handleLogout: () => void;
  performVaultLock: () => void;
  getResumeRoute: () => string;
  triggerManifestRepair: () => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { triggerRefresh } = useSessionManager();

  const [storage, _setStorage] = useState<GoogleDriveStorage | null>(null);
  
  const setStorage = useCallback((s: GoogleDriveStorage | null) => {
    if (s) {
      s.onTokenRefresh = () => triggerRefresh(true);
    }
    _setStorage(s);
  }, [triggerRefresh]);

  const [vaultManager, setVaultManager] = useState<VaultManager | null>(null);
  const [syncEngine, setSyncEngine] = useState<SyncEngine | null>(null);

  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeEntryPath, setActiveEntryPath] = useState<string | null>(null);
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);

  const [editorTitle, setEditorTitle] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [editorDate, setEditorDate] = useState('');
  const [initialEditorTitle, setInitialEditorTitle] = useState('');
  const [initialEditorContent, setInitialEditorContent] = useState('');
  const [initialEditorDate, setInitialEditorDate] = useState('');
  const [isDraftMode, setIsDraftMode] = useState(false);
  const [sessionEditableEntryPath, setSessionEditableEntryPath] = useState<string | null>(null);

  const lastActiveRef = useRef<number>(Date.now());
  const [inactivityModalOpened, { open: openInactivityModal, close: closeInactivityModal }] = useDisclosure(false);
  const [countdown, setCountdown] = useState(30);

  const [repairStatus, setRepairStatus] = useState<string | null>(null);

  const confirmDiscardChanges = useCallback((message: string): boolean => {
    if (!isDirty) return true;
    return window.confirm(message);
  }, [isDirty]);

  const discardStagedForEntry = useCallback(async (entryPath: string | null) => {
    if (!entryPath || !storage) return;
    try {
      await deleteUploadedStagedMediaForEntry(entryPath, storage);
    } catch (error) {
      console.error('Failed to discard staged media for entry', entryPath, error);
    }
  }, [storage]);

  const resetAppState = useCallback(() => {
    _setStorage(null);
    setVaultManager(null);
    setSyncEngine(null);
    setIsDirty(false);
    setIsSaving(false);
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
    closeInactivityModal();
  }, [closeInactivityModal]);

  const handleLogout = useCallback(() => {
    clearMediaImageCache();
    clearMediaUploadPathCursor();
    void clearAllStagedMedia().catch((error) => console.error('Failed to clear staged media on logout', error));
    clearCachedGoogleToken();
    resetAppState();
    navigate(ROUTES.login, { replace: true });
  }, [navigate, resetAppState]);

  const handleAuthFailure = useCallback((err: unknown) => {
    console.error(err);
    if (err instanceof UnauthorizedError) {
      handleLogout();
    }
  }, [handleLogout]);

  const performVaultLock = useCallback(() => {
    clearMediaImageCache();
    clearMediaUploadPathCursor();
    void clearAllStagedMedia().catch((error) => console.error('Failed to clear staged media on vault lock', error));
    setVaultManager(null);
    setSyncEngine(null);
    closeInactivityModal();
    navigate(ROUTES.unlock, { replace: true });
  }, [closeInactivityModal, navigate]);

  // SyncEngine initialization
  useEffect(() => {
    if (vaultManager && storage) {
      let cancelled = false;
      const loadSync = async () => {
        const engine = new SyncEngine(storage, vaultManager.identity!);
        if (cancelled) return;
        setSyncEngine(engine);
        engine.ensureInstructionsFile().catch((e) => console.error("Failed to backfill instructions file:", e));
      };
      loadSync().catch(handleAuthFailure);
      return () => { cancelled = true; };
    }
  }, [handleAuthFailure, storage, vaultManager]);

  useEffect(() => {
    const dirty = activeEntryPath !== null && (
      editorTitle !== initialEditorTitle ||
      editorContent !== initialEditorContent ||
      editorDate !== initialEditorDate
    );
    setIsDirty(dirty);
  }, [activeEntryPath, editorTitle, initialEditorTitle, editorContent, initialEditorContent, editorDate, initialEditorDate]);

  // Before unload block
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
        lastActiveRef.current = Date.now();
        timeout = setTimeout(() => { timeout = null; }, 1000);
      }
    };
    const listeners = ['mousemove', 'keydown', 'touchstart', 'scroll'];
    listeners.forEach(event => window.addEventListener(event, throttledUpdate, { passive: true }));
    return () => {
      listeners.forEach(event => window.removeEventListener(event, throttledUpdate));
      if (timeout) clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (!vaultManager) return;
    const interval = setInterval(() => {
      const idleTime = Date.now() - lastActiveRef.current;
      if (idleTime >= 9.5 * 60 * 1000 && idleTime < 10 * 60 * 1000) {
        setCountdown(Math.ceil((10 * 60 * 1000 - idleTime) / 1000));
        if (!inactivityModalOpened) openInactivityModal();
      } else if (idleTime >= 10 * 60 * 1000) {
        performVaultLock();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [inactivityModalOpened, openInactivityModal, performVaultLock, vaultManager]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const idleTime = Date.now() - lastActiveRef.current;
        if (idleTime >= 10 * 60 * 1000 && vaultManager) {
          performVaultLock();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [performVaultLock, vaultManager]);

  const getResumeRoute = useCallback(() => {
    if (activeEntryPath) {
      return isDraftMode ? buildEditorRoute(activeEntryPath) : buildViewerRoute(activeEntryPath);
    }
    return ROUTES.editor;
  }, [activeEntryPath, isDraftMode]);

  const isRepairingRef = useRef(false);

  const triggerManifestRepair = useCallback(async () => {
    if (!syncEngine || isRepairingRef.current) return;
    isRepairingRef.current = true;
    setRepairStatus('Preparing to rebuild manifest...');
    try {
      await syncEngine.rebuildManifest((status) => setRepairStatus(status));
    } catch (e) {
      console.error('Failed to rebuild manifest', e);
    } finally {
      setRepairStatus(null);
      isRepairingRef.current = false;
    }
  }, [syncEngine]);

  const value = {
    storage, setStorage,
    vaultManager, setVaultManager,
    syncEngine,
    isDirty, setIsDirty,
    isSaving, setIsSaving,
    activeEntryPath, setActiveEntryPath,
    activeEntryId, setActiveEntryId,
    editorTitle, setEditorTitle,
    editorContent, setEditorContent,
    editorDate, setEditorDate,
    initialEditorTitle, setInitialEditorTitle,
    initialEditorContent, setInitialEditorContent,
    initialEditorDate, setInitialEditorDate,
    isDraftMode, setIsDraftMode,
    sessionEditableEntryPath, setSessionEditableEntryPath,
    confirmDiscardChanges,
    discardStagedForEntry,
    handleAuthFailure,
    handleLogout,
    performVaultLock,
    getResumeRoute,
    triggerManifestRepair,
  };

  return (
    <AppContext.Provider value={value}>
      {children}
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
          <Button color="gray" variant="light" onClick={performVaultLock}>Lock Now</Button>
          <Button onClick={() => { lastActiveRef.current = Date.now(); closeInactivityModal(); }}>Continue Session</Button>
        </Group>
      </Modal>

      <Modal
        opened={!!repairStatus}
        onClose={() => {}}
        title="Repairing Vault Manifest"
        centered
        closeOnClickOutside={false}
        closeOnEscape={false}
        withCloseButton={false}
        overlayProps={{ blur: 3 }}
      >
        <Center style={{ flexDirection: 'column' }} mt="md" mb="xl">
          <Loader size="lg" mb="md" />
          <Text fw={500}>{repairStatus}</Text>
          <Text size="sm" c="dimmed" mt="xs">Please remain on this screen while we're rebuilding your vault manifest. <br/> While we can repair the manifest agains missing files, we're not able to repair broken files. If any file is corrupted/modified outside the applicaiton, that data is lost.</Text>
        </Center>
      </Modal>
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}
