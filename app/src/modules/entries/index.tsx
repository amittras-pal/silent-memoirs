import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useAppContext } from '../../contexts/AppContext';
import { buildEntriesRoute, decodeDirectoryPath, buildViewerRoute } from '../../lib/routes';
import { EntriesList } from '../../components/EntriesList';
import { ExportWarningModal } from '../../components/ExportWarningModal';
import { startDirectoryExport } from '../../lib/export/pdfExport';
import { type EntryDirectory, type EntryMetadata, type MediaFileMetadata } from '../../lib/sync';
import type { GoogleDriveStorage } from '../../lib/storage';

export default function EntriesModule() {
  const {
    storage,
    syncEngine,
    vaultManager,
    activeEntryPath,
    discardStagedForEntry,
    confirmDiscardChanges,
    userProfile,
    setExportJobState,
    isExportRunning,
  } = useAppContext();
  const location = useLocation();
  const navigate = useNavigate();

  const [isLoadingDirectory, setIsLoadingDirectory] = useState(false);
  const [currentDirectoryPath, setCurrentDirectoryPath] = useState('');
  const [directoryFolders, setDirectoryFolders] = useState<EntryDirectory[]>([]);
  const [directoryEntries, setDirectoryEntries] = useState<EntryMetadata[]>([]);
  const [directoryMedia, setDirectoryMedia] = useState<MediaFileMetadata[]>([]);
  const [exportWarningOpen, setExportWarningOpen] = useState(false);
  const [pendingExportYear, setPendingExportYear] = useState<string | null>(null);

  const routeQuery = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const routeDirectoryPath = useMemo(() => decodeDirectoryPath(routeQuery.get('dir')), [routeQuery]);

  useEffect(() => {
    if (!syncEngine) return;

    let cancelled = false;
    setIsLoadingDirectory(true);

    syncEngine.getDirectoryListing(routeDirectoryPath)
      .then((listing) => {
        if (cancelled) return;

        setCurrentDirectoryPath(listing.currentPath);
        setDirectoryFolders(listing.folders);
        setDirectoryEntries(listing.entries);
        setDirectoryMedia(listing.media);

        if (listing.currentPath !== routeDirectoryPath) {
          navigate(buildEntriesRoute(listing.currentPath), { replace: true });
        }
      })
      .catch((err) => {
        console.error('Failed to get directory listing', err);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingDirectory(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [navigate, routeDirectoryPath, syncEngine]);

  const openEntriesDirectory = (path: string) => {
    navigate(buildEntriesRoute(path));
  };

  const openViewerEntry = async (path: string) => {
    if (path !== activeEntryPath && !confirmDiscardChanges('You have unsaved changes. Change entry anyway?')) {
      return;
    }

    if (path !== activeEntryPath) {
      await discardStagedForEntry(activeEntryPath);
    }
    navigate(buildViewerRoute(path));
  };

  const handleExportDirectory = useCallback((directoryPath: string) => {
    setPendingExportYear(directoryPath);
    setExportWarningOpen(true);
  }, []);

  const handleExportConfirm = useCallback(async () => {
    setExportWarningOpen(false);
    const year = pendingExportYear;
    setPendingExportYear(null);

    if (!year || !syncEngine || !vaultManager?.identity || !storage) return;

    const driveStorage = storage as GoogleDriveStorage;

    try {
      // Get all entry paths for this year
      const listing = await syncEngine.getDirectoryListing(year);
      const entryPaths = listing.entries.map(e => e.path);

      if (entryPaths.length === 0) {
        console.warn('No entries to export for year', year);
        return;
      }

      await startDirectoryExport(
        {
          entryPaths,
          year,
          secretKey: vaultManager.identity.secretKey,
          accessToken: (driveStorage as any).accessToken,
          userName: userProfile?.name ?? 'Google User',
          profilePictureUrl: userProfile?.picture ?? null,
        },
        { onStateChange: setExportJobState },
      );
    } catch (err) {
      console.error('Failed to start directory export', err);
    }
  }, [pendingExportYear, syncEngine, vaultManager, storage, userProfile, setExportJobState]);

  if (!vaultManager || !storage) return null;

  return (
    <>
      <EntriesList
        isLoading={isLoadingDirectory}
        currentPath={currentDirectoryPath}
        folders={directoryFolders}
        entries={directoryEntries}
        media={directoryMedia}
        storage={storage}
        secretKey={vaultManager.identity!.secretKey}
        onOpenFolder={openEntriesDirectory}
        onOpenEntry={openViewerEntry}
        onExportDirectory={handleExportDirectory}
        isExportRunning={isExportRunning}
      />
      <ExportWarningModal
        opened={exportWarningOpen}
        onConfirm={handleExportConfirm}
        onCancel={() => { setExportWarningOpen(false); setPendingExportYear(null); }}
      />
    </>
  );
}
