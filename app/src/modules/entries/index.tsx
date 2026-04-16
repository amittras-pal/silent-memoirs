import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useAppContext } from '../../contexts/AppContext';
import { buildEntriesRoute, decodeDirectoryPath, buildViewerRoute } from '../../lib/routes';
import { EntriesList } from '../../components/EntriesList';
import { type EntryDirectory, type EntryMetadata, type MediaFileMetadata } from '../../lib/sync';

export default function EntriesModule() {
  const { storage, syncEngine, vaultManager, activeEntryPath, discardStagedForEntry, confirmDiscardChanges } = useAppContext();
  const location = useLocation();
  const navigate = useNavigate();

  const [isLoadingDirectory, setIsLoadingDirectory] = useState(false);
  const [currentDirectoryPath, setCurrentDirectoryPath] = useState('');
  const [directoryFolders, setDirectoryFolders] = useState<EntryDirectory[]>([]);
  const [directoryEntries, setDirectoryEntries] = useState<EntryMetadata[]>([]);
  const [directoryMedia, setDirectoryMedia] = useState<MediaFileMetadata[]>([]);

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
          // If the requested path didn't exist or normalized differently, replace the URL
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

  if (!vaultManager || !storage) return null;

  return (
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
    />
  );
}
