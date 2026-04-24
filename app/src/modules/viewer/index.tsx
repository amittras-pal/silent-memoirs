import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Center, Loader } from '@mantine/core';

import { useAppContext } from '../../contexts/AppContext';
import { ROUTES, decodeEntryPath } from '../../lib/routes';
import { Viewer } from '../../components/Viewer';
import { ExportWarningModal } from '../../components/ExportWarningModal';
import { resolveEntryTitle } from '../../lib/entryTitle';
import { startSingleEntryExport } from '../../lib/export/pdfExport';
import type { GoogleDriveStorage } from '../../lib/storage';

export default function ViewerModule() {
  const {
    storage,
    syncEngine,
    vaultManager,
    triggerManifestRepair,
    userProfile,
    setExportJobState,
    isExportRunning,
  } = useAppContext();
  const location = useLocation();
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState(false);
  const [viewTitle, setViewTitle] = useState('');
  const [viewContent, setViewContent] = useState('');
  const [viewDate, setViewDate] = useState('');
  const [exportWarningOpen, setExportWarningOpen] = useState(false);
  
  const routeQuery = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const routeEntryPath = useMemo(() => decodeEntryPath(routeQuery.get('e')), [routeQuery]);

  useEffect(() => {
    if (!syncEngine) return;

    if (!routeEntryPath) {
      navigate(ROUTES.entries, { replace: true });
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    syncEngine.fetchEntry(routeEntryPath)
      .then((entry) => {
        if (cancelled) return;
        if (!entry) {
          triggerManifestRepair().then(() => {
            navigate(ROUTES.entries, { replace: true });
          });
          return;
        }

        const resolvedTitle = resolveEntryTitle(entry.title, entry.date);
        setViewTitle(resolvedTitle);
        setViewContent(entry.plaintext);
        setViewDate(entry.date);
      })
      .catch((err) => {
        console.error('Failed to load entry for viewer', err);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [navigate, routeEntryPath, syncEngine]);

  const handleExportEntry = useCallback(() => {
    setExportWarningOpen(true);
  }, []);

  const handleExportConfirm = useCallback(async () => {
    setExportWarningOpen(false);
    if (!vaultManager?.identity || !storage || !routeEntryPath) return;

    const driveStorage = storage as GoogleDriveStorage;

    try {
      await startSingleEntryExport(
        {
          entryTitle: viewTitle,
          entryContent: viewContent,
          entryDate: viewDate,
          entryPath: routeEntryPath,
          secretKey: vaultManager.identity.secretKey,
          accessToken: (driveStorage as any).accessToken,
          userName: userProfile?.name ?? 'Google User',
        },
        { onStateChange: setExportJobState },
      );
    } catch (err) {
      console.error('Failed to start single entry export', err);
    }
  }, [vaultManager, storage, routeEntryPath, viewTitle, viewContent, viewDate, userProfile, setExportJobState]);

  if (!vaultManager || !storage) return null;

  if (isLoading || !routeEntryPath) {
    return (
      <Center style={{ flex: 1 }}>
        <Loader variant="dots" />
      </Center>
    );
  }

  return (
    <>
      <Viewer
        title={viewTitle}
        content={viewContent}
        date={viewDate}
        storage={storage}
        secretKey={vaultManager.identity!.secretKey}
        onExportEntry={handleExportEntry}
        isExportRunning={isExportRunning}
      />
      <ExportWarningModal
        opened={exportWarningOpen}
        onConfirm={handleExportConfirm}
        onCancel={() => setExportWarningOpen(false)}
      />
    </>
  );
}
