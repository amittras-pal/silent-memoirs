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

### 8. Directory Export Flow
- Add directory export action in entries view (recommended in [app/src/components/EntriesList.tsx](app/src/components/EntriesList.tsx)).
- Use current directory entry metadata from listing and fetch each full entry via `SyncEngine.fetchEntry(...)`.
- Build one PDF document where each entry starts on a new page:
  - Title at top with highlighted style.
  - Subtitle line with date/time directly below.
  - Markdown content after subtitle.
- Preserve current entry ordering shown in UI unless product decision says otherwise.

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
- [ ] Exported PDFs contain decrypted text content and embedded images where available.
- [ ] Directory export starts each entry on a new page with highlighted title and date/time subtitle.
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
