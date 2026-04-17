# Default Vault Instructions File

## Feature ID: FEAT-0010
**Status**: Completed  

## Objective
Automatically place a human-readable instructions file in every vault root directory at creation time, explaining vault structure, safety rules, and manual decryption steps for macOS and Windows.

## Background & Requirements
- Current vault bootstrap in [app/src/lib/vault.ts](app/src/lib/vault.ts) writes cryptographic files (`vault_key.age`, `vault_pub.txt`) but does not seed any user-facing guidance file.
- Requirement: include an instructions file in newly created vault directories.
- Requirement: content must explain:
  - What files/folders exist and what they mean.
  - Why users should not modify vault internals directly.
  - How to decrypt data outside the app on macOS and Windows.
- Requirement: language should be understandable to non-technical users.
- Requirement: keep source template inside repository and copy/upload it during vault initialization.

## Detailed Implementation Breakdown
### 1. Add Repository-Tracked Template File
- Add a plain text template file in source control (recommended: [app/src/assets/vault-directory-instructions.txt](app/src/assets/vault-directory-instructions.txt)).
- Template sections must include:
  - Intro: this folder belongs to Silent Memoirs.
  - File map:
    - `vault_key.age`: wrapped vault secret.
    - `vault_pub.txt`: public key.
    - `manifest.age`: encrypted index metadata.
    - `YYYY/*.age`: encrypted entries.
    - `YYYY/media/*`: encrypted media files.
  - Safety warning: do not rename, edit, or move internal files/folders manually.
  - Manual decryption guide for macOS and Windows using Age CLI with the recovery key.
  - Recovery warning: without recovery key, manual decryption is not possible.
  - External links to Age project docs and basic CLI install docs.

### 2. Seed Instructions During Vault Initialization
- In `VaultManager.initializeVault` in [app/src/lib/vault.ts](app/src/lib/vault.ts):
  - After key files are uploaded, upload the instructions file with MIME type `text/plain`.
  - Use a deterministic filename (recommended: `README-Silent-Memoirs.txt`).
- Define error strategy explicitly:
  - Because requirement says file must be present, treat failed upload as vault setup failure and surface actionable error.

### 3. Keep Content Decoupled from Logic
- Do not hardcode long instruction text inline in TS logic.
- Import template text (via Vite raw import or bundled string module) so future copy edits do not touch crypto logic.
- Optional: include template version marker in file header for future migrations.

### 4. Add Backfill for Existing Vaults (Recommended)
- For users with already initialized vaults, add a one-time backfill check:
  - On unlock or first sync bootstrap, verify README exists.
  - If missing, upload it silently.
- This avoids mixed user experience where only newly created vaults get documentation.

### 5. Authoring Guidance for Decryption Instructions
- Provide practical, copy-ready command examples in the template for both OS targets.
- Keep command examples generic and safe:
  - Save recovery key to identity file.
  - Decrypt a selected `.age` file to `.json` or `.md` output.
- Clarify that exported decrypted files are no longer encrypted and must be stored carefully.

### 6. Validation Plan
- Create new vault and verify README exists in root folder next to vault files.
- Open README directly in Drive and confirm readability.
- Verify instructions mention current file layout accurately.
- Simulate upload failure and verify user receives clear blocking error.

## Acceptance Criteria
- [ ] New vault creation uploads a default instructions file to vault root.
- [ ] Instruction content is sourced from a repository template file.
- [ ] File clearly explains structure, tamper warnings, and manual decrypt steps for macOS and Windows.
- [ ] Missing-file backfill behavior is implemented or explicitly deferred with rationale.
- [ ] Vault creation fails with clear messaging if README upload cannot be completed.

## Dependencies & Considerations
- Depends on recovery key behavior from `FEAT-0001` for manual decrypt instructions.
- Should align language with customization notes in `FEAT-0003` to avoid conflicting user guidance.
- Keep content plain text to ensure easy readability from Google Drive web UI and mobile clients.
