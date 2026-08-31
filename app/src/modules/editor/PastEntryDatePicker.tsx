import { Button, Popover } from '@mantine/core';
import { DatePicker } from '@mantine/dates';
import { IconCalendar, IconChevronDown } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import type { EntryMetadata } from '../../lib/sync';

interface PastEntryDatePickerProps {
  selectedDate: Date | null;
  entriesByDate: Map<string, EntryMetadata[]>;
  onSelectDate: (date: Date) => void;
  disabled?: boolean;
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

export function PastEntryDatePicker({
  selectedDate,
  entriesByDate,
  onSelectDate,
  disabled = false,
}: PastEntryDatePickerProps) {
  const [opened, setOpened] = useState(false);

  const displayDateText = useMemo(() => {
    if (!selectedDate || Number.isNaN(selectedDate.getTime())) {
      return 'Select Date';
    }
    return dayjs(selectedDate).format('MMM D, YYYY');
  }, [selectedDate]);

  const datePickerValue = useMemo(() => {
    if (!selectedDate || Number.isNaN(selectedDate.getTime())) return null;
    return dayjs(selectedDate).format('YYYY-MM-DD');
  }, [selectedDate]);

  const handleDateSelection = (dateOrKey: Date | string) => {
    const { localDate } = parseDayKeyToLocalDate(dateOrKey);
    onSelectDate(localDate);
    setOpened(false);
  };

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-start"
      shadow="md"
      withinPortal
      withArrow
      disabled={disabled}
    >
      <Popover.Target>
        <Button
          variant="light"
          color="terracotta"
          size="xs"
          leftSection={<IconCalendar size={14} />}
          rightSection={<IconChevronDown size={12} />}
          onClick={() => setOpened((o) => !o)}
          disabled={disabled}
          styles={{
            root: {
              fontWeight: 600,
            },
          }}
        >
          {displayDateText}
        </Button>
      </Popover.Target>

      <Popover.Dropdown p="xs">
        <DatePicker
          value={datePickerValue}
          onChange={(val) => {
            if (val) {
              handleDateSelection(val);
            }
          }}
          maxDate={new Date()}
          getDayProps={(date) => {
            const { dayKey } = parseDayKeyToLocalDate(date);
            const dayEntries = entriesByDate.get(dayKey);
            const hasEntries = !!(dayEntries && dayEntries.length > 0);

            return {
              disabled: !hasEntries,
              style: hasEntries
                ? {
                    fontWeight: 700,
                    cursor: 'pointer',
                  }
                : undefined,
              onClick: () => {
                if (hasEntries) {
                  handleDateSelection(date);
                }
              },
            };
          }}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
