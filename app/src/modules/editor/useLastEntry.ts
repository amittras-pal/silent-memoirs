import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import type { JournalEntry } from '../../lib/storage';
import type { EntryMetadata, SyncEngine } from '../../lib/sync';

interface UseLastEntryProps {
  syncEngine: SyncEngine | null;
  activeEntryPath: string | null;
  isDraftMode: boolean;
}

export type PastEntryViewState = 'entry' | 'day_selection' | 'empty' | 'loading' | 'error';

export interface LastEntryResult {
  isOpen: boolean;
  isLoading: boolean;
  entry: JournalEntry | null;
  entryPath: string | null;
  selectedDate: Date | null;
  entriesByDate: Map<string, EntryMetadata[]>;
  activeDayEntries: EntryMetadata[];
  viewState: PastEntryViewState;
  error: string | null;
  hasPreviousEntry: boolean;
  canGoBack: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  selectDate: (date: Date | string) => Promise<void>;
  selectEntry: (entryPath: string) => Promise<void>;
  goBack: () => void;
  clearToEmpty: () => void;
  refresh: () => Promise<void>;
}

function parseDayKeyToLocalDate(dateOrKey: Date | string): { dayKey: string; localDate: Date } {
  let dayKey = '';
  if (typeof dateOrKey === 'string') {
    dayKey = dateOrKey.split('T')[0].split('_')[0];
  } else {
    dayKey = dayjs(dateOrKey).format('YYYY-MM-DD');
  }

  const [y, m, d] = dayKey.split('-').map(Number);
  const localDate = new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
  return { dayKey, localDate };
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
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [activeDayEntries, setActiveDayEntries] = useState<EntryMetadata[]>([]);
  const [entriesByDate, setEntriesByDate] = useState<Map<string, EntryMetadata[]>>(new Map());
  const [viewState, setViewState] = useState<PastEntryViewState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [hasPreviousEntry, setHasPreviousEntry] = useState(true);

  // Stable refs for tracking state without causing effect re-trigger loops
  const hasInitializedRef = useRef<boolean>(false);
  const entryRef = useRef<JournalEntry | null>(null);
  entryRef.current = entry;
  const entryPathRef = useRef<string | null>(null);
  entryPathRef.current = entryPath;
  const viewStateRef = useRef<PastEntryViewState>(viewState);
  viewStateRef.current = viewState;

  const cachedEntriesRef = useRef<Map<string, JournalEntry>>(new Map());
  const entriesByDateRef = useRef<Map<string, EntryMetadata[]>>(new Map());
  const fetchSequenceRef = useRef<number>(0);

  // Helper to build date index map from metadata
  const indexEntries = useCallback((metadataList: EntryMetadata[]): {
    indexedMap: Map<string, EntryMetadata[]>;
    sortedList: EntryMetadata[];
  } => {
    const sorted = [...metadataList]
      .filter((e) => {
        if (isDraftMode) return true;
        return e.path !== activeEntryPath;
      })
      .sort((a, b) => (b.date || b.name).localeCompare(a.date || a.name));

    const map = new Map<string, EntryMetadata[]>();
    for (const item of sorted) {
      const dayKey = item.date ? item.date.split('_')[0] : '';
      if (!dayKey) continue;
      const existing = map.get(dayKey) || [];
      existing.push(item);
      map.set(dayKey, existing);
    }

    return { indexedMap: map, sortedList: sorted };
  }, [activeEntryPath, isDraftMode]);

  // Load and decrypt a specific entry by path
  const loadEntryByPath = useCallback(async (
    targetPath: string,
    targetDate?: Date | null
  ) => {
    if (!syncEngine) return;

    const currentSeq = ++fetchSequenceRef.current;
    setIsLoading(true);
    setError(null);
    setViewState('loading');
    setEntryPath(targetPath);

    if (targetDate) {
      setSelectedDate(targetDate);
    }

    try {
      if (cachedEntriesRef.current.has(targetPath)) {
        const cached = cachedEntriesRef.current.get(targetPath)!;
        if (fetchSequenceRef.current === currentSeq) {
          setEntry(cached);
          setViewState('entry');
          setIsLoading(false);
        }
        return;
      }

      const fetched = await syncEngine.fetchEntry(targetPath);
      if (fetchSequenceRef.current !== currentSeq) return;

      if (!fetched) {
        throw new Error('Unable to decrypt or load entry.');
      }

      cachedEntriesRef.current.set(targetPath, fetched);
      setEntry(fetched);
      setViewState('entry');
    } catch (err) {
      if (fetchSequenceRef.current !== currentSeq) return;
      console.error('Failed to load entry:', err);
      setError(err instanceof Error ? err.message : 'Failed to load entry');
      setEntry(null);
      setViewState('error');
    } finally {
      if (fetchSequenceRef.current === currentSeq) {
        setIsLoading(false);
      }
    }
  }, [syncEngine]);

  // Initial load when opening the viewer
  const initializeViewer = useCallback(async () => {
    if (!syncEngine) return;

    setIsLoading(true);
    setError(null);

    try {
      const allEntries = await syncEngine.getEntryMetadata();
      const { indexedMap, sortedList } = indexEntries(allEntries);
      entriesByDateRef.current = indexedMap;
      setEntriesByDate(indexedMap);

      if (sortedList.length === 0) {
        setHasPreviousEntry(false);
        setEntry(null);
        setEntryPath(null);
        setSelectedDate(null);
        setActiveDayEntries([]);
        setViewState('empty');
        setIsLoading(false);
        hasInitializedRef.current = true;
        return;
      }

      setHasPreviousEntry(true);

      // If already initialized with a selected entry or explicit empty state, preserve it (state retention)
      if (hasInitializedRef.current && (entryRef.current || entryPathRef.current || viewStateRef.current === 'empty')) {
        setIsLoading(false);
        return;
      }

      // Default to loading the latest entry
      const targetMetadata = sortedList[0];
      const { localDate } = parseDayKeyToLocalDate(targetMetadata.date);
      const dayKey = targetMetadata.date.split('_')[0];
      const dayEntries = indexedMap.get(dayKey) || [targetMetadata];

      setSelectedDate(localDate);
      setActiveDayEntries(dayEntries);
      hasInitializedRef.current = true;

      await loadEntryByPath(targetMetadata.path, localDate);
    } catch (err) {
      console.error('Failed to initialize past entry viewer:', err);
      setError(err instanceof Error ? err.message : 'Failed to load past entries');
      setViewState('error');
      setIsLoading(false);
    }
  }, [syncEngine, indexEntries, loadEntryByPath]);

  // Handle panel opening
  useEffect(() => {
    if (isOpen) {
      void initializeViewer();
    }
  }, [isOpen, initializeViewer]);

  // Action: Select a calendar date
  const selectDate = useCallback(async (date: Date | string) => {
    const { dayKey, localDate } = parseDayKeyToLocalDate(date);
    setSelectedDate(localDate);

    const map = entriesByDateRef.current.size > 0 ? entriesByDateRef.current : entriesByDate;
    const dayEntries = map.get(dayKey) || [];
    setActiveDayEntries(dayEntries);

    if (dayEntries.length === 0) {
      setEntry(null);
      setEntryPath(null);
      setViewState('empty');
      return;
    }

    if (dayEntries.length === 1) {
      await loadEntryByPath(dayEntries[0].path, localDate);
    } else {
      setEntry(null);
      setEntryPath(null);
      setViewState('day_selection');
    }
  }, [entriesByDate, loadEntryByPath]);

  // Action: Select a specific entry from the day list
  const selectEntry = useCallback(async (path: string) => {
    await loadEntryByPath(path, selectedDate);
  }, [loadEntryByPath, selectedDate]);

  // Action: Step back in navigation hierarchy
  const goBack = useCallback(() => {
    if (viewState === 'entry' && activeDayEntries.length > 1) {
      setEntry(null);
      setEntryPath(null);
      setViewState('day_selection');
      return;
    }

    // Otherwise return to empty view
    setEntry(null);
    setEntryPath(null);
    setSelectedDate(null);
    setActiveDayEntries([]);
    setViewState('empty');
  }, [viewState, activeDayEntries.length]);

  // Action: Clear selection to empty view
  const clearToEmpty = useCallback(() => {
    setEntry(null);
    setEntryPath(null);
    setSelectedDate(null);
    setActiveDayEntries([]);
    setViewState('empty');
  }, []);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  const refresh = useCallback(async () => {
    if (!syncEngine) return;
    try {
      const allEntries = await syncEngine.getEntryMetadata();
      const { indexedMap } = indexEntries(allEntries);
      entriesByDateRef.current = indexedMap;
      setEntriesByDate(indexedMap);

      if (entryPath) {
        cachedEntriesRef.current.delete(entryPath);
        await loadEntryByPath(entryPath, selectedDate);
      }
    } catch (err) {
      console.error('Failed to refresh entries metadata:', err);
    }
  }, [syncEngine, indexEntries, entryPath, selectedDate, loadEntryByPath]);

  const canGoBack = useMemo(() => {
    return viewState === 'entry' || viewState === 'day_selection';
  }, [viewState]);

  return {
    isOpen,
    isLoading,
    entry,
    entryPath,
    selectedDate,
    entriesByDate,
    activeDayEntries,
    viewState,
    error,
    hasPreviousEntry,
    canGoBack,
    open,
    close,
    toggle,
    selectDate,
    selectEntry,
    goBack,
    clearToEmpty,
    refresh,
  };
}
