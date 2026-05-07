import { useCallback, useEffect, useMemo, useReducer } from 'react';
import { notifications } from '@mantine/notifications';
import { useAppContext } from '../../contexts/AppContext';
import { EmotionBookSyncAdapter } from './sync';
import type { ThoughtRecord } from './types';
import {
  normalizeEmotionSelections,
  normalizeEmotionIntensities,
  calculateAverageEmotionIntensity,
} from './types';

interface State {
  records: ThoughtRecord[];
  availableYears: string[];
  activeYear: string;
  loading: boolean;
  viewMode: 'summary' | 'list' | 'calendar';
  page: number;
  pageSize: number;
  calendarMonth: Date;
  selectedDay: Date | null;
}

type Action =
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'SET_YEARS'; years: string[]; activeYear: string }
  | { type: 'SET_RECORDS'; records: ThoughtRecord[]; year: string }
  | { type: 'SET_VIEW_MODE'; mode: 'summary' | 'list' | 'calendar' }
  | { type: 'SET_PAGE'; page: number }
  | { type: 'SET_PAGE_SIZE'; pageSize: number }
  | { type: 'SET_CALENDAR_MONTH'; month: Date }
  | { type: 'SET_SELECTED_DAY'; day: Date | null };

const currentYear = String(new Date().getFullYear());

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.loading };
    case 'SET_YEARS':
      return { ...state, availableYears: action.years, activeYear: action.activeYear };
    case 'SET_RECORDS':
      return { ...state, records: action.records, activeYear: action.year, loading: false, page: 1 };
    case 'SET_VIEW_MODE':
      return { ...state, viewMode: action.mode };
    case 'SET_PAGE':
      return { ...state, page: action.page };
    case 'SET_PAGE_SIZE':
      return { ...state, pageSize: action.pageSize, page: 1 };
    case 'SET_CALENDAR_MONTH':
      return { ...state, calendarMonth: action.month, selectedDay: null };
    case 'SET_SELECTED_DAY':
      return { ...state, selectedDay: action.day };
    default:
      return state;
  }
}

export function useEmotionBook() {
  const { storage, vaultManager, handleAuthFailure } = useAppContext();

  const [state, dispatch] = useReducer(reducer, {
    records: [],
    availableYears: [],
    activeYear: currentYear,
    loading: true,
    viewMode: 'summary',
    page: 1,
    pageSize: 10,
    calendarMonth: new Date(),
    selectedDay: null,
  });

  const adapter = useMemo(() => {
    if (!storage || !vaultManager?.identity) return null;
    return new EmotionBookSyncAdapter(storage, vaultManager.identity);
  }, [storage, vaultManager]);

  const loadYear = useCallback(
    async (year: string) => {
      if (!adapter) return;
      dispatch({ type: 'SET_LOADING', loading: true });
      try {
        const records = await adapter.loadYear(year);
        dispatch({ type: 'SET_RECORDS', records, year });
      } catch (err) {
        handleAuthFailure(err);
      }
    },
    [adapter, handleAuthFailure]
  );

  // Initial load
  useEffect(() => {
    if (!adapter) return;
    let cancelled = false;

    const init = async () => {
      try {
        const years = await adapter.listYears();
        const activeYear = years.length > 0 ? years[0] : currentYear;
        if (cancelled) return;
        dispatch({ type: 'SET_YEARS', years, activeYear });

        const records = await adapter.loadYear(activeYear);
        if (cancelled) return;
        dispatch({ type: 'SET_RECORDS', records, year: activeYear });
      } catch (err) {
        if (!cancelled) handleAuthFailure(err);
      }
    };

    init();
    return () => { cancelled = true; };
  }, [adapter, handleAuthFailure]);

  const createRecord = useCallback(
    async (data: Omit<ThoughtRecord, 'id'>) => {
      if (!adapter) return;
      const record: ThoughtRecord = {
        ...data,
        id: crypto.randomUUID(),
        emotionSelections: normalizeEmotionSelections(data.emotionSelections),
        emotionIntensities: normalizeEmotionIntensities(data.emotionIntensities),
        emotionIntensity: calculateAverageEmotionIntensity(data.emotionIntensities, data.emotionIntensity),
      };

      const year = String(record.dateTime.getFullYear());
      try {
        let yearRecords: ThoughtRecord[];
        if (year === state.activeYear) {
          yearRecords = [record, ...state.records];
        } else {
          const existing = await adapter.loadYear(year);
          yearRecords = [record, ...existing];
        }
        await adapter.saveYear(year, yearRecords);

        // Refresh available years
        const years = await adapter.listYears();
        dispatch({ type: 'SET_YEARS', years, activeYear: state.activeYear });

        if (year === state.activeYear) {
          dispatch({ type: 'SET_RECORDS', records: yearRecords, year });
        }

        notifications.show({ title: 'Saved', message: 'Thought record created.', color: 'green' });
      } catch (err) {
        handleAuthFailure(err);
      }
    },
    [adapter, state.activeYear, state.records, handleAuthFailure]
  );

  const updateRecord = useCallback(
    async (id: string, data: Omit<ThoughtRecord, 'id'>) => {
      if (!adapter) return;

      const newYear = String(data.dateTime.getFullYear());
      const updated: ThoughtRecord = {
        ...data,
        id,
        emotionSelections: normalizeEmotionSelections(data.emotionSelections),
        emotionIntensities: normalizeEmotionIntensities(data.emotionIntensities),
        emotionIntensity: calculateAverageEmotionIntensity(data.emotionIntensities, data.emotionIntensity),
      };

      try {
        // Remove from current year
        const oldRecords = state.records.filter((r) => r.id !== id);
        await adapter.saveYear(state.activeYear, oldRecords);

        // Add to target year
        if (newYear === state.activeYear) {
          const yearRecords = [updated, ...oldRecords];
          await adapter.saveYear(newYear, yearRecords);
          dispatch({ type: 'SET_RECORDS', records: yearRecords, year: newYear });
        } else {
          const targetRecords = await adapter.loadYear(newYear);
          await adapter.saveYear(newYear, [updated, ...targetRecords]);
          dispatch({ type: 'SET_RECORDS', records: oldRecords, year: state.activeYear });
        }

        const years = await adapter.listYears();
        dispatch({ type: 'SET_YEARS', years, activeYear: state.activeYear });
        notifications.show({ title: 'Updated', message: 'Thought record updated.', color: 'green' });
      } catch (err) {
        handleAuthFailure(err);
      }
    },
    [adapter, state.activeYear, state.records, handleAuthFailure]
  );

  const deleteRecord = useCallback(
    async (record: ThoughtRecord) => {
      if (!adapter) return;
      try {
        await adapter.deleteRecord(record);
        const records = state.records.filter((r) => r.id !== record.id);
        dispatch({ type: 'SET_RECORDS', records, year: state.activeYear });

        const years = await adapter.listYears();
        dispatch({ type: 'SET_YEARS', years, activeYear: state.activeYear });
        notifications.show({ title: 'Deleted', message: 'Thought record deleted.', color: 'orange' });
      } catch (err) {
        handleAuthFailure(err);
      }
    },
    [adapter, state.activeYear, state.records, handleAuthFailure]
  );

  const exportRecords = useCallback(async () => {
    if (!adapter) return;
    try {
      const all = await adapter.exportAll();
      const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `emotionbook-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      notifications.show({ title: 'Exported', message: 'All records exported.', color: 'green' });
    } catch (err) {
      handleAuthFailure(err);
    }
  }, [adapter, handleAuthFailure]);

  const importRecords = useCallback(
    async (file: File) => {
      if (!adapter) return;
      try {
        const text = await file.text();
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          notifications.show({ title: 'Error', message: 'Invalid JSON file.', color: 'red' });
          return;
        }

        if (!Array.isArray(parsed)) {
          notifications.show({ title: 'Error', message: 'Expected an array of records.', color: 'red' });
          return;
        }

        const { imported, skipped } = await adapter.importAll(parsed as ThoughtRecord[]);
        notifications.show({
          title: 'Import Complete',
          message: `Imported ${imported} records. ${skipped} skipped.`,
          color: 'green',
        });

        // Reload
        const years = await adapter.listYears();
        const activeYear = years.length > 0 ? years[0] : currentYear;
        dispatch({ type: 'SET_YEARS', years, activeYear });
        const records = await adapter.loadYear(state.activeYear);
        dispatch({ type: 'SET_RECORDS', records, year: state.activeYear });
      } catch (err) {
        handleAuthFailure(err);
      }
    },
    [adapter, state.activeYear, handleAuthFailure]
  );

  // Computed values
  const paginatedRecords = useMemo(() => {
    const start = (state.page - 1) * state.pageSize;
    return state.records.slice(start, start + state.pageSize);
  }, [state.records, state.page, state.pageSize]);

  const totalPages = useMemo(
    () => Math.ceil(state.records.length / state.pageSize) || 1,
    [state.records.length, state.pageSize]
  );

  const dayRecords = useMemo(() => {
    if (!state.selectedDay) return [];
    return state.records.filter((r) => {
      const d = new Date(r.dateTime);
      return (
        d.getFullYear() === state.selectedDay!.getFullYear() &&
        d.getMonth() === state.selectedDay!.getMonth() &&
        d.getDate() === state.selectedDay!.getDate()
      );
    });
  }, [state.records, state.selectedDay]);

  const setViewMode = useCallback((mode: 'summary' | 'list' | 'calendar') => {
    dispatch({ type: 'SET_VIEW_MODE', mode });
  }, []);

  const setPage = useCallback((page: number) => {
    dispatch({ type: 'SET_PAGE', page });
  }, []);

  const setPageSize = useCallback((size: number) => {
    dispatch({ type: 'SET_PAGE_SIZE', pageSize: size });
  }, []);

  const navigateMonth = useCallback(
    (direction: -1 | 1) => {
      const d = new Date(state.calendarMonth);
      d.setMonth(d.getMonth() + direction);
      dispatch({ type: 'SET_CALENDAR_MONTH', month: d });
    },
    [state.calendarMonth]
  );

  const selectDay = useCallback((date: Date | null) => {
    dispatch({ type: 'SET_SELECTED_DAY', day: date });
  }, []);

  return {
    ...state,
    paginatedRecords,
    totalPages,
    dayRecords,
    loadYear,
    createRecord,
    updateRecord,
    deleteRecord,
    exportRecords,
    importRecords,
    setViewMode,
    setPage,
    setPageSize,
    navigateMonth,
    selectDay,
  };
}
