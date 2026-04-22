# PDF Export for Entries and Directories

## Feature ID: FEAT-0011
**Status**: Planned  

## Objective
Allow users to export either a single entry or an entire directory of entries into PDF files, including decrypted embedded images, with clear warnings that exported output is no longer encrypted.

## Background & Requirements
- Current app has no export workflow for entries or directories.
- Requirement: single-entry export from viewer.
- Requirement: directory export in one PDF containing all entries in that directory.
- Requirement: image references in markdown must be decrypted and embedded in exported PDF.
- Requirement: single-entry filename should match the original stored file name (converted to `.pdf`).
- Requirement: directory export should:
  - Use one combined PDF.
  - Render each entry with highlighted title.
  - Show date/time subtitle below title.
  - Start each entry on a new page.
- Requirement: process should run in background while user can continue app usage.
- Requirement: heavy export work (download, decryption, markdown processing, PDF encoding) should run in a dedicated Web Worker to keep the UI thread responsive.
- Requirement: browser file-save initiation must be handled by the main thread; worker returns final bytes and metadata.
- Requirement: show non-intrusive, non-dismissible progress indicator while export is running.
- Requirement: Logout confirmation also looks at this signal for confirming logout along with all other existing signals as described in `FEAT-0009`
- Requirement: warn users before export starts that resulting file is unencrypted.

## Detailed Implementation Breakdown
### 1. Add Export Capability Module
- Create export service module (recommended: [app/src/lib/export/pdfExport.ts](app/src/lib/export/pdfExport.ts)).
- Define APIs:
  - `exportSingleEntryPdf(...)`
  - `exportDirectoryPdf(...)`
- Service should accept only plain data and callbacks (`onProgress`) so UI can remain in React layer.
- Keep module pure and testable (no direct React hooks inside service).
- Split implementation into:
  - Main-thread orchestrator: job lifecycle, UI state, user confirmations, download handoff.
  - Worker executor: CPU/network-heavy export pipeline.

### 2. Worker-First Architecture and Messaging
- Add a dedicated worker module (recommended: [app/src/workers/exportPdf.worker.ts](app/src/workers/exportPdf.worker.ts)).
- Instantiate worker using Vite-compatible module worker pattern from main thread:
  - `new Worker(new URL('../../workers/exportPdf.worker.ts', import.meta.url), { type: 'module' })`
- Define typed message protocol with `jobId` correlation:
  - Main -> worker: `START_EXPORT_SINGLE`, `START_EXPORT_DIRECTORY`, `CANCEL_EXPORT`
  - Worker -> main: `PROGRESS`, `COMPLETED`, `FAILED`, `CANCELLED`
- Keep one active export worker in v1 (single-flight policy), with explicit `terminate()` on teardown.
- Provide fallback path:
  - If Worker construction fails or is unsupported, fallback to main-thread implementation with reduced responsiveness.

### 3. Select and Wire PDF + Markdown Tooling
- Add dependencies for PDF generation and markdown parsing (recommended stack):
  - `pdf-lib` for PDF creation.
  - `remark` + `remark-gfm` for markdown AST parsing.
- Render strategy:
  - Convert markdown into render blocks (heading, paragraph, list, blockquote, table, image).
  - Draw text with wrapping and pagination logic in `pdf-lib`.
  - Draw table rows/cells with fallback wrapping for long content.
- Keep visual fidelity reasonable but prioritize complete data export and deterministic output.

#### 3a. Typography
- Both **Raleway** and **Crimson Pro** are already imported from `fonts.googleapis.com` in `app/index.html` and can be reused for PDF embedding. No additional font loading setup is required.
- Font assignment rules:
  - **Raleway**: used for the title page title and year, entry title, entry timestamp.
  - **Crimson Pro**: used for all entry body/content text.
- Apply consistent font sizing and weight hierarchy (e.g. title > subtitle > body) — exact values to be decided during implementation.

#### 3b. Content Element Styling
- **Images**:
  - Centered horizontally on the page.
  - Maximum width capped at 50% of the page width.
- **Blockquotes**:
  - Must be visually prominent — use a distinct left border (thick, colored) and a light background tint to make them stand out clearly on the page.
- **Tables**:
  - Style table borders and header rows for readability.
  - No special page-fitting logic required for v1; tables are sparsely used and overflow behavior is acceptable for now. However, shorter tables like 2-4 columns should fit naturally to the page width. Tables in general should occupy full width of the page. 

#### 3c. Page Setup
- Page margins should be narrow (1cm on all sides)
- Page size is A4
- We don't need page numbers.

### 4. Download, Decrypt, and Encode Pipeline in Worker
- Perform Google Drive file fetch/download inside worker where possible:
  - Use worker `fetch()` with OAuth bearer token passed from main thread at job start.
  - Alternative fallback: proxy network calls through main thread if token-handling policy disallows worker token usage.
- Perform decryption in worker:
  - Reuse crypto utilities from [app/src/lib/crypto.ts](app/src/lib/crypto.ts).
  - Validate `@kanru/rage-wasm` initialization and execution in module worker context.
- Perform markdown transformation and PDF encoding in worker.
- Keep worker isolated from DOM APIs; no direct modal, toast, or anchor interactions.

### 5. Decrypt and Embed Images
- Extract media paths from markdown using existing helpers in [app/src/lib/media.ts](app/src/lib/media.ts) (`extractEncryptedMediaPaths`).
- Decrypt each image using `downloadAndDecryptImage(...)`.
- Embed image bytes into PDF:
  - For PNG/JPEG use native `pdf-lib` embedding.
  - For WEBP/AVIF/JPG edge cases, normalize to PNG via canvas before embed if needed.
- If an image fails decryption/embed:
  - Continue export and insert a visible placeholder note in PDF (`[Image could not be exported: <path>]`).
  - Surface summary warning after completion.

### 6. Transferables, Memory, and Throughput
- Use transferable `ArrayBuffer` in `postMessage()` for large binary payloads (decrypted images and final PDF bytes) to avoid expensive copies.
- Avoid sending large complex object graphs between threads; pass minimal typed payloads and identifiers.
- Add internal chunk checkpoints in directory exports to keep memory bounded and progress updates smooth.
- Add `AbortController` support per job so cancellation interrupts network + decryption + encoding stages quickly.

### 7. Single Entry Export Flow
- Add export action in viewer (recommended button in [app/src/components/Viewer.tsx](app/src/components/Viewer.tsx)).
- On click:
  - Open pre-export warning modal explaining decrypted output risk.
  - If confirmed, enqueue worker job via `exportSingleEntryPdf` orchestrator.
- File naming:
  - Input path example: `2026/2026-04-15_09-30.age`.
  - Output filename: `2026-04-15_09-30.pdf`.
- The single entry export **includes a title page** containing:
  - Entry title.
  - Entry timestamp (date and time).
  - User's display name (from already-loaded Google profile).
  - No profile picture on the single entry title page.
- Typography, image sizing, blockquote styling, and table styling follow the same rules defined in **§3a** and **§3b** above.

### 8. Directory Export Flow
- Export button placement:
  - Available in the **folders list view** (alongside each year/directory entry).
  - Also available at the **top of the year view** (the entries listing screen), so the user can trigger it while browsing entries within a directory.
- Use current directory entry metadata from listing and fetch each full entry via `SyncEngine.fetchEntry(...)`.
- The directory export represents the full journal of a year and **must include a title page** as the first page:
  - Title line: `"<User_name>'s Journal"` — user's display name fetched from the already-loaded Google profile.
  - Second line: the year being exported. Smaller font-size.
  - If available, the user's Google profile picture should be included on the title page.
  - Profile name and picture are already available from the existing Google auth profile data; no additional fetch is required.
- Build one PDF document where each entry starts on a new page:
  - Entry title at top.
  - Second line: entry date and time (formatted timestamp).
  - Markdown content after the timestamp.
- Entries should be ordered oldest to newest. Starting at January and ending at December. 

### 9. Background Job UX and Progress
- Add export job state in app shell (recommended in [app/src/App.tsx](app/src/App.tsx)):
  - status (`idle`, `running`, `done`, `failed`)
  - progress percent
  - stage text
- Display a non-dismissible compact progress component while running.
- Show preflight warning that user should not close the browser/tab/window until complete.
- Keep app interactive during export; avoid modal hard-lock while processing.
- Extend stage granularity for worker progress:
  - `downloading` -> `decrypting` -> `rendering` -> `encoding` -> `finalizing`
- Export-in-progress state must be exposed to logout confirmation logic alongside all existing FEAT-0009 signals.

### 10. Download Handoff and Cleanup
- Worker returns final PDF as transferable bytes plus filename.
- Main thread creates Blob from worker output and triggers browser download.
- Revoke object URL after trigger.
- Show completion feedback with file name and any partial warnings (such as skipped images).
- Note: Actual save/download trigger remains main-thread only because workers do not control DOM anchor interactions/user activation flows.

### 11. Error and Recovery Handling
- If export fails before download creation:
  - Show clear failure notification.
  - Keep original data untouched.
- If auth expires during export (UnauthorizedError):
  - Abort export.
  - Route through existing auth-failure behavior.
- Prevent concurrent export collisions by allowing one active export job at a time (v1).
- On cancellation:
  - worker stops all pending steps via abort signal,
  - main thread resets progress state and clears pending export signal.
- Ensure worker errors are serialized with actionable stage context (`stage`, `entryPath`, `reason`) for debugging.

## Acceptance Criteria
- [ ] Viewer can export current entry to a PDF file with matching base filename.
- [ ] Entries list can export current directory entries into one combined PDF.
- [ ] Directory export button is accessible from both the folders list and the top of the year/entries listing view.
- [ ] Exported PDFs contain decrypted text content and embedded images where available.
- [ ] Directory export includes a title page with user's name, profile picture (if available), and the year.
- [ ] Single entry export includes a title page with entry title, timestamp, and user's display name.
- [ ] Directory export starts each entry on a new page with entry title and date/time on second line.
- [ ] Raleway font is used for title page content, entry titles, and entry timestamps.
- [ ] Crimson Pro font is used for all entry body content.
- [ ] Images in exported PDFs are centered and capped at 50% page width.
- [ ] Blockquotes are rendered with a prominent visual treatment (border + background tint).
- [ ] Tables are styled with visible borders and header row differentiation.
- [ ] User sees mandatory pre-export warning about unencrypted output.
- [ ] While export runs, a non-dismissible progress indicator is visible and app remains usable.
- [ ] Download/decrypt/render/encode heavy work runs in a dedicated worker in supported browsers.
- [ ] Main thread performs final browser download initiation after receiving worker result.
- [ ] Logout confirmation includes export-in-progress signal in addition to existing FEAT-0009 checks.
- [ ] User can cancel an export and the worker aborts promptly.

## Dependencies & Considerations
- New dependencies: `pdf-lib`, `remark`, `remark-gfm` (or equivalent, if finalized differently).
- Worker implementation references:
  - MDN Web Workers (`fetch`, `postMessage`, `terminate`)
  - MDN Transferable objects and structured clone behavior
  - MDN Web Crypto availability in workers
  - Vite module worker integration patterns
- Verify `@kanru/rage-wasm` behavior in worker context across Chrome/Safari/Firefox before locking implementation.
- Heavy exports can still be CPU/memory intensive in browser; worker removes UI blocking but not total compute cost.
- Exported files are intentionally plaintext/decrypted artifacts; this is a security tradeoff and must remain explicit in UX copy.
