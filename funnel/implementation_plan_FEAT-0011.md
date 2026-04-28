# FEAT-0011: PDF Export for Entries and Directories

End-to-end implementation of PDF export capability — allowing users to export single journal entries or full year directories as styled PDF documents, with decrypted embedded images, running in a dedicated Web Worker for UI responsiveness.

---

## User Review Required

> [!IMPORTANT]
> **New Dependencies**: This feature requires adding three npm packages:
> - `pdf-lib` — low-level PDF creation and manipulation (no DOM dependency, worker-safe)
> - `remark` — markdown-to-AST parser
> - `remark-gfm` — GitHub Flavored Markdown support (tables, etc.)

> [!IMPORTANT]
> **Font Embedding for PDF**: Google Fonts (Raleway, Crimson Pro) are loaded via CSS in `index.html` for browser rendering, but `pdf-lib` requires the raw `.ttf`/`.otf` font files to embed them in PDFs. We will need to bundle the font files as static assets under `app/src/assets/fonts/`. These will be fetched at export time by the worker. The font files to include are:
> - `Raleway-Regular.ttf`, `Raleway-Bold.ttf`
> - `CrimsonPro-Regular.ttf`, `CrimsonPro-Bold.ttf`, `CrimsonPro-Italic.ttf`

> [!WARNING]
> **`@kanru/rage-wasm` in Worker Context**: The feature spec calls out verifying that `@kanru/rage-wasm` initializes correctly inside a module worker. If WASM init fails in the worker, we fall back to proxying decrypt calls through the main thread via `postMessage`. This fallback adds latency but preserves correctness. We'll test this early in Phase 1.

> [!WARNING]
> **SVG Logo Embedding**: The app logo (`logo-light.svg`) needs to be embedded on the directory export title page. `pdf-lib` does not natively support SVG embedding. A pre-rasterized PNG (`logo-light-raster.png`) will be added to `app/src/assets/` by the user. Implementation will assume this file exists.

## Resolved Decisions

- **Profile Picture**: Fetched on the **main thread** before dispatching to the worker. Raw image bytes are passed to the worker as a transferable `ArrayBuffer`. This avoids any CORS/auth issues inside the worker.
- **Cancellation UX**: Cancel button is placed directly on the progress indicator toast. Cancellation is **immediate** — no confirmation dialog.
- **Blockquote Border Color**: Uses `terracotta-6` from the app's existing Mantine theme (matching the Editor/Viewer blockquote styling).
- **Font Files**: Downloaded from Google Fonts (trusted source) and saved into `app/src/assets/fonts/`.
- **Logo PNG**: Will be provided by the user at `app/src/assets/logo-light-raster.png`. Implementation assumes it exists.
- **WASM in Worker**: Will be validated early in Phase 1 before full development proceeds.

---

## Proposed Changes

The implementation is split into **6 phases**, ordered by dependency. Each phase is independently testable.

---

### Phase 1: Dependencies, Font Assets, and Foundation Types

#### [NEW] Font files in `app/src/assets/fonts/`
- Download TTF files for Raleway (Regular, Bold) and Crimson Pro (Regular, Bold, Italic) from Google Fonts
- Store under `app/src/assets/fonts/`

#### [NEW] Pre-rasterized logo PNG in `app/src/assets/`
- Convert `logo-light.svg` to a PNG (`logo-light-raster.png`) for PDF embedding
- ~200×60px at 2x resolution should be sufficient

#### [MODIFY] [package.json](file:///c:/Users/Amittras/Projects/1-Client/silent-memories/app/package.json)
- Add `pdf-lib`, `remark`, `remark-gfm` to dependencies
- Run `npm install`

#### [NEW] [exportTypes.ts](file:///c:/Users/Amittras/Projects/1-Client/silent-memories/app/src/lib/export/exportTypes.ts)
- Shared type definitions for export messaging between main thread and worker:
  - `ExportJobType`: `'single'` | `'directory'`
  - `ExportStage`: `'downloading'` | `'decrypting'` | `'rendering'` | `'encoding'` | `'finalizing'`
  - `ExportStatus`: `'idle'` | `'running'` | `'done'` | `'failed'`
  - Main→Worker messages: `StartExportSingleMessage`, `StartExportDirectoryMessage`, `CancelExportMessage`
  - Worker→Main messages: `ProgressMessage`, `CompletedMessage`, `FailedMessage`, `CancelledMessage`
  - `ExportJobState` interface for UI consumption (status, progress percent, stage text, jobId)

---

### Phase 2: Markdown-to-PDF Rendering Engine

This is the core rendering layer — a pure function pipeline that converts markdown AST nodes into `pdf-lib` draw calls. No React, no DOM, no worker messaging — just data in, PDF bytes out. This makes it testable and reusable.

#### [NEW] [pdfRenderer.ts](file:///c:/Users/Amittras/Projects/1-Client/silent-memories/app/src/lib/export/pdfRenderer.ts)
The heart of the feature. Responsibilities:

- **Page setup**: A4, 1cm margins, no page numbers
- **Font loading**: Accept pre-fetched font bytes (Raleway Regular/Bold, CrimsonPro Regular/Bold/Italic), embed via `pdfDoc.embedFont()`
- **Title page rendering**:
  - *Single entry*: Entry title (Raleway Bold), timestamp (Raleway Regular), user display name (Raleway Regular)
  - *Directory*: User profile picture (if available, centered), "`<Name>'s Journal`" (Raleway Bold), year (Raleway Regular, smaller), app logo (bottom)
- **Entry rendering**:
  - Each entry starts on a new page
  - Entry title at top (Raleway Bold, large)
  - Entry date/time on next line (Raleway Regular, dimmed/smaller)
  - Content body follows (Crimson Pro)
- **Markdown AST → draw calls**: Walk the `remark` AST and render each node type:
  - `heading` → Raleway Bold, scaled by depth
  - `paragraph` → Crimson Pro Regular with line wrapping
  - `emphasis` → Crimson Pro Italic
  - `strong` → Crimson Pro Bold
  - `list` / `listItem` → indented with bullet/number prefix
  - `blockquote` → left border (thick line, colored), light background rect, indented text
  - `table` → cell grid with borders, header row differentiation (bold + background), full page width, proportional column sizing
  - `image` → embed image bytes (from pre-decrypted map), centered, max 50% page width
  - `code` / `inlineCode` → monospace rendering (use pdf-lib standard Courier font)
  - `thematicBreak` → horizontal line
- **Text wrapping and pagination**: Track Y cursor, auto-add new page when content exceeds available space
- **Graceful image failure**: If image bytes are missing, insert `[Image could not be exported: <path>]` placeholder text

---

### Phase 3: Web Worker and Export Pipeline

#### [NEW] [exportPdf.worker.ts](file:///c:/Users/Amittras/Projects/1-Client/silent-memories/app/src/workers/exportPdf.worker.ts)
- Module worker (`type: 'module'`) for Vite compatibility
- Listens for `START_EXPORT_SINGLE`, `START_EXPORT_DIRECTORY`, `CANCEL_EXPORT` messages
- **Single entry pipeline**:
  1. Receive entry content, title, date, media paths, secret key, OAuth token, font URLs, user profile
  2. For each media path: download encrypted file (via `fetch` with bearer token to Google Drive API), decrypt with `@kanru/rage-wasm`
  3. Parse markdown with `remark` + `remark-gfm`
  4. Call `pdfRenderer` to produce PDF bytes
  5. Post `COMPLETED` with transferable `ArrayBuffer` + filename
- **Directory pipeline**:
  1. Receive list of entry paths, OAuth token, secret key, font URLs, user profile, year
  2. Fetch + decrypt each entry file (sending `PROGRESS` messages with stage + percent)
  3. For each entry: extract media paths, fetch + decrypt each image
  4. Parse all markdown, build full PDF with title page + all entries via `pdfRenderer`
  5. Post `COMPLETED` with transferable `ArrayBuffer` + filename
- **Cancellation**: Check `AbortController.signal` between each entry/image fetch
- **Error handling**: Catch errors per-entry/per-image, accumulate warnings, send `FAILED` with stage context on unrecoverable errors
- **Memory**: Use transferable `ArrayBuffer` for all large binary payloads

#### [NEW] [pdfExport.ts](file:///c:/Users/Amittras/Projects/1-Client/silent-memories/app/src/lib/export/pdfExport.ts)
Main-thread orchestrator service:

- `startSingleEntryExport(params)` → creates worker, sends `START_EXPORT_SINGLE`, returns job handle
- `startDirectoryExport(params)` → creates worker, sends `START_EXPORT_DIRECTORY`, returns job handle  
- `cancelExport(jobId)` → sends `CANCEL_EXPORT` to worker
- Listens for worker messages, maps them to callback invocations: `onProgress(percent, stage)`, `onComplete(bytes, filename, warnings)`, `onFailed(error)`, `onCancelled()`
- On `COMPLETED`: creates `Blob` from returned bytes, triggers browser download via temporary `<a>` element, revokes object URL
- **Worker fallback**: If `new Worker(...)` fails, run the pipeline on the main thread with `setTimeout` chunking for basic responsiveness
- **Single-flight policy**: Only one export job at a time; reject new requests while one is running
- **File naming**:
  - Single entry: extract basename from path (e.g., `2026/2026-04-15_09-30.age` → `2026-04-15_09-30.pdf`)
  - Directory: `<Year>-Journal.pdf`
- Font and logo loading: Fetch font TTF files and logo PNG from asset URLs before dispatching to worker, pass as `ArrayBuffer`

> [!NOTE]
> The main thread needs to provide the worker with: OAuth bearer token, secret key, font bytes, logo bytes (for directory), user profile data, and either entry content (single) or entry paths list (directory). Entry **content** for single export is already fetched and available in the ViewerModule. For directory export, the worker fetches each entry itself.

---

### Phase 4: Export State Management and UI Integration

#### [MODIFY] [AppContext.tsx](file:///c:/Users/Amittras/Projects/1-Client/silent-memories/app/src/contexts/AppContext.tsx)
- Add `exportJobState: ExportJobState` to context (default: `{ status: 'idle' }`)
- Add `setExportJobState` setter
- Expose `isExportRunning` computed boolean
- Wire into `beforeunload` handler: if `isExportRunning`, block tab close
- Wire into logout confirmation: if `isExportRunning`, add warning text about active export

#### [NEW] [ExportWarningModal.tsx](file:///c:/Users/Amittras/Projects/1-Client/silent-memories/app/src/components/ExportWarningModal.tsx)
- Pre-export confirmation modal warning that the PDF output will be **unencrypted**
- Accept `onConfirm` and `onCancel` callbacks
- Clear, prominent warning text explaining the security implication
- Used by both single-entry and directory export triggers

#### [NEW] [ExportProgressIndicator.tsx](file:///c:/Users/Amittras/Projects/1-Client/silent-memories/app/src/components/ExportProgressIndicator.tsx)
- Non-dismissible compact progress bar/indicator component
- Renders when `exportJobState.status === 'running'`
- Shows: progress percent, current stage text, cancel button
- Placed in `ProtectedLayout` (e.g., fixed to bottom or as a notification-style bar)
- On completion: briefly shows success with filename, then auto-dismisses
- On failure: shows error with dismiss action

#### [MODIFY] [ProtectedLayout.tsx](file:///c:/Users/Amittras/Projects/1-Client/silent-memories/app/src/components/ProtectedLayout.tsx)
- Render `<ExportProgressIndicator />` in the app shell (below the main content area or as a fixed bar)
- Wire `isExportRunning` into logout modal warning text (alongside existing `isDirty` check)

---

### Phase 5: Export Trigger Points

#### [MODIFY] [Viewer.tsx](file:///c:/Users/Amittras/Projects/1-Client/silent-memories/app/src/components/Viewer.tsx)
- Add an "Export to PDF" action button in the viewer toolbar (alongside the fullscreen button)
- Icon: `IconFileExport` or `IconDownload` from Tabler Icons
- On click: open `ExportWarningModal`
- On confirm: call `startSingleEntryExport()` with the current entry's data
- New props needed: `entryPath`, `onExportEntry` callback (injected from ViewerModule)

#### [MODIFY] [ViewerModule (index.tsx)](file:///c:/Users/Amittras/Projects/1-Client/silent-memories/app/src/modules/viewer/index.tsx)
- Implement `handleExportEntry` function that:
  1. Gathers entry data (title, content, date, path)
  2. Gets user profile from context
  3. Calls the export orchestrator
  4. Updates export job state in context

#### [MODIFY] [EntriesList.tsx](file:///c:/Users/Amittras/Projects/1-Client/silent-memories/app/src/components/EntriesList.tsx)
- **Folders list**: Add an export button on each year folder card (icon button, e.g., `IconFileExport`)
- **Year entries view**: When browsing a year directory (i.e., `currentPath` is a 4-digit year), add an export button at the top of the entries section header
- Both buttons trigger `onExportDirectory(yearPath)` callback
- New prop: `onExportDirectory: (directoryPath: string) => void`

#### [MODIFY] [EntriesModule (index.tsx)](file:///c:/Users/Amittras/Projects/1-Client/silent-memories/app/src/modules/entries/index.tsx)
- Implement `handleExportDirectory` function that:
  1. Gets entry metadata list for the year from `syncEngine`
  2. Gets user profile from context
  3. Shows `ExportWarningModal`
  4. On confirm: calls directory export orchestrator
  5. Updates export job state in context
- Pass `onExportDirectory` to `EntriesList`

---

### Phase 6: Logout Integration and Polish

#### [MODIFY] [ProtectedLayout.tsx](file:///c:/Users/Amittras/Projects/1-Client/silent-memories/app/src/components/ProtectedLayout.tsx)
- Update the logout confirmation modal text to include export-in-progress warning
- If `isExportRunning`: "An export is currently in progress. Logging out will cancel the export. Are you sure?"
- Disable the logout button if `isExportRunning || isSaving`

#### [MODIFY] [AppContext.tsx](file:///c:/Users/Amittras/Projects/1-Client/silent-memories/app/src/contexts/AppContext.tsx)
- Update `beforeunload` handler to also check `isExportRunning`
- On `handleLogout` and `performVaultLock`: if export is running, cancel it first

---

## File Summary

| Phase | File | Action |
|-------|------|--------|
| 1 | `app/src/assets/fonts/*.ttf` | NEW — font files |
| 1 | `app/src/assets/logo-light-raster.png` | NEW — rasterized logo |
| 1 | `app/package.json` | MODIFY — add deps |
| 1 | `app/src/lib/export/exportTypes.ts` | NEW — shared types |
| 2 | `app/src/lib/export/pdfRenderer.ts` | NEW — PDF rendering engine |
| 3 | `app/src/workers/exportPdf.worker.ts` | NEW — web worker |
| 3 | `app/src/lib/export/pdfExport.ts` | NEW — main-thread orchestrator |
| 4 | `app/src/contexts/AppContext.tsx` | MODIFY — export state |
| 4 | `app/src/components/ExportWarningModal.tsx` | NEW — warning modal |
| 4 | `app/src/components/ExportProgressIndicator.tsx` | NEW — progress UI |
| 4 | `app/src/components/ProtectedLayout.tsx` | MODIFY — progress indicator |
| 5 | `app/src/components/Viewer.tsx` | MODIFY — export button |
| 5 | `app/src/modules/viewer/index.tsx` | MODIFY — export handler |
| 5 | `app/src/components/EntriesList.tsx` | MODIFY — export buttons |
| 5 | `app/src/modules/entries/index.tsx` | MODIFY — export handler |
| 6 | `app/src/components/ProtectedLayout.tsx` | MODIFY — logout integration |
| 6 | `app/src/contexts/AppContext.tsx` | MODIFY — logout/lock cleanup |

---

## Verification Plan

### Automated Tests
- Build verification: `npm run build` must succeed with no TypeScript errors
- Lint: `npm run lint` must pass

### Manual Verification (Browser)
1. **Single Entry Export**:
   - Open an entry in the Viewer → click export → confirm warning → verify progress indicator appears → verify PDF downloads → open PDF and verify: title page, correct fonts, decrypted images centered at ≤50% width, blockquotes styled, tables styled
2. **Directory Export**:
   - From folder list, click export on a year → confirm warning → verify progress → verify PDF has title page (name, picture, year, logo) → each entry on new page with title + timestamp + content
   - Also test from within the year entries view
3. **Cancellation**: Start a directory export, click cancel, verify it stops promptly
4. **Logout with export running**: Verify warning message mentions active export
5. **Worker fallback**: Test in a browser with workers disabled (or simulate failure) — export should still complete on main thread
6. **Image failure**: Corrupt/remove a media file and export — verify placeholder text appears in PDF and export completes with warning
7. **Entry ordering**: Directory export should order entries oldest→newest (January→December)
