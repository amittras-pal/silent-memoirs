import { Center, Loader } from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { Viewer } from '../../components/Viewer';
import { useAppContext } from '../../contexts/AppContext';
import { resolveEntryTitle } from '../../lib/entryTitle';
import { ROUTES, buildViewerRoute, decodeEntryPath } from '../../lib/routes';
import type { EntryMetadata } from '../../lib/sync';

export default function ViewerModule() {
  const {
    storage,
    syncEngine,
    vaultManager,
    triggerManifestRepair,
  } = useAppContext();
  const location = useLocation();
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState(false);
  const [viewTitle, setViewTitle] = useState('');
  const [viewContent, setViewContent] = useState('');
  const [viewDate, setViewDate] = useState('');
  const [allEntries, setAllEntries] = useState<EntryMetadata[]>([]);

  const routeQuery = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const routeEntryPath = useMemo(() => decodeEntryPath(routeQuery.get('e')), [routeQuery]);

  useEffect(() => {
    if (!syncEngine) return;

    let cancelled = false;
    syncEngine
      .getEntryMetadata()
      .then((entries) => {
        if (cancelled) return;
        setAllEntries(entries);
      })
      .catch((err) => {
        console.error('Failed to load entry metadata for viewer navigation', err);
      });

    return () => {
      cancelled = true;
    };
  }, [syncEngine, routeEntryPath]);

  useEffect(() => {
    if (!syncEngine) return;

    if (!routeEntryPath) {
      navigate(ROUTES.entries, { replace: true });
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    syncEngine
      .fetchEntry(routeEntryPath)
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
  }, [navigate, routeEntryPath, syncEngine, triggerManifestRepair]);

  const chronologicalEntries = useMemo(() => {
    return [...allEntries].sort((a, b) => {
      const byDate = (a.date || a.name).localeCompare(b.date || b.name);
      if (byDate !== 0) return byDate;
      return a.path.localeCompare(b.path);
    });
  }, [allEntries]);

  const { previousEntry, nextEntry } = useMemo(() => {
    if (!routeEntryPath || chronologicalEntries.length === 0) {
      return { previousEntry: null, nextEntry: null };
    }

    const currentIndex = chronologicalEntries.findIndex((e) => e.path === routeEntryPath);
    if (currentIndex === -1) {
      return { previousEntry: null, nextEntry: null };
    }

    const previous = currentIndex > 0 ? chronologicalEntries[currentIndex - 1] : null;
    const next =
      currentIndex < chronologicalEntries.length - 1 ? chronologicalEntries[currentIndex + 1] : null;

    return {
      previousEntry: previous
        ? { path: previous.path, title: previous.title, date: previous.date }
        : null,
      nextEntry: next
        ? { path: next.path, title: next.title, date: next.date }
        : null,
    };
  }, [chronologicalEntries, routeEntryPath]);

  const handleNavigate = (path: string) => {
    navigate(buildViewerRoute(path));
  };

  if (!vaultManager || !storage) return null;

  if (isLoading || !routeEntryPath) {
    return (
      <Center style={{ flex: 1 }}>
        <Loader variant="dots" />
      </Center>
    );
  }

  return (
    <Viewer
      title={viewTitle}
      content={viewContent}
      date={viewDate}
      storage={storage}
      secretKey={vaultManager.identity!.secretKey}
      previousEntry={previousEntry}
      nextEntry={nextEntry}
      onNavigate={handleNavigate}
    />
  );
}

