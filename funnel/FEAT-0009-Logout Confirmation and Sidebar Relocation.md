# Logout Confirmation and Sidebar Relocation

## Feature ID: FEAT-0009
**Status**: Planned  

## Objective
Move logout into the sidebar and require an explicit confirmation dialog every time, with stronger warning copy when there are pending unsynced changes.

## Background & Requirements
- Current logout is a header action icon in [app/src/App.tsx](app/src/App.tsx) and executes immediately via `handleLogout`.
- Requirement: logout action must move to sidebar.
- Requirement: confirmation dialog must always appear, even when there is no pending work.
- Requirement: confirmation message must change if pending unsynced changes exist.
- Current observable pending-change signals:
  - `isDirty` indicates unsaved editor changes in memory.
  - `isSaving` indicates save/sync currently in progress.

## Detailed Implementation Breakdown
### 1. Introduce a Logout Request Flow (Do Not Logout Immediately)
- Split current behavior into:
  - `requestLogout()` -> opens confirmation modal.
  - `performLogout()` -> current cleanup logic from `handleLogout`.
- Ensure no code path directly calls `performLogout()` without user confirmation (except forced auth failure fallback if needed).

### 2. Move Logout UI to Sidebar
- Remove header logout icon/action from `AppShell.Header` in [app/src/App.tsx](app/src/App.tsx).
- Add sidebar action labeled `Logout` in a utility section under navigation links.
- Distinguish from `Lock Vault`:
  - `Lock Vault` should be neutral security action.
  - `Logout` should be destructive session-disconnect action.

### 3. Add Confirmation Modal with Dynamic Messaging
- Add modal state (for example `logoutModalOpened`).
- Compute `hasPendingUnsyncedChanges` using current signals:
  - `isDirty || isSaving`
- Modal copy variants:
  - If pending changes: warn user that unsaved or in-flight sync changes may be lost and staged temporary media will be cleared.
  - If no pending changes: still require explicit confirmation with standard logout message.
- Modal actions:
  - `Cancel` (default)
  - `Logout & Disconnect` (destructive style)

### 4. Preserve Existing Logout Cleanup Semantics
- `performLogout()` should keep existing cleanup behavior from current [app/src/App.tsx](app/src/App.tsx):
  - Clear media cache and staged media.
  - Clear cached Google token via `clearCachedGoogleToken()`.
  - Reset storage/vault/sync/editor states.
  - Navigate to login route.
- Ensure unauthorized error handling still works:
  - For `UnauthorizedError`, app may call `performLogout()` directly to enforce auth reset.

### 5. UX Safeguards and Edge Cases
- If `isSaving` is true, disable confirm button or show stronger warning text to avoid race confusion.
- Modal must be reachable by keyboard and close correctly on cancel.
- On mobile sidebar, action must remain discoverable and not hidden behind header-only affordance.

### 6. Testing Plan
- No pending changes -> logout modal appears -> confirm logs out.
- Dirty draft exists -> modal warning text switches to pending-changes variant.
- Saving in progress -> behavior follows selected safeguard rule (disable confirm or explicit warning).
- Unauthorized API failure path still logs out immediately without stale partial state.

## Acceptance Criteria
- [ ] Logout action is present in sidebar and removed from header.
- [ ] Clicking logout always opens a confirmation dialog.
- [ ] Dialog messaging changes when pending unsynced changes are detected.
- [ ] Confirmed logout fully clears session/auth state and returns to login.
- [ ] Cancel leaves user exactly where they were with no state mutation.

## Dependencies & Considerations
- Pairs with `FEAT-0008` (manual lock): both actions should live in sidebar with clear semantic difference.
- Keep warning language simple and non-technical while still explicit about data loss risk.
- If future background sync queue is introduced, extend `hasPendingUnsyncedChanges` to include queue state.
