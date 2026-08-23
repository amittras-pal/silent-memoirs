# Quick Access to Last Entry in Editor

## Feature ID: FEAT-0016
**Status**: Completed

## Objective
Provide an instant, in-context way for users to view their most recent journal entry directly from the Editor header without leaving the writing canvas. On desktop/tablet screens, this opens as a side-by-side resizable split panel with a draggable handle; on mobile viewports, it opens as a responsive modal overlay.

---

## Background & Requirements
- **Workflow Context**: Upon logging into Silent Memoirs and unlocking the vault, users are routed directly to the Editor to begin writing immediately.
- **Problem**: Users frequently need to review their previous entry to recall context, follow up on thoughts, or maintain narrative continuity. Currently, doing so requires navigating away to `/entries`, browsing the folder hierarchy, opening `/viewer`, and switching back, which risks interrupting writing flow and requires discarding or navigating around drafts.
- **Core Requirements**:
  1. **Header Action**: An accessible button in the Editor header to toggle viewing the last recorded entry.
  2. **Desktop Split-View**: Render the previous entry in a dedicated side panel next to the main editor with a draggable resize handle to adjust proportions.
  3. **Mobile Modal**: On smaller screens (`< 768px`), open the previous entry inside a mobile-optimized modal.
  4. **Smart Entry Resolution**: Automatically query the vault's manifest to determine the most recent saved entry (skipping the current active entry if the user is editing an existing entry).
  5. **Independent Reading Experience**: Support markdown rendering, decrypted media display, scroll isolation, and optional font scaling within the side viewer without affecting editor state.

---

## Detailed Implementation Breakdown

### 1. Last Entry Resolution & Data Fetching
- **Location**: `app/src/modules/editor/useLastEntry.ts` or integrated within `EditorModule`
- **Resolution Strategy**:
  - Retrieve manifest entries using `syncEngine.getEntryMetadata()`.
  - Filter out the entry currently loaded in the editor (if `activeEntryPath` is not a new draft) to ensure the user sees the *preceding* entry.
  - Sort metadata entries by `date` (descending: `YYYY-MM-DD_HH-mm`) to select the latest entry metadata.
  - If no prior entries exist (e.g. fresh vault or only one entry being edited), set state to `null` with a descriptive empty message.
- **Decryption & Cache**:
  - Fetch and decrypt the resolved entry via `syncEngine.fetchEntry(latestEntry.path)`.
  - Cache the decrypted result in component state / ref to avoid redundant re-downloads and decrypt cycles on repeated toggle opens during the same session.
  - Expose state: `{ entry, isLoading, error, hasPreviousEntry, toggle, isOpen, close }`.

```typescript
export interface LastEntryState {
  isOpen: boolean;
  isLoading: boolean;
  entry: JournalEntry | null;
  entryPath: string | null;
  error: string | null;
}
```

---

### 2. Editor Header Action Button
- **Location**: [app/src/modules/editor/index.tsx](file:///c:/Users/Amittras/Projects/1-Client/silent-memories/app/src/modules/editor/index.tsx) and [app/src/components/Editor.tsx](file:///c:/Users/Amittras/Projects/1-Client/silent-memories/app/src/components/Editor.tsx)
- Place an `ActionIcon` within the Editor top header action group (adjacent to Save and Close buttons or within the secondary toolbar).
- **Icon**: `IconClockRewind`, `IconHistory`, or `IconBook2` from `@tabler/icons-react`.
- **Tooltip**: Dynamic label based on state:
  - `View Last Entry (Split)` on desktop when closed.
  - `Close Last Entry Panel` when open.
  - `No Previous Entries Found` when vault has no other entries (disabled or showing informative notice).
- **Visual Feedback**: Active toggle variant (`variant="filled"` or `variant="light"` with highlight color) when the panel is open.
- **Keyboard Shortcut**: Optional hotkey binding (`Mod+Alt+P` or `Mod+Shift+E`) via Mantine `useHotkeys` for quick keyboard-driven toggling.

---

### 3. Desktop Resizable Split-View Container
- **Location**: `app/src/modules/editor/LastEntrySplitView.tsx` or inside `app/src/modules/editor/index.tsx`
- **Layout Structure**:
  - Replace the single-column editor container with a flex row container when the side panel is active on desktop (`visibleFrom="sm"` or `useMediaQuery('(min-width: 768px)')`).
  - Left pane: `Editor` canvas (flex: `1 - splitRatio` or fixed percentage `calc(100% - width)`).
  - Center: Draggable resize divider handle.
  - Right pane: `LastEntryViewer` panel.
- **Resize Handle Mechanism**:
  - Track split percentage or pixel width using `useState` initialized from `useLocalStorage({ key: 'silent-memoirs:editor-split-ratio', defaultValue: 45 })` (percentage of screen for last-entry panel).
  - Implement mouse / touch drag handlers (`onPointerDown`, tracking `pointermove` and `pointerup` on `window`).
  - Constrain bounds: minimum width of `320px` (or 25%) for Editor, minimum width of `280px` (or 20%) for Viewer panel, maximum of `60%` for Viewer.
  - Provide visual feedback on hover/drag: subtle accent bar, grab cursor (`col-resize`), and active drag line.
  - Optional double-click on handle to reset to 50/50 split.
- **Scroll Isolation**:
  - Ensure both left (Editor) and right (Last Entry Viewer) panes have independent `overflow-y: auto` containers.

```
+-------------------------------------------------------------+
| Editor Header: [ Title Input ]  [ Date ]  [ Last Entry (ON) ] |
+------------------------------------+---+--------------------+
|                                    | | | Previous Entry      |
|                                    | | | 2026-08-22 21:15    |
|   Current Writing Editor           | | |                    |
|   (Markdown Textarea / Preview)    | | | (Read-Only Viewer  |
|                                    | | |  with full md &    |
|                                    | | |  image rendering)  |
|                                    | | |                    |
+------------------------------------+---+--------------------+
                                      ^
                                Drag Handle
```

---

### 4. Mobile Responsive Modal View
- **Location**: `app/src/modules/editor/LastEntryModal.tsx`
- **Behavior**:
  - Detect viewport via Mantine `useMediaQuery('(max-width: 48em)')`.
  - When triggered on mobile, open a Mantine `Modal` or fullscreen drawer instead of the side panel.
  - Modal title displays the previous entry's title and formatted timestamp.
  - Content area embeds the read-only markdown viewer with decrypted images.
  - Include a clear close button in the modal header and support swipe/backdrop dismiss.

---

### 5. Last Entry Viewer Panel Component
- **Location**: `app/src/components/LastEntryViewerPanel.tsx` (or refactored subcomponent of [app/src/components/Viewer.tsx](file:///c:/Users/Amittras/Projects/1-Client/silent-memories/app/src/components/Viewer.tsx))
- **Features**:
  - Header: Previous entry title, formatted date subtitle, close button (`IconX`), and optional open-in-full-viewer action (`IconExternalLink`).
  - Body: Decrypted Markdown rendered via `MDEditor.Markdown` with full support for `EncryptedMediaImage` and custom styling tokens.
  - Loading State: Skeleton placeholders / loader centered while the `.age` file is being downloaded and decrypted.
  - Empty State: Informative notice if no prior entry is found or decryption fails.
  - Read-Only Guarantee: Strict view-only mode to prevent accidental mutation of past records.

---

## Acceptance Criteria
- [x] Action button appears in the Editor header to access the last saved journal entry.
- [x] If previous entries exist, clicking the action opens the most recent entry (excluding the entry currently being edited).
- [x] On desktop (`>= 768px`), the entry displays in a side panel beside the editor.
- [x] A draggable vertical divider allows resizing the editor and last entry panel with smooth performance.
- [x] Panel resizing enforces min/max clamping boundaries and prevents UI collapsing.
- [x] Split ratio is smoothly remembered during the session or in local storage.
- [x] On mobile devices (`< 768px`), the entry opens in a modal/sheet with full dismiss controls.
- [x] Markdown formatting, code blocks, and encrypted images render accurately in the side viewer.
- [x] Editor autosave, image upload, and draft editing functionality remain completely uninterrupted while the panel is open.
- [x] If no previous entry exists in the vault, a friendly notification or empty-state badge is shown.
- [x] Closing the panel or modal restores standard full-width editor layout.

---

## Dependencies & Considerations
- **Dependencies**:
  - [app/src/lib/sync.ts](file:///c:/Users/Amittras/Projects/1-Client/silent-memories/app/src/lib/sync.ts): `getEntryMetadata()`, `fetchEntry()`.
  - [app/src/components/Editor.tsx](file:///c:/Users/Amittras/Projects/1-Client/silent-memories/app/src/components/Editor.tsx) & [app/src/modules/editor/index.tsx](file:///c:/Users/Amittras/Projects/1-Client/silent-memories/app/src/modules/editor/index.tsx): Editor header integration and layout wrapping.
  - [app/src/lib/markdownComponents.tsx](file:///c:/Users/Amittras/Projects/1-Client/silent-memories/app/src/lib/markdownComponents.tsx): Decrypted media thumbnail and image rendering.
  - `@mantine/core` (`Modal`, `ActionIcon`, `Tooltip`, `Box`, `Flex`, `Group`, `Stack`, `Text`, `Loader`) & `@mantine/hooks` (`useMediaQuery`, `useLocalStorage`, `useElementSize`, `useHotkeys`).
- **Considerations**:
  - **Performance**: Decrypting the previous entry must be non-blocking and cached so typing in the editor remains 60fps with zero lag.
  - **Reactivity**: If a user saves a new entry and immediately begins another draft, the "last entry" resolution should reflect the freshly saved entry.
