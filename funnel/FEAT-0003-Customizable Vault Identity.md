# Customizable Vault Identity

## Feature ID: FEAT-0003
**Status**: Planned  

## Objective
To allow users to assign a personalized name to their diary/vault, while ensuring the underlying Google Drive sync mechanics are not compromised by folder renaming conflicts.

## Background & Requirements
- The user should be able to customize their vault name. 
- The app would append an identifyable unique string to the user's chosen name in order to retain all functioinality as it is right now, like checking and loading existing vault upon app launch. 
- The user should be able to change the vault name but not the unique string from within the application only. 
- When a vault is created, the app should instruct the user to not alter the vault name (especially the appended string) outside of the application (e.g. directly from Google Drive), and if they do, the app may not be able to find the vault upon launch. 
- The app should place a plain text readme file inside the vault which details the significance of the parent folder, its relation to the app and the Do's and Dont's. 

## Detailed Implementation Breakdown
### 1. Vault Naming Protocol Configuration
- Update the vault initialization logic. Accept the custom name as an input. 
- Generate a unique string identifier (e.g., `Silent_Memoirs_<UUID>`).
- Combine `[Custom Name] - [ID string]` to define the actual Google Drive physical folder structure. 

### 2. Rename Flow
- Implement a Settings -> Vault module allowing the user to type a new custom name.
- When saving, trigger a Google Drive API call to legitimately rename the parent folder ID in the cloud, while preserving the appended UUID string at the end. 
- Update local cached mapping or React Context pointing to the Vault name. 

### 3. Warning Documentation
- Create a `README.txt` template explaining the folder protocol. 
- During vault structure creation locally and its initial sync, insert the `README.txt` unencrypted at the root folder so the user can actually read it if they open Google Drive directly.

### 4. UI Adjustments
- Ensure the header, sidebar, or dashboard natively references the custom portion of the vault name to establish a personal feel, visually stripping the unique string when displayed in the UI. 

## Acceptance Criteria
- [ ] Initial Vault Creation prompts for a name.
- [ ] Folder in Google Drive reflects `CustomName - UniqueString`.
- [ ] Unencrypted `README.txt` is successfully seeded upon creation.
- [ ] Vault rename is possible natively in-app and synchronizes the folder name to GD.
- [ ] UI hides the ID portion.

## Dependencies & Considerations
- Drive Folder API (renaming directories).
- Local State adjustments to cache the display name properly.
