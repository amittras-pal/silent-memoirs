# Route Level Lazy Loaded Feature Modules

## Feature ID: FEAT-0012
**Status**: Planned  

## Objective
Implement route-level code splitting so heavy feature modules (editor, viewer, entries explorer, unlock flow) are lazy-loaded only when needed, reducing initial bundle cost and improving first-load performance.

## Background & Requirements
- Current [app/src/App.tsx](app/src/App.tsx) imports key feature components eagerly:
  - `Editor`
  - `EntriesList`
  - `Viewer`
  - `VaultSetupWall`
- Requirement: dynamically load feature modules as chunks, especially editor and viewer related routes.
- Requirement: maintain current route behavior and guarded auth/unlock flow.

## Detailed Implementation Breakdown
### 1. Define Lazy Imports for Route Modules
- Replace eager imports in [app/src/App.tsx](app/src/App.tsx) with `React.lazy` based imports.
- Because current exports are named exports, use `then` mapping pattern:
  - `lazy(() => import('./components/Viewer').then((m) => ({ default: m.Viewer })))`
- Apply lazy loading to:
  - Editor module
  - Entries list module
  - Viewer module
  - Vault setup wall module
- Keep lightweight foundational modules eager if they are needed for app bootstrap (`AuthWall`, route helpers, shell utilities).

### 2. Add Suspense Boundaries and Fallback UX
- Wrap lazy feature rendering in `Suspense` boundaries at route rendering points.
- Use existing Mantine loader-centered fallback to keep visual consistency.
- Ensure fallback appears both on direct route load and first-time module transition.

### 3. Preserve Protected Route Semantics
- Keep current guard behavior:
  - `storage` required for protected shell.
  - `vaultManager` required for unlock completion.
  - `syncEngine` loader logic must still gate editor/viewer/entries data operations.
- Lazy loading must not bypass or reorder existing auth checks.

### 4. Optional Prefetch Optimizations (Recommended)
- Trigger background prefetch for likely next modules:
  - Hover/focus on sidebar nav links (`Editor`, `All Entries`) can start `import(...)` prefetch.
  - After login success, prefetch unlock shell.
- Prefetching should remain best-effort and never block navigation.

### 5. Verify Chunk Output
- Run production build and confirm multiple feature chunks are produced.
- Validate that initial entry bundle is reduced compared to eager import baseline.
- Confirm source maps and chunk naming remain debuggable.

### 6. Regression Testing
- Deep-link directly into each route (`/editor`, `/entries`, `/viewer`, `/unlock`) and verify no blank screen/race conditions.
- Validate switching routes after first load no longer re-shows loading fallback unless chunk was not loaded.
- Confirm editor interactions, image workflow, and viewer rendering remain functionally unchanged.

## Acceptance Criteria
- [ ] Feature routes use lazy-loaded component chunks instead of eager imports.
- [ ] Suspense fallback renders correctly during first module load.
- [ ] Existing auth and unlock guards work exactly as before.
- [ ] Production build output confirms route-level chunk splitting.
- [ ] No regressions in editor, entries explorer, or viewer behavior.

## Dependencies & Considerations
- No new package dependency required (native React `lazy` and `Suspense`).
- Should be implemented before large feature additions (`FEAT-0011`) to control bundle growth.
- Avoid over-fragmentation into too many tiny chunks; prioritize route-level granularity over micro-splitting.
