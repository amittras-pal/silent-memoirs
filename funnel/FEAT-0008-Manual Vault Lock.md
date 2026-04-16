# Manual Vault Lock

## Feature ID: FEAT-0008
**Status**: Completed  

## Objective
Expose a dedicated manual vault lock action in the sidebar so users can immediately lock cryptographic access without logging out or disconnecting Google Drive.

## Background & Requirements
- Current lock behavior exists in [app/src/App.tsx](app/src/App.tsx) as `handleLockVault`, and it is mainly triggered by inactivity timeout or inactivity warning modal action.
- The app currently has no always-visible, deliberate lock action in the sidebar.
- Requirement: user must be able to lock on demand.
- Requirement: manual lock must not change the existing draft preservation behavior.
- Requirement: lock is distinct from logout:
  - Lock: remove vault decryption context, keep auth session.
  - Logout: clear auth token and return to login.

## Detailed Implementation Breakdown
### 1. Add Sidebar Lock Entry Point
- In the protected `AppShell.Navbar` (inside [app/src/App.tsx](app/src/App.tsx)), add a dedicated action labeled `Lock Vault`.
- Place this action in the sidebar utility section (near logout action once logout is moved per `FEAT-0009`).
- Use lock-specific iconography and warning-neutral language (not destructive account language).

### 2. Consolidate Lock Logic into One Reusable Action
- Keep one source of truth for lock behavior (manual button + inactivity auto-lock + inactivity modal `Lock Now`).
- Recommended refactor:
  - Rename current `handleLockVault` to `performVaultLock`.
  - Route all lock triggers through this method.
- Preserve current lock semantics:
  - Clear decrypted media cache (`clearMediaImageCache`).
  - Clear upload path cursor (`clearMediaUploadPathCursor`).
  - Clear staged media cache (`clearAllStagedMedia`) as currently implemented.
  - Clear `vaultManager` and `syncEngine`.
  - Navigate to unlock route.
- Do not invoke logout operations:
  - Do not clear Google token.
  - Do not clear `storage`.

### 3. Preserve Draft Behavior Exactly as Current Flow
- Confirm lock action does not wipe editor title/content/date states.
- Keep current restore behavior after successful unlock (resume route logic already in [app/src/App.tsx](app/src/App.tsx) via `getResumeRoute`).
- Do not introduce extra confirms for manual lock unless there is explicit UX request; this feature is direct lock action.

### 4. Accessibility and Feedback
- Lock action must be keyboard reachable in sidebar.
- Add tooltip/helper text clarifying difference between lock and logout.
- Ensure action is available on all protected modes (`editor`, `entries`, `viewer`).

### 5. Verification Matrix
- From editor with unsaved draft, click `Lock Vault`, unlock, verify draft is still present in memory as currently expected.
- From viewer, click `Lock Vault`, unlock, verify return to prior entry route.
- From entries list, click `Lock Vault`, unlock, verify directory context resumes.
- Inactivity auto-lock behavior remains unchanged.

## Acceptance Criteria
- [x] Sidebar contains a dedicated manual `Lock Vault` action.
- [x] Manual lock routes user to unlock flow immediately.
- [x] Manual lock does not disconnect Google Drive session.
- [x] Draft/session restoration behavior after unlock remains unchanged from current behavior.
- [x] Inactivity lock logic still works and reuses the same lock pipeline.

## Dependencies & Considerations
- Closely related to `FEAT-0009` (logout relocation and confirmation); both should use clearly separated actions.
- If staged media clearing on lock is later reconsidered, update both manual and inactivity paths consistently.
- Keep security posture strict: all decrypted in-memory contexts must be dropped on lock.
