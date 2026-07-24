# Decrypt Script Enhancements

## Feature ID: FEAT-0015
**Status**: Planned  

## Objective
Improve the `Decrypt-Vault.ps1` (and `decrypt-vault.sh`) scripts in three areas:
1. **Code signing** — Eliminate the `PSSecurityException` / `UnauthorizedAccess` error on Windows without requiring users to manually bypass execution policy.
2. **Parallel decryption** — Use multi-threading to decrypt vault entries and media files concurrently, dramatically reducing total runtime for large vaults.
3. **CLI progress bar** — Show a live progress indicator so users can see decryption status rather than watching a wall of scrolling text.

## Background & Requirements
- The scripts live at [Decrypt-Vault.ps1](../app/src/assets/Decrypt-Vault.ps1) and [decrypt-vault.sh](../app/src/assets/decrypt-vault.sh).
- Today both scripts are fully sequential: each `age -d` call blocks until completion before the next file is processed.
- On Windows, the default execution policy (`Restricted` or `RemoteSigned`) blocks unsigned `.ps1` scripts downloaded from the internet. The user currently has to run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` as a workaround.
- The scripts must remain standalone utilities distributed with the vault export — no external dependencies beyond `age` (and `python3`/`jq` for the bash variant).

---

## Detailed Implementation Breakdown

### 1. Code Signing (`Decrypt-Vault.ps1`)

#### Problem
Windows flags the script with the NTFS "Zone.Identifier" alternate data stream (Mark of the Web) when downloaded. Combined with an execution policy stricter than `Bypass`, PowerShell refuses to load unsigned scripts.

#### Approach: Wrapper `.cmd` Launcher
A self-signed certificate would solve the issue **only** on the machine where the certificate is trusted — it doesn't help arbitrary end-users. A more practical and zero-friction approach is to ship a lightweight **`.cmd` (batch) launcher** alongside the `.ps1`:

- Create a new file `Decrypt-Vault.cmd` that invokes PowerShell with `-ExecutionPolicy Bypass` scoped only to that process.
- Users double-click or run `.\Decrypt-Vault.cmd` instead of the `.ps1` directly.
- The `.ps1` script itself remains unchanged and portable.
- This avoids asking users to install certificates or modify system-wide policies.

```cmd
@echo off
REM Silent Memoirs — Vault Decryption Launcher
REM This wrapper bypasses the execution policy for this process only.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Decrypt-Vault.ps1"
pause
```

> **Why not self-signed code signing?**  
> Self-signed certificates only work if the recipient's machine has the certificate in its Trusted Root store. For a utility distributed to end-users with their vault export, this creates more friction than it solves — every user would need to import the certificate first. The `.cmd` wrapper achieves the same outcome with zero setup.

#### Optional: Include Signing Instructions for Advanced Users
Add a section in the script header comments documenting how power users can sign the script themselves if their org enforces `AllSigned` policy:
```
# Optional: To sign this script with your own certificate:
#   $cert = Get-ChildItem -Path Cert:\CurrentUser\My -CodeSigningCert
#   Set-AuthenticodeSignature -FilePath .\Decrypt-Vault.ps1 -Certificate $cert
```

---

### 1b. Permission Handling (`decrypt-vault.sh`)

#### Problem
Bash scripts have an analogous (though different) permission issue on Unix systems:

1. **Missing executable bit**: When users extract a vault export from a `.zip` archive, the `chmod +x` permission is typically **not preserved**. Running `./decrypt-vault.sh` produces `Permission denied`.
2. **macOS Gatekeeper quarantine**: On macOS, downloaded files get a `com.apple.quarantine` extended attribute. Even with the executable bit set, macOS may block the script with a "cannot be opened because it is from an unidentified developer" dialog.

#### Approach: Document `chmod +x` and handle macOS quarantine

- The script header already documents `chmod +x decrypt-vault.sh` — this is the primary fix.
- Additionally, add a **self-healing check** at the top of the script: if the script detects it's being run via `bash decrypt-vault.sh` (i.e., sourced explicitly rather than executed directly), it works fine regardless of the executable bit. Document this as an alternative invocation.
- For macOS quarantine, add a note in the script header:
  ```
  # macOS users: If you see a Gatekeeper warning, run:
  #   xattr -d com.apple.quarantine decrypt-vault.sh
  ```
- Unlike Windows, there's no need for a wrapper script — `bash decrypt-vault.sh` bypasses the executable-bit requirement entirely, and the `xattr` command is a one-liner for macOS quarantine.

---

### 2. Parallel Decryption

#### PowerShell (`Decrypt-Vault.ps1`)

##### PowerShell Version Consideration
`ForEach-Object -Parallel` requires **PowerShell 7+**. Windows ships with PowerShell 5.1 by default. The script will:

1. **Detect the PowerShell version** at startup (`$PSVersionTable.PSVersion.Major -ge 7`).
2. If **PS 7+** → use `ForEach-Object -Parallel -ThrottleLimit $threadCount -AsJob`.
3. If **PS 5.1** → fall back to **sequential processing** with a warning message:
   ```
   [WARN] PowerShell 5.1 detected. Parallel decryption requires PowerShell 7+.
          Falling back to sequential processing. Install PS 7 for faster decryption.
   ```

> **Decision:** Sequential fallback on PS 5.1 — avoids the complexity of hand-rolled runspace pools while keeping the script functional on all Windows versions.

##### Thread Count Detection
```powershell
$threadCount = [Environment]::ProcessorCount
# Cap at a sensible max to avoid overwhelming disk I/O
$threadCount = [Math]::Min($threadCount, 16)
Write-Host "[INFO] Using $threadCount parallel threads" -ForegroundColor Cyan
```

##### Shared State for Progress Tracking
Use a `[hashtable]::Synchronized()` to safely share counters across threads:
```powershell
$sync = [hashtable]::Synchronized(@{
    EntriesOk   = 0
    EntriesFail = 0
    MediaOk     = 0
    MediaFail   = 0
    Completed   = 0
})
```

##### Execution Flow
1. **Collect all work items** — Scan year directories upfront and build a flat list of `[PSCustomObject]@{ Type='Entry'|'Media'; Path=...; RelPath=...; OutFile=... }`.
2. **Process in parallel** — Pipe the list into `ForEach-Object -Parallel` with `-ThrottleLimit $threadCount` and `-AsJob`.
3. **Monitor from main thread** — A `while` loop reads `$sync.Completed` and updates the progress bar until the job completes.

##### Per-File Error Handling
Each parallel invocation handles its own `try/catch` and updates the synchronized counters. Temp files use unique names via `[System.IO.Path]::GetTempFileName()` (already unique per-call).

#### Bash (`decrypt-vault.sh`)

##### Approach
Implement parallelism for parity with the PowerShell script. Use `xargs -P` (POSIX-compliant, no extra dependencies) as the primary mechanism, with sequential fallback.

```bash
NPROC=$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 1)
NPROC=$((NPROC > 16 ? 16 : NPROC))
```

##### Execution Flow
1. Build a manifest of files to decrypt (one path per line) into a temp file.
2. Define a `decrypt_one()` function exported via `export -f` that handles a single file (entry or media) and writes results to a shared temp directory (one status file per item).
3. Use `xargs -P $NPROC` for parallel execution — this is available on both Linux and macOS without extra installs.
4. Aggregate results by reading the per-item status files after all jobs complete.
5. Fall back to sequential `while read` loop if `xargs -P` is unavailable (unlikely but safe).

> **Decision:** Implement for parity. `xargs -P` is preferred over GNU `parallel` since it's POSIX and requires no extra dependencies.

---

### 3. CLI Progress Bar

#### PowerShell (`Decrypt-Vault.ps1`)

##### Using `Write-Progress`
PowerShell has a built-in `Write-Progress` cmdlet that renders a native progress bar in the terminal.

```powershell
$totalFiles = $allWorkItems.Count
# In the monitoring loop:
while ($job.State -eq 'Running') {
    $pct = if ($totalFiles -gt 0) { [Math]::Min(100, [int](($sync.Completed / $totalFiles) * 100)) } else { 0 }
    Write-Progress -Activity "Decrypting vault" `
        -Status "$($sync.Completed) of $totalFiles files" `
        -PercentComplete $pct
    Start-Sleep -Milliseconds 250
}
Write-Progress -Activity "Decrypting vault" -Completed
```

##### Display Details
- **Activity**: "Decrypting vault"
- **Status line**: `"42/128 entries processed"` — a clean M/N counter updated in real-time.
- **PercentComplete**: Based on `$sync.Completed / $totalFiles`
- After completion, clear the progress bar and print the final summary block (entries/media OK/FAIL counts).

##### Output Strategy
No per-file `[ENTRY OK]` / `[MEDIA OK]` lines during processing. The progress bar + status line replaces them entirely. Only the final summary is printed after completion. If any files fail, the failed file paths are collected and listed in the final summary.

#### Bash (`decrypt-vault.sh`)

Use a simple inline progress bar rendered with `printf` and `\r` (carriage return):

```bash
show_progress() {
    local current=$1 total=$2
    local pct=$((current * 100 / total))
    local filled=$((pct / 2))
    local empty=$((50 - filled))
    printf "\r  [%-50s] %3d%% (%d/%d)" \
        "$(printf '#%.0s' $(seq 1 $filled))" \
        "$pct" "$current" "$total"
}
```

---

### 4. Vault Instructions & Existing User Migration

#### Files Affected
- [vault-directory-instructions.txt](../app/src/assets/vault-directory-instructions.txt) — the README shipped inside every vault.
- [sync.ts](../app/src/lib/sync.ts) — `ensureInstructionsFile()` handles backfilling vault files on sync.
- [vault.ts](../app/src/lib/vault.ts) — initial vault creation writes README + scripts unconditionally.

#### 4a. Update `vault-directory-instructions.txt`

The instructions file needs to reflect the new workflow introduced by this feature. Specifically, **Section 3 ("BULK DECRYPTION")** must be updated:

**Current instructions (lines 57-64):**
```
2. Run the appropriate script for your platform:

   macOS / Linux:
     chmod +x decrypt-vault.sh
     ./decrypt-vault.sh

   Windows (PowerShell):
     .\Decrypt-Vault.ps1
```

**Updated instructions should:**
- Add the `.cmd` launcher as the **primary** Windows method (double-click or `.\Decrypt-Vault.cmd`).
- Keep `.\Decrypt-Vault.ps1` as an alternative with a note about execution policy.
- Add the macOS quarantine note (`xattr -d com.apple.quarantine`) under the macOS/Linux section.
- Add `bash decrypt-vault.sh` as an alternative that doesn't require `chmod +x`.
- Mention that decryption will use parallel processing automatically when possible.

**Proposed Section 3 update:**
```
2. Run the appropriate script for your platform:

   Windows:
     Double-click `Decrypt-Vault.cmd` or run in a terminal:
       .\Decrypt-Vault.cmd

     Alternative (PowerShell directly):
       .\Decrypt-Vault.ps1
     Note: If you see an "execution policy" error, use the .cmd launcher
     instead, or run: Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

   macOS / Linux:
     chmod +x decrypt-vault.sh
     ./decrypt-vault.sh

     Alternative (no chmod needed):
       bash decrypt-vault.sh

     macOS only: If you see a Gatekeeper warning, run first:
       xattr -d com.apple.quarantine decrypt-vault.sh
```

Also add a note under **NOTES** section:
```
- Decryption runs in parallel when your system supports it. No configuration
  needed — the script automatically detects available CPU cores.
```

#### 4b. Add `Decrypt-Vault.cmd` to Vault Exports

The new `.cmd` launcher must be written to the vault alongside the existing scripts. This requires changes in two places:

1. **[vault.ts](../app/src/lib/vault.ts) — initial vault creation (line ~168):**
   - Import the new `Decrypt-Vault.cmd` asset.
   - Add an `uploadFile('Decrypt-Vault.cmd', ...)` call alongside the existing script uploads.

2. **[sync.ts](../app/src/lib/sync.ts) — `ensureInstructionsFile()` backfill (line ~87):**
   - Add a `!files.includes('Decrypt-Vault.cmd')` check and upload block, matching the existing pattern for the other scripts.

#### 4c. Migrating Existing Users — Version-Stamp Approach

This is the critical consideration. Currently, `ensureInstructionsFile()` in [sync.ts](../app/src/lib/sync.ts) only writes files **if they don't already exist**:

```typescript
if (!files.includes('README-Silent-Memoirs.txt'))
  await this.storage.uploadFile('README-Silent-Memoirs.txt', ...);
if (!files.includes('decrypt-vault.sh')) { ... }
if (!files.includes('Decrypt-Vault.ps1')) { ... }
```

This means existing users will:
- ✅ Get the new `Decrypt-Vault.cmd` (it doesn't exist yet, so the backfill will create it).
- ❌ **NOT** get the updated `README-Silent-Memoirs.txt` (it already exists with old content).
- ❌ **NOT** get the updated `Decrypt-Vault.ps1` or `decrypt-vault.sh` (they already exist).

**Proposed migration strategy — version-stamped utility sync:**

Instead of always overwriting (wasteful) or only creating missing files (stale), use the **app version** as a change indicator to selectively sync utility files only when the app has been updated.

##### Step 1: Expose app version at build time

The app version lives in [package.json](../app/package.json) (`"version": "0.0.0"`). Vite can inject it as a build-time constant via `define` in [vite.config.ts](../app/vite.config.ts):

```typescript
// vite.config.ts
import { version } from './package.json';

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  // ...
});
```

And a corresponding type declaration so TypeScript is happy:

```typescript
// src/vite-env.d.ts (or a global.d.ts)
declare const __APP_VERSION__: string;
```

> **Note:** The current version is `"0.0.0"`. This should be bumped to a real version (e.g., `"1.0.0"`) as part of this feature or a prior release. The version-stamp mechanism only works meaningfully once the version starts incrementing.

##### Step 2: Store a version stamp in the vault

During sync, write a small file `.vault-utils-version` to the vault root containing just the app version string. This file acts as the "last synced" marker.

##### Step 3: Updated `ensureInstructionsFile()` flow

```typescript
public async ensureInstructionsFile(): Promise<void> {
  try {
    const files = await this.storage.listFiles('');

    // Check if vault utilities are already current
    let needsUpdate = true;
    if (files.includes('.vault-utils-version')) {
      const versionBytes = await this.storage.downloadFile('.vault-utils-version');
      const vaultVersion = new TextDecoder().decode(versionBytes).trim();
      needsUpdate = (vaultVersion !== __APP_VERSION__);
    }

    if (!needsUpdate) return; // Everything is current — skip all uploads

    // Version mismatch or stamp missing → upload all utility files
    await this.storage.uploadFile('README-Silent-Memoirs.txt',
      new TextEncoder().encode(instructionsText), 'text/plain');
    await this.storage.uploadFile('decrypt-vault.sh',
      new TextEncoder().encode(decryptVaultSh), 'text/plain');
    await this.storage.uploadFile('Decrypt-Vault.ps1',
      new TextEncoder().encode(decryptVaultPs1), 'text/plain');
    await this.storage.uploadFile('Decrypt-Vault.cmd',
      new TextEncoder().encode(decryptVaultCmd), 'text/plain');

    // Update the version stamp last (acts as a commit marker)
    await this.storage.uploadFile('.vault-utils-version',
      new TextEncoder().encode(__APP_VERSION__), 'text/plain');
  } catch (error) {
    console.warn("Failed to sync vault utility files:", error);
  }
}
```

##### How it works per scenario

| Scenario | API Calls | What happens |
|---|---|---|
| **Normal sync, same app version** | 1 download (version stamp) | Reads `.vault-utils-version`, version matches → skips everything |
| **First sync after app update** | 1 download + 5 uploads | Version mismatch → uploads all 4 utility files + new version stamp |
| **New vault / missing stamp** | 5 uploads | Stamp doesn't exist → uploads everything (same as current behavior) |
| **Upload partially fails** | Varies | Version stamp is written last, so a partial failure means it retries next sync |

##### When the version stamp gets updated

The stamp updates **during sync, automatically**, whenever the app detects a mismatch between the vault's stamp and the build-time `__APP_VERSION__`. No manual step is needed. The lifecycle is:

1. Developer bumps `version` in `package.json` as part of the release process.
2. Vite bakes the version into the build via `define: { __APP_VERSION__: ... }`.
3. User loads the updated app → their next sync reads the vault's `.vault-utils-version`.
4. Mismatch detected → all utility files re-uploaded → stamp updated to new version.
5. All subsequent syncs on that app version → stamp matches → zero uploads.

---

## Acceptance Criteria
- [ ] A `Decrypt-Vault.cmd` launcher exists and allows running the script on Windows without execution policy errors.
- [ ] `decrypt-vault.sh` header documents `chmod +x` and macOS `xattr -d com.apple.quarantine` workarounds.
- [ ] `Decrypt-Vault.ps1` detects logical processor count and uses parallel decryption on PS 7+.
- [ ] `Decrypt-Vault.ps1` falls back to sequential on PS 5.1 with a warning message.
- [ ] `decrypt-vault.sh` uses `xargs -P` for parallel decryption with sequential fallback.
- [ ] A live progress bar is displayed during decryption with an `M/N entries processed` status line.
- [ ] No per-file output during processing; final summary prints entry/media OK/FAIL counts and lists any failed files.
- [ ] Parallel decryption produces the same output files as the current sequential version.
- [ ] No new external dependencies are introduced.
- [ ] `vault-directory-instructions.txt` updated with new Windows `.cmd` instructions, macOS quarantine note, and parallel processing mention.
- [ ] `Decrypt-Vault.cmd` is included in vault exports (both initial creation and sync backfill).
- [ ] App version exposed at build time via `__APP_VERSION__` in `vite.config.ts`.
- [ ] `.vault-utils-version` stamp file used to skip utility uploads when vault is already current.
- [ ] Version stamp written last (after all utility files) to ensure atomicity on partial failure.

## Dependencies & Considerations
- **PowerShell 7+ detection**: `$PSVersionTable.PSVersion.Major -ge 7`. The script already runs on PS 5.1; the parallel path is an additive enhancement.
- **Thread safety**: Each parallel invocation creates its own temp file. The synchronized hashtable handles counter updates. No file-level contention since each work item writes to a unique output path.
- **Disk I/O bottleneck**: For vaults on spinning disks or network drives, high parallelism may not help. The `[Math]::Min($threadCount, 16)` cap mitigates this, but consider adding a `-MaxThreads` parameter for user override.
- **Error reporting**: Failed file paths are collected in a synchronized list (PS) or per-item status files (bash) and printed in the final summary.
- **Vault export pipeline**: The `.cmd` launcher must be added to both [vault.ts](../app/src/lib/vault.ts) (initial creation) and [sync.ts](../app/src/lib/sync.ts) (backfill). The instructions text asset is imported in both files and in [VaultSetupWall.tsx](../app/src/components/VaultSetupWall.tsx) (preview display).
- **Version management**: The app version in [package.json](../app/package.json) is currently `"0.0.0"` — must be bumped to a real version before or alongside this feature. The `__APP_VERSION__` define in `vite.config.ts` makes it available at runtime without importing `package.json` directly.
- **Atomicity**: Writing `.vault-utils-version` last ensures that if any upload fails mid-way, the version stamp remains stale and the next sync will retry all files.
