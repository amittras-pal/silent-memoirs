# Encrypted Image Handling Across Editor, Explorer, and Viewer

## Feature ID: FEAT-0007
**Status**: Planned  

## Objective
Enable end-to-end encrypted image support in journal workflows, including insertion from the editor, browsing from the entries explorer, and rendering inside markdown viewer content.

## Background & Requirements
- Users should be able to attach images at the cursor position while editing an entry.
- Supported image formats for this iteration: `png`, `webp`, `jpg`, `jpeg`, `avif`.
- After selection, image must open in a crop modal with an adjustable rectangle before upload.
- Cropped image must be downsampled so the shorter side is at most 1440 px, but skip downsampling when the image is already within limits or file size is below 1 MB.
- Uploaded media path format should be year-scoped: `YYYY/media/YYYY-MM-DD_HH-mm.ext`.
- Image payloads must be encrypted similarly to entries, and markdown should store the encrypted media path.
- For this iteration, editor upload concurrency is restricted to one image at a time.
- In Entries Explorer, `media` should appear as a normal folder and render image tiles when opened.
- Clicking an image in explorer should open fullscreen preview with previous/next carousel behavior.
- Avoid eager thumbnail decryption for all images at once.
- Viewer markdown image rendering must resolve encrypted paths and decrypt images on demand.
- Image rendering should be centered with simple rounded corners.
- Introduce a shared in-session LRU cache (capacity: 20 images) reused by Explorer and Viewer.
- Clear image cache whenever vault is locked or user logs out.

## Detailed Implementation Breakdown
### 1. Shared Media Service Layer
- Add a media utility module to centralize:
  - MIME validation for supported formats.
  - Year-based media path generation and timestamp naming.
  - Encrypt/decrypt helpers for binary image payloads using existing age keys.
  - Lightweight LRU cache (max 20 entries) keyed by encrypted media path.
- Add explicit cache lifecycle hooks so lock/logout events always flush cache memory.

### 2. Editor Image Insert Pipeline
- Replace default markdown image command flow with a custom upload pipeline:
  - Open file picker restricted to accepted formats.
  - Open crop modal and allow user to confirm crop.
  - Produce cropped blob and conditionally downsample via canvas/offscreen canvas.
  - Encrypt processed bytes and upload to `YYYY/media/...` path.
  - Insert or replace markdown image syntax at cursor with encrypted media path.
- Keep upload mode single-file-at-a-time for now. If UX polish is desired, optional placeholder/progress rendering can be added later.

### 3. Entries Explorer Media Navigation and Carousel
- Keep folder browsing generic so `media` is treated like any other directory in breadcrumb and navigation.
- Detect media-folder context and render image tiles from encrypted filenames.
- On tile click:
  - Open a fullscreen modal carousel.
  - Decrypt and render selected image on demand.
  - Support previous/next navigation over all images in the current folder.
- Reuse shared image cache for decoded image URLs/blobs to avoid redundant fetch/decrypt work.

### 4. Viewer Markdown Image Resolution
- Override markdown renderer image component (using markdown component override support) with a custom encrypted-image renderer.
- Custom image renderer responsibilities:
  - Resolve encrypted path from markdown `src`.
  - Fetch + decrypt image bytes.
  - Hydrate from shared LRU cache when available.
  - Render with centered layout and rounded corners.
- Ensure this component is also reusable by explorer carousel where possible.

### 5. Safety, Naming Collisions, and UX Guards
- Add deterministic fallback for filename collision within same minute (for example append `-01`, `-02` suffixes) while preserving timestamp-first naming.
- Prevent unsupported formats early with clear inline error messaging.
- Guard against partial markdown insertion if upload/encryption fails.
- Keep decryption scoped to actively viewed images to avoid memory spikes.

## Acceptance Criteria
- [ ] Editor allows inserting one supported image at a time through crop -> process -> encrypt -> upload -> markdown link flow.
- [ ] Uploaded images are saved under `YYYY/media/` with timestamp-based naming and encrypted payload.
- [ ] Entries Explorer lists `media` folders naturally, supports image tile view inside them, and opens fullscreen carousel navigation.
- [ ] Viewer correctly renders encrypted markdown images through custom decryption-aware image component.
- [ ] Shared LRU cache (20 images) is reused between explorer and viewer and is flushed on vault lock/logout.
- [ ] Images render centered with rounded corners in viewer contexts.

## Dependencies & Considerations
- Crop UI can be implemented with a maintained library (recommended: `react-easy-crop`) or equivalent native approach if acceptable UX is preserved.
- Image processing should prefer browser-native canvas APIs and avoid heavy client-side image toolchains.
- Requires integration touchpoints across editor, viewer, explorer, sync/storage, and vault session lifecycle events.
- No third-party carousel dependency should be introduced for this feature.