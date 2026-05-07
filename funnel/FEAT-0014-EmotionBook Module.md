# EmotionBook — CBT Thought Record Module

## Feature ID: FEAT-0014
**Status**: Completed

## Objective
Migrate the standalone EmotionBook Angular app into Silent Memoirs as a fully encapsulated React feature module. All EmotionBook functionality — CBT thought record creation, emotion wheel interaction, calendar visualization, and data management — will live within `src/modules/emotionbook/`. The standalone Angular app will be deprecated and retired after migration is complete.

## Background & Requirements
EmotionBook is a CBT (Cognitive Behavioral Therapy) Thought Record tool currently built as a standalone Angular 21 PWA using IndexedDB for client-only storage. It allows users to log situations, automatic thoughts, and emotions (selected via an interactive sunburst chart) with intensity ratings.

**Migration goals:**
- All thought record data stored as encrypted `.age` files in the user's Google Drive vault, partitioned by year
- Full feature parity with the standalone app: CRUD, emotion wheel, calendar view, import/export
- All code encapsulated within `src/modules/emotionbook/` — no emotionbook-specific logic leaks into shared app code
- Direct use of existing vault infrastructure (`StorageProvider`, `encryptData`/`decryptData`, `AppContext`)

**Data model being ported:**
```typescript
interface ThoughtRecord {
  id: string;                              // crypto.randomUUID()
  dateTime: Date;                          // when the event occurred
  situation: string;                       // free text
  automaticThoughts: string;               // free text
  emotionIntensity: number;                // average intensity (legacy compat)
  emotionIntensities?: EmotionIntensity[]; // per-selection intensities (10–100)
  emotionSelections?: EmotionSelection[];  // multi-select chains (max 5)
  coreEmotion?: string;                   // legacy single-select fields
  secondaryEmotion?: string;
  tertiaryEmotion?: string;
}

interface EmotionSelection {
  coreEmotion?: string;
  secondaryEmotion?: string;
  tertiaryEmotion?: string;
}

interface EmotionIntensity {
  emotionId: string;       // ID of most specific emotion in selection chain
  intensity: number;       // 10–100, default 50
}
```

**Emotion taxonomy:** 3-level hierarchy — 7 core emotions (Happy, Sad, Angry, Scared, Bad, Surprised, Disgusted), each with secondary and tertiary children. Stored as static JSON (~120 entries).

---

## Detailed Implementation Breakdown

### 1. Data Model & Types (`src/modules/emotionbook/types.ts`)

Port all interfaces and utility functions from `emotionbook/src/app/models/thought-record.model.ts` and `emotion.model.ts`:

**Interfaces to port:**
- `ThoughtRecord` — main entity (serialize `dateTime` as ISO string for JSON storage)
- `EmotionSelection` — core/secondary/tertiary emotion chain
- `EmotionIntensity` — emotionId + intensity pair
- `Emotion` — `{ id, name, level: 'core'|'secondary'|'tertiary', parentId?, color }`
- `EmotionTree` — hierarchical emotion structure for the sunburst chart

**Constants to port:**
- `MAX_EMOTION_SELECTIONS = 5`
- `MIN_EMOTION_INTENSITY = 10`
- `MAX_EMOTION_INTENSITY = 100`
- `DEFAULT_EMOTION_INTENSITY = 50`

**Utility functions to port (~10 functions):**
- `sanitizeEmotionId(emotionId?)` — trims whitespace, returns undefined for empty
- `normalizeEmotionIntensityValue(intensity)` — clamps to [10,100], rounds, handles NaN
- `normalizeEmotionIntensities(intensities[])` — deduplicates by emotionId, caps at MAX_EMOTION_SELECTIONS
- `normalizeEmotionSelection(selection)` — validates chain integrity (core required if secondary present, etc.)
- `normalizeEmotionSelections(selections[])` — filters invalid, deduplicates, caps at 5
- `getEffectiveEmotionSelections(record)` — handles legacy single-select → array conversion
- `getAverageIntensity(record)` — computes average from `emotionIntensities` or falls back to `emotionIntensity`
- `getMostSpecificEmotionId(selection)` — returns deepest non-null emotion in a chain
- `buildLegacyFields(selections)` — backfills `coreEmotion`/`secondaryEmotion`/`tertiaryEmotion` from first selection for backward compat during import

**New type for storage format:**
```typescript
interface EmotionBookYearFile {
  version: 1;
  year: string;
  updatedAt: string; // ISO timestamp
  records: ThoughtRecord[]; // dateTime serialized as ISO string
}
```

---

### 2. Emotion Taxonomy Asset (`src/modules/emotionbook/assets/emotions.json`)

Direct copy of `emotionbook/src/assets/emotions.json`. This is a static JSON file containing ~120 emotion entries in a flat array with parent references. No transformation needed — it's framework-agnostic data.

Structure: `Array<{ id: string; name: string; level: string; parentId?: string; color: string }>`

---

### 3. Storage Adapter (`src/modules/emotionbook/sync.ts`)

**Class: `EmotionBookSyncAdapter`**

Encapsulates all Google Drive I/O for EmotionBook data. Does NOT extend or modify `SyncEngine` — completely standalone, uses only `StorageProvider` and crypto functions from `lib/crypto.ts`.

**Constructor dependencies (from `AppContext`):**
- `storage: StorageProvider` — Google Drive file operations
- `identity: AgeIdentity` — `{ publicKey, secretKey }` for encryption/decryption

**Storage layout on Google Drive:**
```
silent-memoirs/
└── emotionbook/
    ├── 2024.age    # Encrypted EmotionBookYearFile for 2024
    ├── 2025.age    # Encrypted EmotionBookYearFile for 2025
    └── 2026.age    # Encrypted EmotionBookYearFile for 2026
```

**Methods:**

| Method | Signature | Behavior |
|--------|-----------|----------|
| `listYears` | `() → Promise<string[]>` | Lists `emotionbook/` directory, extracts year from filenames matching `YYYY.age`, returns sorted descending |
| `loadYear` | `(year: string) → Promise<ThoughtRecord[]>` | Downloads `emotionbook/${year}.age`, decrypts with `decryptData(secretKey, bytes)`, parses JSON, returns `records` array with `dateTime` deserialized to `Date` objects, sorted newest-first |
| `saveYear` | `(year: string, records: ThoughtRecord[]) → Promise<void>` | Serializes `EmotionBookYearFile` (with `dateTime` as ISO string), encrypts with `encryptData(publicKey, data)`, uploads to `emotionbook/${year}.age` (overwrite) |
| `deleteRecord` | `(record: ThoughtRecord) → Promise<void>` | Loads year file for `record.dateTime.getFullYear()`, removes record by `id`, saves year file back. If year file becomes empty, deletes the file. |
| `exportAll` | `() → Promise<ThoughtRecord[]>` | Lists all years, loads each, merges and sorts by dateTime descending |
| `importAll` | `(records: ThoughtRecord[]) → Promise<{ imported: number; skipped: number }>` | Validates each record with normalization functions, partitions by year (`dateTime.getFullYear()`), merges with existing year files (skip duplicates by `id`), saves each modified year |
| `ensureDirectory` | `() → Promise<void>` | Creates `emotionbook/` folder on Drive if it doesn't exist (called on first write) |

**Key implementation details:**
- All encryption uses `encryptData(publicKey, new TextEncoder().encode(json))` — same pattern as journal entries
- All decryption uses `decryptData(secretKey, encryptedBytes)` then `new TextDecoder().decode()`
- `dateTime` is stored as ISO string in JSON but exposed as `Date` objects to consumers
- Records within a year file are sorted newest-first by `dateTime`
- No caching at this layer — the hook layer handles memoization

---

### 4. State Hook (`src/modules/emotionbook/useEmotionBook.ts`)

**Hook: `useEmotionBook()`**

Central state management hook for the EmotionBook module. Manages loaded data, CRUD operations, pagination, and view state.

**Dependencies:** `useAppContext()` to get `storage` + vault `identity` → constructs `EmotionBookSyncAdapter`

**State shape:**
```typescript
{
  // Data
  records: ThoughtRecord[];          // Currently loaded records (single year)
  availableYears: string[];          // All years with data
  activeYear: string;                // Currently viewed year (default: current year)
  loading: boolean;
  
  // View
  viewMode: 'list' | 'calendar';
  
  // Pagination (list view)
  page: number;
  pageSize: 10 | 20 | 50 | 100;
  
  // Calendar
  calendarMonth: Date;               // Currently viewed month
  selectedDay: Date | null;          // Day selected in calendar (shows day's records)
}
```

**Actions exposed:**
- `loadYear(year)` — fetches year file, updates `records` and `activeYear`
- `createRecord(data)` — assigns `crypto.randomUUID()` as id, current timestamp, normalizes emotions, adds to current records, calls `saveYear()`
- `updateRecord(id, data)` — finds record, merges changes, normalizes, saves year. If year changed (dateTime edited to different year), removes from old year file and adds to new.
- `deleteRecord(id)` — confirms with user (Mantine `modals.openConfirmModal`), removes from state, calls adapter `deleteRecord()`
- `setViewMode(mode)` — toggles list/calendar
- `setPage(n)` / `setPageSize(n)` — pagination controls (resets page to 1 on pageSize change)
- `navigateMonth(direction)` — for calendar month navigation
- `selectDay(date)` — shows records for a specific day in calendar view
- `exportRecords()` — calls `exportAll()`, triggers browser download as `emotionbook-export-YYYY-MM-DD.json`
- `importRecords(file: File)` — reads JSON file, calls `importAll()`, reloads current year, shows notification with import count

**Computed values:**
- `paginatedRecords` — slice of `records` for current page/pageSize
- `totalPages` — `Math.ceil(records.length / pageSize)`
- `dayRecords` — records filtered by `selectedDay` (for calendar day-detail view)
- `calendarData` — records for `calendarMonth`'s year, grouped by day with emotion colors and max intensity (for calendar grid rendering)

**Lifecycle:**
- On mount: call `listYears()`, load current year (or most recent year with data)
- On `activeYear` change: fetch that year's data

---

### 5. Taxonomy Hook (`src/modules/emotionbook/useEmotionTaxonomy.ts`)

**Hook: `useEmotionTaxonomy()`**

Loads and memoizes the emotion taxonomy from `emotions.json`. Provides lookup functions used by the emotion wheel and record display.

**Ported from:** `emotionbook/src/app/services/emotion.service.ts`

**Returns:**
```typescript
{
  emotions: Emotion[];                              // Full flat list
  tree: EmotionTree[];                              // Hierarchical structure for sunburst
  getEmotion: (id: string) => Emotion | undefined;  // By ID lookup
  getChildren: (parentId: string) => Emotion[];     // Direct children of a parent
  getChain: (emotionId: string) => Emotion[];       // Full path from core → tertiary
  getEmotionLabel: (emotionId: string) => string;   // Display name
  getEmotionColor: (emotionId: string) => string;   // Hex color (inherits from core parent)
  buildSunburstData: () => EChartsSunburstNode[];   // Transform tree into ECharts-compatible format
}
```

**Implementation details:**
- `useMemo` for all derived structures (tree, lookup maps)
- `buildSunburstData()` transforms the flat emotion list into nested ECharts sunburst nodes: `{ name, value, itemStyle: { color }, children: [...] }`
- Color inheritance: secondary/tertiary emotions use their core ancestor's color (with varying opacity for depth indication in the sunburst)
- The hierarchy is: core (level 0, 7 items) → secondary (level 1, ~30 items) → tertiary (level 2, ~80 items)

---

### 6. Emotion Wheel Component (`src/modules/emotionbook/components/EmotionWheel.tsx`)

**The most complex UI piece.** Interactive ECharts sunburst chart for selecting emotions.

**Ported from:** `emotionbook/src/app/components/thought-record-form/thought-record-form.ts` (sunburst chart logic, ~300 lines)

**Dependencies:**
- `echarts` + `echarts-for-react` (new packages to install)
- `useEmotionTaxonomy()` for chart data

**Props:**
```typescript
{
  selections: EmotionSelection[];                    // Current selections (controlled)
  onChange: (selections: EmotionSelection[]) => void; // Selection change callback
  maxSelections?: number;                            // Default: MAX_EMOTION_SELECTIONS (5)
  mode: 'single' | 'multi';                         // Single or multi-select mode
}
```

**Behavior:**
- Renders a full-width sunburst chart with 3 concentric rings (core → secondary → tertiary)
- **Click** on a segment: if in single mode, selects that emotion chain. If in multi mode, toggles selection (add/remove).
- **Drill-down**: clicking a core emotion zooms into its children via ECharts `dispatchAction({ type: 'sunburstRootToNode', targetNodeId })`. A "back" button resets to root.
- **Visual feedback**: selected segments get a highlight ring/border; unselected segments are slightly dimmed when selections exist
- **Selection limit**: when `maxSelections` reached, further clicks show a notification and are ignored
- **Responsive**: chart resizes with container using ECharts `autoResize` option

**ECharts config highlights:**
- Series type: `sunburst`
- `radius: ['15%', '95%']` (donut shape)
- `sort: null` (preserve taxonomy order)
- `levels` config for each ring's label visibility and itemStyle
- `emphasis.focus: 'ancestor'` for drill-down highlighting
- Event handler on `click` for selection logic

**Important note from repo memory:** ECharts sunburst `setOption` that touches `series.data` rebuilds the tree and resets drill-down. After style updates (selection highlighting), preserve/restore root with `dispatchAction({ type: 'sunburstRootToNode', targetNodeId })`.

---

### 7. Thought Record Form (`src/modules/emotionbook/components/ThoughtRecordForm.tsx`)

**Ported from:** `emotionbook/src/app/components/thought-record-form/thought-record-form.ts` (~800 lines including chart logic, reduced significantly since chart is now separate)

**Props:**
```typescript
{
  opened: boolean;
  onClose: () => void;
  onSubmit: (record: Omit<ThoughtRecord, 'id'> | ThoughtRecord) => void;
  editRecord?: ThoughtRecord;  // If provided, form is in edit mode
}
```

**UI layout (Mantine components):**
- `Modal` with `fullScreen` prop, title "New Thought Record" or "Edit Thought Record"
- `DateTimePicker` from `@mantine/dates` for `dateTime` (default: now)
- `Textarea` for `situation` (placeholder: "What was happening?")
- `Textarea` for `automaticThoughts` (placeholder: "What went through your mind?")
- `EmotionWheel` component (multi-select mode)
- For each selected emotion: `Slider` (10–100, step 5, marks at 25/50/75) showing the emotion name as label
- `SegmentedControl` to toggle single/multi select mode for the wheel
- Action buttons: Cancel, Save (disabled if no situation or no emotion selected)

**Form state (local `useState`):**
- `dateTime: Date`
- `situation: string`
- `automaticThoughts: string`
- `selections: EmotionSelection[]`
- `intensities: Map<string, number>` — keyed by `getMostSpecificEmotionId(selection)`

**On submit:**
- Build `ThoughtRecord` from form state
- Call normalization functions to ensure data integrity
- Compute `emotionIntensity` as average of all individual intensities
- Call `onSubmit` prop

---

### 8. Emotion Record Card (`src/modules/emotionbook/components/EmotionRecordCard.tsx`)

**Ported from:** `emotionbook/src/app/components/emotion-record-card/emotion-record-card.ts`

**Props:**
```typescript
{
  record: ThoughtRecord;
  onEdit: (record: ThoughtRecord) => void;
  onDelete: (record: ThoughtRecord) => void;
  taxonomy: ReturnType<typeof useEmotionTaxonomy>;
}
```

**UI layout:**
- Mantine `Card` with subtle border colored by primary emotion
- **Header row:** formatted date (`dayjs`), average intensity badge (colored by value: green < 40, yellow < 70, red ≥ 70)
- **Emotion chips:** `Group` of `Badge` components showing each selected emotion's name + individual intensity, colored by emotion color
- **Body:** situation text (truncated to 2 lines with `lineClamp`), automatic thoughts (truncated)
- **Actions:** `ActionIcon` for edit (pencil) and delete (trash) — using `@tabler/icons-react`
- Expandable via `Spoiler` or `Accordion` for full text if truncated

---

### 9. Calendar View (`src/modules/emotionbook/components/CalendarView.tsx`)

**Ported from:** `emotionbook/src/app/components/calendar-view/calendar-view.ts`

**Props:**
```typescript
{
  calendarData: Map<number, { emotions: Array<{ color: string; intensity: number }> }>;
  currentMonth: Date;
  selectedDay: Date | null;
  onNavigateMonth: (direction: -1 | 1) => void;
  onSelectDay: (date: Date) => void;
  dayRecords: ThoughtRecord[];
}
```

**UI layout:**
- **Month header:** `Group` with left/right `ActionIcon` arrows, month/year `Title`
- **Weekday headers:** row of 7 `Text` components (Mon–Sun)
- **Day grid:** 6×7 CSS grid of day cells
  - Each cell shows the day number
  - Below the number: horizontal colored bars (one per emotion recorded that day), bar width proportional to intensity
  - Days with records get a subtle background highlight
  - Selected day gets a prominent border/ring
  - Days outside current month are dimmed
- **Day detail panel:** below the calendar grid, shows `EmotionRecordCard` for each record on the selected day (or empty state message)

**Implementation detail:** The `calendarData` prop is pre-computed by the `useEmotionBook` hook — the component receives ready-to-render data, keeping it purely presentational.

---

### 10. Module Shell (`src/modules/emotionbook/index.tsx`)

**The route entry point.** Default export, lazy-loaded.

**Layout:**
- **Toolbar row:** 
  - `SegmentedControl` for list/calendar toggle
  - `Select` for year picker (populated from `availableYears`)
  - `Menu` with import/export options
  - `Button` "New Record" (opens form modal)
- **Content area:** conditionally renders list view or calendar view based on `viewMode`
- **List view:**
  - Renders `EmotionRecordCard` for each item in `paginatedRecords`
  - `Pagination` component at bottom (Mantine)
  - `Select` for page size (10/20/50/100)
  - Empty state with illustration when no records
- **Calendar view:** renders `CalendarView` component
- **Form modal:** `ThoughtRecordForm` (controlled by local `opened` state + `editRecord` state)

**Module encapsulation:** All imports are from within `src/modules/emotionbook/` or from shared libs (`lib/crypto`, `lib/storage`, `contexts/AppContext`). No emotionbook-specific code exists outside this directory.

---

### 11. App Wiring

**`src/lib/routes.ts`** — add:
```typescript
emotionbook: '/emotionbook'
```

**`src/App.tsx`** — add lazy import and route:
```typescript
const EmotionBookModule = lazy(() => import('./modules/emotionbook'));
// Inside <Route element={<ProtectedLayout />}>:
<Route path={ROUTES.emotionbook} element={<EmotionBookModule />} />
```

**`src/components/ProtectedLayout.tsx`** — add navigation link:
- Icon: `IconMoodSmile` or `IconHeart` from `@tabler/icons-react`
- Label: "EmotionBook"
- Links to `ROUTES.emotionbook`

---

### 12. Data Migration (Import from Legacy App)

**Trigger:** "Import from EmotionBook" option in the module toolbar menu.

**Flow:**
1. User exports all data from the standalone EmotionBook app (existing "Export" feature produces a timestamped JSON file containing a flat array of all `ThoughtRecord` objects)
2. In Silent Memoirs' EmotionBook module, user clicks "Import from EmotionBook"
3. File picker opens (accept `.json`)
4. File is read, parsed as `ThoughtRecord[]`
5. Each record is validated using `normalizeEmotionSelections()`, `normalizeEmotionIntensities()`, and sanitization functions
6. Records are partitioned by `dateTime.getFullYear()`
7. For each year: load existing year file (if any), merge (skip records with duplicate `id`), save
8. Show Mantine notification: "Imported X records across Y years (Z skipped as duplicates)"
9. Reload current year's data

**Edge cases:**
- Invalid JSON → error notification
- Records with missing required fields (`id`, `dateTime`, `situation`) → skipped with count in notification
- Records with `dateTime` as string (ISO format from export) → parsed to Date
- Duplicate `id` detection → skip, don't overwrite (existing data wins)

---

## File Structure Summary

```
silent-memoirs/app/src/modules/emotionbook/
├── index.tsx                       # Module shell (route entry)
├── types.ts                        # Interfaces, constants, utility functions
├── sync.ts                         # EmotionBookSyncAdapter
├── useEmotionBook.ts               # CRUD + state hook
├── useEmotionTaxonomy.ts           # Emotion taxonomy hook
├── assets/
│   └── emotions.json               # Copied from emotionbook (static taxonomy)
└── components/
    ├── EmotionWheel.tsx            # ECharts sunburst chart
    ├── ThoughtRecordForm.tsx       # Create/edit modal
    ├── EmotionRecordCard.tsx       # Record display card
    └── CalendarView.tsx            # Monthly calendar grid
```

**Modified files:**
- `src/App.tsx` — lazy import + route
- `src/lib/routes.ts` — route constant
- `src/components/ProtectedLayout.tsx` — nav link
- `package.json` — add `echarts` + `echarts-for-react`

---

## Acceptance Criteria
- [ ] EmotionBook module loads at `/emotionbook` route behind vault authentication
- [ ] Create, edit, and delete thought records — persisted as encrypted `emotionbook/YYYY.age` on Google Drive
- [ ] Emotion wheel renders as interactive sunburst with drill-down and multi-select (up to 5)
- [ ] Intensity sliders appear per selected emotion, range 10–100
- [ ] List view with pagination (10/20/50/100 per page) shows records newest-first
- [ ] Calendar view shows emotion color bars per day with month navigation
- [ ] Clicking a calendar day shows that day's records
- [ ] Year selector loads different years' data
- [ ] Export downloads all records as JSON
- [ ] Import from legacy EmotionBook app works with validation and duplicate detection
- [ ] All EmotionBook code lives within `src/modules/emotionbook/` — zero leakage to shared code
- [ ] Vault lock makes EmotionBook data inaccessible; unlock restores access
- [ ] `npm run build` passes with no errors

## Dependencies & Considerations
- **New npm packages:** `echarts` (~250KB gzip, lazy-loaded with module), `echarts-for-react` (thin React wrapper)
- **Existing packages reused:** `@mantine/core`, `@mantine/dates`, `@tabler/icons-react`, `dayjs`, `@kanru/rage-wasm` (via `lib/crypto.ts`)
- **No backend changes** — all data flows through existing `StorageProvider` → Google Drive
- **No manifest integration** — EmotionBook data is self-contained in year files, not indexed in the journal manifest
- **The standalone Angular EmotionBook app will be deprecated and retired** once this module reaches feature parity and existing users have migrated their data
