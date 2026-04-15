# Back to Listing from Viewer

## Feature ID: FEAT-0013
**Status**: Planned  

## Objective
Add a back-to-list action in the viewer header, positioned to the left of the entry title, so users can quickly return to the entries list without using sidebar navigation.

## Background & Requirements
- Current viewer header in [app/src/components/Viewer.tsx](app/src/components/Viewer.tsx) shows title/date and fullscreen toggle only.
- Requirement: include a button to the left of entry title that returns the user to entries listing.
- Return target should preserve context by opening the parent directory of the currently viewed entry.

## Detailed Implementation Breakdown
### 1. Extend Viewer API for Back Navigation
- Update viewer props in [app/src/components/Viewer.tsx](app/src/components/Viewer.tsx):
  - Add `onBackToList: () => void`.
  - Optional future prop: `backToListLabel?: string`.
- In header layout, place a left-aligned `ActionIcon` before title stack.
- Suggested icon: `IconChevronLeft` or `IconArrowLeft`.

### 2. Wire Navigation from App Route Context
- In [app/src/App.tsx](app/src/App.tsx), when rendering viewer mode:
  - Pass `onBackToList` callback to viewer.
  - Callback should derive parent directory from `activeEntryPath` using existing helper logic (`getParentDirectory`).
  - Navigate via `buildEntriesRoute(parentDirectory)`.
- Ensure null path safety:
  - If no active path, fallback to root entries route.

### 3. UX and Accessibility
- Add tooltip label such as `Back to Entries`.
- Add `aria-label` for screen readers.
- Ensure keyboard focus ring and tab order are visible and predictable.
- Keep existing fullscreen action unchanged and right aligned.

### 4. Mobile and Layout Considerations
- Prevent title truncation regression when back button is present.
- Keep date subtitle line-clamped correctly.
- Ensure control remains tappable on small screens.

### 5. Validation Plan
- Open an entry from nested folder, click back button, verify landing in same parent directory.
- Open an entry from root year folder, click back button, verify root-year directory listing.
- Confirm fullscreen toggle and rendering still work with new header layout.

## Acceptance Criteria
- [ ] Viewer shows a back button on the left side of the title area.
- [ ] Clicking the button returns user to entries list in correct parent directory.
- [ ] Button is keyboard and screen-reader accessible.
- [ ] Viewer title/date/fullscreen layout remains stable on desktop and mobile.

## Dependencies & Considerations
- Depends on route helpers in [app/src/lib/routes.ts](app/src/lib/routes.ts).
- Complements `FEAT-0012` route lazy loading by improving in-flow navigation once viewer is loaded.
- No data mutation is involved; this is navigation-only behavior.
