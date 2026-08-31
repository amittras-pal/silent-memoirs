# Past Entry Date Selector in Editor Quick Viewer

## Feature ID: FEAT-0017
**Status**: Completed  

---

## Objective
Extend the integrated `LastEntryViewer` component within the Editor into a flexible **Past Entry Viewer**. Instead of exclusively loading the most recent entry, the viewer header will feature a minimal datepicker popover trigger that enables users to browse, select, and view *any* past journal entry while drafting in the Editor without navigating away or losing writing context.

Additionally, the viewer retains state across closes so that closing and reopening the panel resumes the active entry directly without repeating the selection flow, with a header back arrow button allowing users to navigate back and reset to an empty view at any time.

---

## Background & Problem Statement
- **Context**: In [FEAT-0016](file:///c:/Users/Amittras/Projects/1-Client/silent-memories/funnel/FEAT-0016-Last%20Entry%20Quick%20Access%20in%20Editor.md), an in-editor split panel (`LastEntryViewer` / `LastEntrySplitView`) and mobile modal were introduced to give users quick access to their latest recorded journal entry directly from the Editor canvas.
- **Problem**: In practical journaling workflows, writers frequently need to reference notes, reflections, or entries written days, weeks, or even years prior (e.g. tracking habits, revisiting milestones, or cross-referencing previous thoughts). Currently, viewing anything older than the immediate last entry requires abandoning the Editor canvas, navigating to the folder hierarchy at `/entries`, opening the full `/viewer`, and navigating back.
- **Proposed Solution**: 
  - Enhance the quick viewer header by embedding a minimal, non-intrusive DatePicker popover.
  - Dynamically index all available entry dates from the vault manifest, keeping active (clickable) only those calendar dates that have one or more saved entries (while disabling empty days).
  - When an active date contains a single entry, directly load and display that entry.
  - When an active date contains multiple entries, render an in-panel selection list so the user can choose which entry to read.
  - **State Memory & Resume**: If the viewer is closed while an entry is open, reopening the viewer restores that active entry immediately without restarting the selection flow.
  - **Back Navigation & Empty View**: Provide a back arrow button in the header so the user can step back to the day list (if multi-entry) or return to an empty view.

---

## User Experience & Interaction Flow

```
[ Editor Header Action: IconHistory ]
                 │
                 ▼ (Opens Split Panel / Modal)
+─────────────────────────────────────────────────────────────────────────────────+
| Viewer Header: [←] [ 📅 Aug 24, 2026 ▾ ] (DatePicker Popover)      [A- A+] [↗] [✕]|
+─────────────────────────────────────────────────────────────────────────────────+
                 │
                 ├──► [Viewer Reopened with Active Entry]:
                 │        └── Immediately restores the remembered entry (no re-select needed)
                 │
                 ├──► [User clicks Header Back Arrow (←)]:
                 │        ├── From Entry (Multi-entry day) ──► Returns to Day Selection List
                 │        └── From Entry (Single day) / From Day List ──► Returns to Empty Viewer State
                 │
                 ├──► [User clicks Date Trigger] ──► Opens Mantine DatePicker Popover
                 │                                   ├── Dates with 0 entries: Disabled
                 │                                   └── Dates with 1+ entries: Active & Clickable
                 │
                 ├──► [User selects date with 1 entry]
                 │        └── Closes popover, instantly loads & decrypts entry in Markdown Viewer
                 │
                 └──► [User selects date with >1 entries]
                          └── Closes popover, renders "Day Selection List" in viewer panel
                                   └── User clicks specific entry ──► Loads entry in Markdown Viewer
                                   └── Header shows "←" to return to Day Selection List
```

---

## Detailed Requirements & UI Specifications

### 1. Minimal DatePicker Popover in Viewer Header
- **Placement**: Located on the left side of the `PastEntryViewer` header bar (adjacent to the back button and replacing the static "Last Entry" badge/text).
- **Trigger Component**:
  - A compact, polished button/badge showing a calendar icon (`IconCalendar` or `IconCalendarEvent`), the formatted date of the currently viewed entry (e.g., `Aug 24, 2026`), and a subtle chevron (`IconChevronDown`).
  - If no entry is currently selected or vault is empty, displays `Select Date`.
  - Styled with subtle hover feedback (`variant="light"` or `variant="subtle"` using the application terracotta/primary theme palette).
- **Popover Behavior**:
  - Clicking the trigger opens a Mantine `Popover` containing a compact `@mantine/dates` `DatePicker`.
  - Positioned with `position="bottom-start"`, `withinPortal={true}`, and proper collision/offset padding to guarantee it never clips outside split panel or modal bounds.

---

### 2. Active Date Filtering & Visual Styling
- **Entry Date Indexing**:
  - The component/hook scans all entry metadata from `syncEngine.getEntryMetadata()`.
  - Filters out the active draft entry (if the user is editing an existing entry) to prevent self-referencing.
  - Groups entries by date string `YYYY-MM-DD` into an index map: `Map<string, EntryMetadata[]>`.
- **Date Interactivity & Disabling**:
  - Dates with **0 entries** are set to `disabled` (unclickable, muted opacity, non-interactive cursor).
  - Dates with **1 or more entries** are enabled and highlighted with an active visual indicator (e.g. bold weight or distinct day styling).
  - The currently selected date is given the standard Mantine selected state.

---

### 3. Date Selection & Multi-Entry Disambiguation
When the user clicks an active date in the DatePicker popover:
1. **Single Entry Day (`entries.length === 1`)**:
   - The popover closes automatically.
   - The viewer fetches and decrypts the single entry.
   - Viewer renders the Markdown content and decrypted images.
   - Header date trigger updates to the selected date.
2. **Multiple Entries Day (`entries.length > 1`)**:
   - The popover closes automatically.
   - The viewer section transitions to a **Day Selection List** view (`viewState = 'day_selection'`).
   - In the viewer body, a clean list of interactive cards is displayed:
     - Entry title (bold, line-clamped).
     - Formatted time badge (`HH:mm` or `h:mm A`).
     - Subtle icon (`IconFileText`).
     - Optional word count / snippet if cached.
   - Clicking an entry item in the list loads and displays that entry's full decrypted content.

---

### 4. State Retention Across Viewer Close & Reopen
- **Persistence Mechanism**:
  - When the user closes the viewer panel or modal (`isOpen = false`), the active selection state (`selectedDate`, `selectedEntryPath`, `selectedEntry`, and `viewState`) is retained in component/session memory.
  - When the user reopens the viewer (`isOpen = true`), the system checks for a previously loaded entry.
  - **Resume Behavior**: If an entry was open at the time of closing, the viewer immediately restores and displays that entry directly without resetting the view or forcing the user to pick a date again.
  - If no entry was open (e.g. initial fresh vault launch or after clicking back to empty view), the viewer defaults to the latest past entry or the empty view state.

---

### 5. Header Back Arrow Button & Empty View Reset
- **Back Button Placement**:
  - Positioned on the far left of the viewer header (before the date trigger button).
  - Uses `IconArrowLeft` (or `IconChevronLeft`) as a subtle `ActionIcon` with a descriptive tooltip (`Back / Clear Selection`).
  - Only visible/active when an entry or day selection list is active.
- **Hierarchical Navigation Behavior**:
  1. **When viewing an entry from a multi-entry day**:
     - Clicking the back button navigates back to the **Day Selection List** for that date (`viewState = 'day_selection'`).
  2. **When viewing a single-entry day OR when on the Day Selection List**:
     - Clicking the back button clears the active entry and returns the viewer to an **Empty View** (`viewState = 'empty'`).
- **Empty View Experience**:
  - Centered placeholder with an icon (`IconCalendarSearch` or `IconHistory`), friendly prompt (`Select a date above to view an entry`), and an optional quick-action button (`Pick a Date` / `Load Last Entry`).
  - Allows users to deliberately reset the viewer pane to an uncluttered state without closing the split layout.

---

## Detailed Implementation Breakdown

### 1. Hook Extension: `usePastEntry` (or Enhanced `useLastEntry`)
- **File**: [app/src/modules/editor/useLastEntry.ts](file:///c:/Users/Amittras/Projects/1-Client/silent-memories/app/src/modules/editor/useLastEntry.ts) (or `usePastEntryViewer.ts`)
- **Responsibilities**:
  - Fetch entry metadata on mount / open.
  - Group entries by `YYYY-MM-DD`.
  - Maintain persistent state: `selectedDate`, `selectedEntryPath`, `selectedEntry`, `dayEntries`, and `viewState` (`'entry' | 'day_selection' | 'empty' | 'loading' | 'error'`).
  - Cache decrypted entries in `cachedEntriesRef: Map<string, JournalEntry>`.
  - Provide `goBack()` action to handle multi-level back navigation (Entry → Day List → Empty View).

```typescript
export type PastEntryViewState = 'entry' | 'day_selection' | 'empty' | 'loading' | 'error';

export interface PastEntryState {
  isOpen: boolean;
  isLoading: boolean;
  error: string | null;
  hasEntries: boolean;
  viewState: PastEntryViewState;
  
  // Date & Entry selection
  selectedDate: Date | null;
  selectedEntryPath: string | null;
  selectedEntry: JournalEntry | null;
  
  // Metadata & Multi-entry support
  entriesByDate: Map<string, EntryMetadata[]>;
  activeDayEntries: EntryMetadata[];
  canGoBack: boolean;
  
  // Actions
  open: () => void;
  close: () => void;
  toggle: () => void;
  selectDate: (date: Date) => void;
  selectEntry: (entryPath: string) => void;
  goBack: () => void;
  clearToEmpty: () => void;
  refresh: () => Promise<void>;
}
```

---

### 2. Header Bar with Back Button & DatePicker Popover
- **File**: `app/src/modules/editor/PastEntryViewerHeader.tsx` (or inside `LastEntryViewer.tsx`)
- **Implementation**:
  - Left group: Back button (`IconArrowLeft`) + DatePicker popover trigger (`Button` with `IconCalendar` and `IconChevronDown`).
  - Right group: Font size adjuster (`IconMinus`, `IconPlus`), full viewer shortcut (`IconExternalLink`), and panel close button (`IconX`).

```tsx
<Group justify="space-between" align="center" wrap="nowrap" p="xs">
  <Group gap="xs" wrap="nowrap" align="center">
    {canGoBack && (
      <Tooltip label="Back / Clear" withArrow position="bottom">
        <ActionIcon variant="subtle" color="gray" size="sm" onClick={onGoBack}>
          <IconArrowLeft size={16} stroke={1.5} />
        </ActionIcon>
      </Tooltip>
    )}

    <Popover position="bottom-start" shadow="md" withinPortal withArrow>
      <Popover.Target>
        <Button
          variant="light"
          color="terracotta"
          size="xs"
          leftSection={<IconCalendar size={14} />}
          rightSection={<IconChevronDown size={12} />}
        >
          {selectedDate ? dayjs(selectedDate).format('MMM D, YYYY') : 'Select Date'}
        </Button>
      </Popover.Target>
      <Popover.Dropdown p="xs">
        <DatePicker
          value={selectedDate}
          onChange={(date) => date && onSelectDate(date)}
          maxDate={new Date()}
          getDayProps={(date) => {
            const dayKey = dayjs(date).format('YYYY-MM-DD');
            return { disabled: !entriesByDate.has(dayKey) };
          }}
          renderDay={(date) => {
            const dayKey = dayjs(date).format('YYYY-MM-DD');
            const dayEntries = entriesByDate.get(dayKey);
            if (!dayEntries || dayEntries.length === 0) {
              return <span>{dayjs(date).date()}</span>;
            }

            const tooltipContent = (
              <Stack gap={2} p={2}>
                {dayEntries.map((e) => (
                  <Text key={e.path} size="xs">
                    • {resolveEntryTitle(e.title, e.date)}
                    {e.date.includes('_') && ` (${e.date.split('_')[1].replace('-', ':')})`}
                  </Text>
                ))}
              </Stack>
            );

            return (
              <Tooltip label={tooltipContent} withinPortal multiline withArrow>
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {dayjs(date).date()}
                </div>
              </Tooltip>
            );
          }}
        />
      </Popover.Dropdown>
    </Popover>
  </Group>

  <Group gap={4} wrap="nowrap">
    {/* Font size scaling, Full Viewer navigation, Close icon */}
  </Group>
</Group>
```

---

### 3. Multi-Entry Day Selection Component
- **File**: `app/src/modules/editor/PastEntryDayList.tsx`
- **Implementation**:
  - Displayed when `viewState === 'day_selection'`.
  - Header shows: `Entries for [Date] ([Count] entries)`.
  - Renders a vertical list of interactive cards with title, timestamp (`HH:mm`), and chevron icon.
  - Clicking a card triggers `selectEntry(entry.path)`.

```tsx
<Stack gap="xs" p="md">
  <Text size="xs" fw={700} c="dimmed">
    MULTIPLE ENTRIES FOUND ({dayEntries.length})
  </Text>
  {dayEntries.map((entry) => (
    <Card
      key={entry.path}
      withBorder
      p="sm"
      radius="md"
      style={{ cursor: 'pointer' }}
      onClick={() => onSelectEntry(entry.path)}
    >
      <Group justify="space-between" wrap="nowrap">
        <Stack gap={2} style={{ minWidth: 0 }}>
          <Text fw={600} size="sm" lineClamp={1}>
            {resolveEntryTitle(entry.title, entry.date)}
          </Text>
          <Text size="xs" c="dimmed">
            {formatEntryTime(entry.date)}
          </Text>
        </Stack>
        <IconChevronRight size={16} color="gray" />
      </Group>
    </Card>
  ))}
</Stack>
```

---

### 4. Empty View Component
- **File**: `app/src/modules/editor/PastEntryEmptyView.tsx` (or integrated in `LastEntryViewer.tsx`)
- **Implementation**:
  - Rendered when `viewState === 'empty'`.
  - Shows an icon (`IconCalendarSearch`), informative prompt, and button to open the DatePicker or load the latest entry.

---

## Wireframe & Layout Visuals

### Desktop Split-View: Active Entry Display with Back Button
```
+------------------------------------+---+----------------------------------------------------+
| Editor: [ My New Thoughts        ] | | | Viewer: [←] [ 📅 Aug 24, 2026 ▾ ]   [A- A+] [↗] [✕]|
+------------------------------------+ | +----------------------------------------------------+
|                                    | | | # Trip to Kyoto                                    |
| Today I started working on...      | | |                                                    |
|                                    | | | We visited the bamboo forest in the morning...     |
| [ Markdown writing canvas ]        | | |                                                    |
|                                    | | | ![Bamboo Forest](media/kyoto-1.jpg)                |
+------------------------------------+---+----------------------------------------------------+
```

### Desktop Split-View: Multi-Entry Day Disambiguation List
```
+------------------------------------+---+----------------------------------------------------+
| Editor: [ My New Thoughts        ] | | | Viewer: [←] [ 📅 Aug 24, 2026 ▾ ]               [✕]|
+------------------------------------+ | +----------------------------------------------------+
|                                    | | | ENTRIES FOR AUG 24, 2026 (2 ENTRIES)               |
| Today I started working on...      | | |                                                    |
|                                    | | | +------------------------------------------------+ |
| [ Markdown writing canvas ]        | | | | 📄 Morning Standup Notes               09:15 > | |
|                                    | | | +------------------------------------------------+ |
|                                    | | | | 📄 Evening Trip Reflections            21:30 > | |
|                                    | | | +------------------------------------------------+ |
+------------------------------------+---+----------------------------------------------------+
```

### Desktop Split-View: Empty View State (After Clicking Back)
```
+------------------------------------+---+----------------------------------------------------+
| Editor: [ My New Thoughts        ] | | | Viewer: [ 📅 Select Date ▾ ]                    [✕]|
+------------------------------------+ | +----------------------------------------------------+
|                                    | | |                                                    |
| Today I started working on...      | | |                  📅                                |
|                                    | | |           No Entry Selected                        |
| [ Markdown writing canvas ]        | | |    Select a date from the header above to          |
|                                    | | |    view past journal entries alongside your draft. |
|                                    | | |                                                    |
+------------------------------------+---+----------------------------------------------------+
```

---

## Acceptance Criteria

- [x] **Header DatePicker Trigger**:
  - [x] A minimal datepicker popover trigger is rendered in the viewer header bar.
  - [x] Clicking the trigger opens a Mantine `Popover` containing a `DatePicker`.
  - [x] Popover layout is contained and does not clip outside split view or modal boundaries.

- [x] **Date Interactivity & Filtering**:
  - [x] Dates with 0 saved entries are completely disabled and cannot be clicked.
  - [x] Dates with 1+ saved entries are enabled and visually highlighted.
  - [x] The entry currently being edited in the active editor session is excluded from the available dates to prevent self-referencing.

- [x] **Single-Entry Date Selection**:
  - [x] Clicking a date with exactly 1 entry automatically closes the popover.
  - [x] The entry content is fetched, decrypted, and displayed in the markdown viewer.
  - [x] Header updates to show the selected entry's date.

- [x] **Multi-Entry Date Selection (Disambiguation)**:
  - [x] Clicking a date with >1 entries closes the popover and renders the Day Selection List.
  - [x] Each entry is shown with its title and formatted timestamp.
  - [x] Clicking any entry in the list loads and renders the full entry content.

- [x] **State Retention on Close & Reopen**:
  - [x] If the viewer is closed with an active entry open, reopening the viewer restores that entry immediately without going through the date selection flow again.

- [x] **Header Back Arrow & Empty View Navigation**:
  - [x] A back button appears in the header when an entry or day selection list is active.
  - [x] Clicking back while viewing an entry from a multi-entry day returns to the day selection list.
  - [x] Clicking back from a single-entry view (or from the day selection list) returns the viewer to the empty view.
  - [x] The empty view displays a clear prompt explaining that the user can pick a date to view entries.

- [x] **Caching & Performance**:
  - [x] Decrypted entries are cached in memory so switching back and forth between dates incurs zero redundant decryption operations.
  - [x] Date indexing and popover interactions do not degrade Editor writing performance (60 FPS maintained).

- [x] **Responsive & Mobile Viewports**:
  - [x] DatePicker popover, multi-entry selection list, and back navigation function cleanly inside the desktop split panel (`LastEntrySplitView`) and the mobile modal overlay.
  - [x] Open in full viewer button (`IconExternalLink`) navigates to `/viewer/:entryPath` for whatever entry is currently active.

---

## Dependencies & Considerations

- **Dependencies**:
  - `@mantine/dates` (`DatePicker`, `Month`, `Calendar`).
  - `@mantine/core` (`Popover`, `Tooltip`, `Card`, `Button`, `ActionIcon`, `Text`, `Stack`, `Group`, `Badge`).
  - `@tabler/icons-react` (`IconCalendar`, `IconChevronDown`, `IconChevronRight`, `IconArrowLeft`, `IconFileText`, `IconHistory`, `IconCalendarSearch`).
  - `app/src/lib/sync.ts` (`SyncEngine`, `getEntryMetadata()`, `fetchEntry()`).
  - `app/src/lib/entryTitle.ts` (`resolveEntryTitle()`).
- **Considerations**:
  - **Date Normalization**: Ensure date comparisons use `YYYY-MM-DD` strings formatted via `dayjs` to prevent timezone offsets from misaligning entries with calendar cells.
  - **Decryption Security**: Decryption happens on-demand via the session's `AgeIdentity.secretKey` and decrypted entries reside only in memory.
  - **Reactivity on Save**: When an entry is saved in the editor, the date index should refresh so the newly saved date/entry immediately becomes available in the datepicker.
