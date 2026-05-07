import { useCallback, useRef, useState } from 'react';
import {
  ActionIcon,
  Center,
  Group,
  Loader,
  Menu,
  SegmentedControl,
  Select,
  Stack,
} from '@mantine/core';
import {
  IconCalendar,
  IconChartBar,
  IconDownload,
  IconList,
  IconPlus,
  IconUpload,
} from '@tabler/icons-react';
import { useEmotionBook } from './useEmotionBook';
import { SummaryView } from './components/SummaryView';
import { ListView } from './components/ListView';
import { ThoughtRecordForm } from './components/ThoughtRecordForm';
import { CalendarView } from './components/CalendarView';
import type { ThoughtRecord } from './types';

export default function EmotionBookModule() {
  const eb = useEmotionBook();
  const [formOpened, setFormOpened] = useState(false);
  const [editRecord, setEditRecord] = useState<ThoughtRecord | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleNewRecord = useCallback(() => {
    setEditRecord(undefined);
    setFormOpened(true);
  }, []);

  const handleEdit = useCallback((record: ThoughtRecord) => {
    setEditRecord(record);
    setFormOpened(true);
  }, []);

  const handleDelete = useCallback(
    (record: ThoughtRecord) => {
      if (window.confirm('Are you sure you want to delete this thought record?')) {
        eb.deleteRecord(record);
      }
    },
    [eb]
  );

  const handleFormSubmit = useCallback(
    (data: Omit<ThoughtRecord, 'id'> | ThoughtRecord) => {
      if ('id' in data && data.id) {
        const { id, ...rest } = data;
        eb.updateRecord(id, rest);
      } else {
        eb.createRecord(data as Omit<ThoughtRecord, 'id'>);
      }
    },
    [eb]
  );

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        eb.importRecords(file);
        e.target.value = '';
      }
    },
    [eb]
  );

  if (eb.loading) {
    return (
      <Center style={{ flex: 1 }}>
        <Loader size="xl" variant="dots" />
      </Center>
    );
  }

  const yearOptions = eb.availableYears.length > 0
    ? eb.availableYears.map((y) => ({ value: y, label: y }))
    : [{ value: String(new Date().getFullYear()), label: String(new Date().getFullYear()) }];

  return (
    <Stack gap="md" p="md" style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
      {/* Toolbar */}
      <Group gap="sm">
        <SegmentedControl
          size="xs"
          data={[
            { value: 'summary', label: <Center style={{ width: 14, height: 14 }}><IconChartBar size={14} /></Center> },
            { value: 'list', label: <Center style={{ width: 14, height: 14 }}><IconList size={14} /></Center> },
            { value: 'calendar', label: <Center style={{ width: 14, height: 14 }}><IconCalendar size={14} /></Center> },
          ]}
          value={eb.viewMode}
          onChange={(v) => eb.setViewMode(v as 'summary' | 'list' | 'calendar')}
        />
        <Select
          size="xs"
          data={yearOptions}
          value={eb.activeYear}
          onChange={(v) => v && eb.loadYear(v)}
          w={90}
        />
      </Group>

      {/* Content */}
      {eb.viewMode === 'summary' ? (
        <SummaryView records={eb.records} activeYear={eb.activeYear} />
      ) : eb.viewMode === 'list' ? (
        <ListView
          records={eb.paginatedRecords}
          activeYear={eb.activeYear}
          page={eb.page}
          pageSize={eb.pageSize}
          totalPages={eb.totalPages}
          onPageChange={eb.setPage}
          onPageSizeChange={eb.setPageSize}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      ) : (
        <CalendarView
          records={eb.records}
          currentMonth={eb.calendarMonth}
          selectedDay={eb.selectedDay}
          onNavigateMonth={eb.navigateMonth}
          onSelectDay={eb.selectDay}
          dayRecords={eb.dayRecords}
          onEditRecord={handleEdit}
          onDeleteRecord={handleDelete}
        />
      )}

      {/* Form modal */}
      <ThoughtRecordForm
        opened={formOpened}
        onClose={() => setFormOpened(false)}
        onSubmit={handleFormSubmit}
        editRecord={editRecord}
      />

      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleFileSelected}
      />

      {/* FAB menu */}
      <Menu shadow="md" width={200} position="top-end">
        <Menu.Target>
          <ActionIcon
            size="xl"
            radius="xl"
            variant="filled"
            style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 100 }}
          >
            <IconPlus size={22} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item leftSection={<IconPlus size={16} />} onClick={handleNewRecord}>
            New Record
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item leftSection={<IconDownload size={16} />} onClick={eb.exportRecords}>
            Export All
          </Menu.Item>
          <Menu.Item leftSection={<IconUpload size={16} />} onClick={handleImportClick}>
            Import from EmotionBook
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Stack>
  );
}
