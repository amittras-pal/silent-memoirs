# Routing and Other Modules

## Feature ID: FEAT-0005
**Status**: Planned  

## Objective
To finalize the architectural paths, ensuring navigation flows are explicitly defined between dashboard views, editor, read-only modes, and vault management.

## Background & Requirements
- The app needs to implement routing (assuming vault is created, otherwise user is redirected to vault creation page). 
- The landing page upon app launch will require the user to unlock the vault. 
- The default landing page after unlocking is the editor screen for creating a new journal entry, the datepicker will be present at the top. 
- The entries listing will be a different module, navigation from sidebar "Entries". 
- Need to implement a new viewer module that allows read-only viewing of the selected entry. User may click an edit button to take the currently viewing note to the editor screen for editing. 

## Detailed Implementation Breakdown
### 1. Route Layout & Guards
- Migrate or structure `react-router-dom` carefully.
- Create an `AuthGuard` or `VaultGuard` wrapper. 
  - IF Vault isn't synced/auth'd -> redirect `/login`.
  - IF Vault is found but locked -> redirect `/unlock`.
  - IF Vault is unlocked -> allow access to inner routes.

### 2. Read-Only Viewer Implementation
- Develop a distinct Viewer component (vs Editor component) to display the parsed markdown beautifully. 
- Remove all unnecessary heavy markdown-editor dependencies from this specific view. However, use the @uiw/react-markdown-editor itself. 
- Introduce an "Edit Entry" floating action button (FAB) or header icon redirecting to `/editor/:id`.

### 3. Editor & Listing Updates
- Ensure `/editor` defaults to "New Entry" mode if no ID is provided in route. Integrations of the core datepicker to determine entry context.
- Implement the `/entries` listing view as a grid/list utilizing metadata without attempting to load the full body sizes. 

## Acceptance Criteria
- [ ] App effectively forces users to Vault login upon bootstrap if necessary.
- [ ] Left Sidebar routing successfully jumps between Editor and Entries List.
- [ ] Selecting an entry from List takes the user to Read-Only mode. 
- [ ] Editing the Read-Only entry successfully pushes route context to Editor mode. 

## Dependencies & Considerations
- Assumes existing state persistence and React context successfully load ahead of route guards checking permissions. 
