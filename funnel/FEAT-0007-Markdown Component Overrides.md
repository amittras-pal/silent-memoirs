# Markdown Component Overrides

## Feature ID: FEAT-0007
**Status**: Planned  

## Objective
Replace markdown rendering for blockquote and table nodes with Mantine-native components so both viewer and preview use a consistent, theme-aware UI that matches the rest of the app.

## Background & Requirements
- The current markdown component override only customizes images in both [app/src/components/Editor.tsx](app/src/components/Editor.tsx) and [app/src/components/Viewer.tsx](app/src/components/Viewer.tsx).
- Blockquote and table currently render through default markdown output styles from `@uiw/react-md-editor`.
- Required overrides:
  - `blockquote` -> Mantine `Blockquote`
  - `table` -> Mantine `Table` (with responsive horizontal scrolling)
- Override behavior must be identical between editor preview and viewer render.
- Existing encrypted image rendering (`EncryptedMediaImage`) must continue to work unchanged.

## Detailed Implementation Breakdown
### 1. Build a Shared Markdown Component Override Module
- Create a shared utility module (recommended: [app/src/lib/markdownComponents.tsx](app/src/lib/markdownComponents.tsx)) to avoid duplicated override logic between editor and viewer.
- Export a factory function that returns markdown components map used by `MDEditor.Markdown`.
- Include existing `img` override exactly as-is, then add:
  - `blockquote` renderer using Mantine `Blockquote` with compact vertical spacing.
  - `table` renderer using Mantine `Table` wrapped by `Table.ScrollContainer` for mobile overflow.
- Also add renderer overrides for `thead`, `tbody`, `tr`, `th`, and `td` if needed so the table remains semantically valid while still styled by Mantine.

### 2. Integrate Shared Components in Editor and Viewer
- In [app/src/components/Editor.tsx](app/src/components/Editor.tsx):
  - Replace local `markdownComponents` definition with shared factory import.
  - Keep dependency memoization based on `storage` and `vaultIdentity.secretKey`.
- In [app/src/components/Viewer.tsx](app/src/components/Viewer.tsx):
  - Replace local `markdownComponents` definition with shared factory import.
  - Keep dependency memoization based on `storage` and `secretKey`.
- Ensure both modules still pass the same component map to `MDEditor.Markdown`.

### 3. Styling and Behavior Rules
- Blockquotes:
  - Must support nested markdown content (text, links, lists).
  - Must respect theme variables (`var(--mantine-color-*)`) and not force hard-coded colors.
- Tables:
  - Must support markdown tables generated from editor toolbar table command.
  - On narrow screens, horizontal scrolling must be possible without breaking layout.
  - Header row must be visually distinct (weight/background) and body cells must wrap long text safely.
- Compatibility:
  - Existing markdown that already contains blockquotes/tables must render without content loss.

### 4. QA and Regression Coverage
- Add a manual test fixture markdown block containing:
  - A blockquote with inline code and link.
  - A 4+ column table with long content.
  - A table followed by image markdown to verify image override still works.
- Validate in both:
  - Editor preview mode
  - Viewer mode
- Validate in both color schemes and on mobile width.

## Acceptance Criteria
- [ ] Blockquote markdown renders using Mantine `Blockquote` in editor preview and viewer.
- [ ] Table markdown renders using Mantine `Table` with responsive horizontal scrolling.
- [ ] Existing encrypted image rendering is unaffected.
- [ ] No markdown content is dropped or altered while rendering.
- [ ] Visual output is consistent between editor preview and viewer.

## Dependencies & Considerations
- Uses existing Mantine dependency already present in [app/package.json](app/package.json); no new package required.
- This feature should be delivered before PDF export work (`FEAT-0011`) to keep rendering behavior aligned across modules.
- Keep overrides centralized to prevent drift between viewer and editor in future formatting features.
