import { useCallback, useEffect, useRef, useState } from 'react';
import type { JournalEntry } from '../../lib/storage';
import type { SyncEngine } from '../../lib/sync';

interface UseLastEntryProps {
  syncEngine: SyncEngine | null;
  activeEntryPath: string | null;
  isDraftMode: boolean;
}

export interface LastEntryResult {
  isOpen: boolean;
  isLoading: boolean;
  entry: JournalEntry | null;
  entryPath: string | null;
  error: string | null;
  hasPreviousEntry: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  refresh: () => Promise<void>;
}

export function useLastEntry({
  syncEngine,
  activeEntryPath,
  isDraftMode,
}: UseLastEntryProps): LastEntryResult {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [entryPath, setEntryPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasPreviousEntry, setHasPreviousEntry] = useState(true);

  // Cached map of fetched entries: path -> JournalEntry
  const cachedEntriesRef = useRef<Map<string, JournalEntry>>(new Map());
  const activeFetchAbortRef = useRef<boolean>(false);

  const fetchLastEntry = useCallback(async () => {
    if (!syncEngine) return;

    activeFetchAbortRef.current = false;
    setIsLoading(true);
    setError(null);

    try {
      const allEntries = await syncEngine.getEntryMetadata();

      // Filter out current entry if editing an existing one (not in fresh draft mode)
      const eligibleEntries = allEntries
        .filter((e) => {
          if (isDraftMode) return true;
          return e.path !== activeEntryPath;
        })
        .sort((a, b) => (b.date || b.name).localeCompare(a.date || a.name));

      if (eligibleEntries.length === 0) {
        setHasPreviousEntry(false);
        setEntry(null);
        setEntryPath(null);
        setIsLoading(false);
        return;
      }

      setHasPreviousEntry(true);
      const targetMetadata = eligibleEntries[0];
      setEntryPath(targetMetadata.path);

      // Check in-memory cache
      if (cachedEntriesRef.current.has(targetMetadata.path)) {
        setEntry(cachedEntriesRef.current.get(targetMetadata.path)!);
        setIsLoading(false);
        return;
      }

      const fetched = await syncEngine.fetchEntry(targetMetadata.path);
      if (activeFetchAbortRef.current) return;

      if (!fetched) {
        throw new Error('Unable to decrypt or load previous entry.');
      }

      cachedEntriesRef.current.set(targetMetadata.path, fetched);
      setEntry(fetched);
    } catch (err) {
      if (activeFetchAbortRef.current) return;
      console.error('Failed to load last entry:', err);
      setError(err instanceof Error ? err.message : 'Failed to load last entry');
      setEntry(null);
    } finally {
      if (!activeFetchAbortRef.current) {
        setIsLoading(false);
      }
    }
  }, [syncEngine, activeEntryPath, isDraftMode]);

  // Load when opening the panel
  useEffect(() => {
    if (isOpen) {
      void fetchLastEntry();
    }
    return () => {
      activeFetchAbortRef.current = true;
    };
  }, [isOpen, fetchLastEntry]);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);
  const refresh = useCallback(async () => {
    if (entryPath) {
      cachedEntriesRef.current.delete(entryPath);
    }
    await fetchLastEntry();
  }, [entryPath, fetchLastEntry]);

  return {
    isOpen,
    isLoading,
    entry,
    entryPath,
    error,
    hasPreviousEntry,
    open,
    close,
    toggle,
    refresh,
  };
}
