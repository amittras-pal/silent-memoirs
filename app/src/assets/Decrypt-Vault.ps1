# =============================================================================
# Silent Memoirs — Vault Decryption Script (Windows PowerShell)
# =============================================================================
# This script decrypts your Silent Memoirs vault entries and media files.
#
# Prerequisites:
#   1. Install the 'age' CLI tool:
#      Download from https://github.com/FiloSottile/age/releases
#      Extract and add to your PATH, or place age.exe in this directory.
#   2. Place your recovery key in a file named 'identity.txt' in the same
#      directory as this script. The file should contain only your key
#      starting with AGE-SECRET-KEY-...
#
# Usage:
#   Double-click Decrypt-Vault.cmd, or run in PowerShell:
#     .\Decrypt-Vault.cmd
#
#   Alternative (PowerShell directly):
#     .\Decrypt-Vault.ps1
#   Note: If you see an "execution policy" error, use the .cmd launcher
#   instead, or run:
#     Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#
# Optional: To sign this script with your own certificate:
#   $cert = Get-ChildItem -Path Cert:\CurrentUser\My -CodeSigningCert
#   Set-AuthenticodeSignature -FilePath .\Decrypt-Vault.ps1 -Certificate $cert
# =============================================================================

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$VaultDir = $ScriptDir
$IdentityFile = Join-Path $VaultDir "identity.txt"
$OutputDir = Join-Path $VaultDir "decrypted"

# Supported media extensions (matching the app's supported formats)
$MediaExtensions = @(".png", ".webp", ".jpg", ".jpeg", ".avif")

# --- Pre-flight checks -------------------------------------------------------

Write-Host "Silent Memoirs - Vault Decryption" -ForegroundColor Cyan
Write-Host "============================================"
Write-Host ""

# Check for age CLI (look in PATH and current directory)
$agePath = $null
$localAge = Join-Path $VaultDir "age.exe"
if (Test-Path $localAge) {
    $agePath = $localAge
} elseif (Get-Command "age" -ErrorAction SilentlyContinue) {
    $agePath = (Get-Command "age").Source
}

if (-not $agePath) {
    Write-Host "ERROR: 'age' command not found." -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install the age encryption tool:"
    Write-Host "  Download from: https://github.com/FiloSottile/age/releases"
    Write-Host "  Place age.exe in this directory or add it to your PATH."
    Write-Host ""
    exit 1
}

Write-Host "[OK] age CLI found: $agePath" -ForegroundColor Green

# Check for identity file
if (-not (Test-Path $IdentityFile)) {
    Write-Host ""
    Write-Host "ERROR: Identity file not found." -ForegroundColor Red
    Write-Host ""
    Write-Host "Please create a file named 'identity.txt' in this directory:"
    Write-Host "  $IdentityFile"
    Write-Host ""
    Write-Host "The file should contain only your 128-character recovery key"
    Write-Host "starting with AGE-SECRET-KEY-..."
    Write-Host ""
    exit 1
}

# Validate identity file content
$firstLine = (Get-Content $IdentityFile -First 1).Trim()
if (-not $firstLine.StartsWith("AGE-SECRET-KEY-")) {
    Write-Host ""
    Write-Host "ERROR: identity.txt does not appear to contain a valid age secret key." -ForegroundColor Red
    Write-Host "The key must start with 'AGE-SECRET-KEY-'."
    Write-Host ""
    exit 1
}

Write-Host "[OK] Identity file found" -ForegroundColor Green
Write-Host ""

# --- Create output directory --------------------------------------------------

if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

Write-Host "Output directory: $OutputDir"
Write-Host ""

# --- Helper function ----------------------------------------------------------

function Get-RelativePath {
    param([string]$BasePath, [string]$FullPath)
    $base = $BasePath.TrimEnd('\', '/') + '\'
    if ($FullPath.StartsWith($base)) {
        return $FullPath.Substring($base.Length)
    }
    return $FullPath
}

# --- Collect all work items ---------------------------------------------------

$workItems = @()

# Find year directories (4-digit folders)
$yearDirs = Get-ChildItem -Path $VaultDir -Directory | Where-Object { $_.Name -match '^\d{4}$' }

foreach ($yearDir in $yearDirs) {
    # Collect entry files: YYYY/*.age
    $entryFiles = Get-ChildItem -Path $yearDir.FullName -File -Filter "*.age" -ErrorAction SilentlyContinue
    foreach ($entryFile in $entryFiles) {
        $relPath = Get-RelativePath -BasePath $VaultDir -FullPath $entryFile.FullName
        $relPath = $relPath -replace '\\', '/'
        $outRel = $relPath -replace '\.age$', '.md'
        $outFile = Join-Path $OutputDir ($outRel -replace '/', '\')

        $workItems += [PSCustomObject]@{
            Type     = 'Entry'
            InFile   = $entryFile.FullName
            RelPath  = $relPath
            OutRel   = $outRel
            OutFile  = $outFile
        }
    }

    # Collect media files: YYYY/media/*.{png,webp,jpg,jpeg,avif}
    $mediaDir = Join-Path $yearDir.FullName "media"
    if (Test-Path $mediaDir) {
        $mediaFiles = Get-ChildItem -Path $mediaDir -File | Where-Object {
            $MediaExtensions -contains $_.Extension.ToLower()
        }

        foreach ($mediaFile in $mediaFiles) {
            $relPath = Get-RelativePath -BasePath $VaultDir -FullPath $mediaFile.FullName
            $relPath = $relPath -replace '\\', '/'
            $outFile = Join-Path $OutputDir ($relPath -replace '/', '\')

            $workItems += [PSCustomObject]@{
                Type     = 'Media'
                InFile   = $mediaFile.FullName
                RelPath  = $relPath
                OutRel   = $relPath
                OutFile  = $outFile
            }
        }
    }
}

$totalFiles = $workItems.Count

if ($totalFiles -eq 0) {
    Write-Host "No encrypted files found in vault." -ForegroundColor Yellow
    Write-Host ""
    exit 0
}

Write-Host "Found $totalFiles files to decrypt."
Write-Host ""

# --- Ensure output directories exist ------------------------------------------

foreach ($item in $workItems) {
    $outDir = Split-Path -Parent $item.OutFile
    if (-not (Test-Path $outDir)) {
        New-Item -ItemType Directory -Path $outDir -Force | Out-Null
    }
}

# --- Decrypt function ---------------------------------------------------------

function Invoke-DecryptItem {
    param(
        [PSCustomObject]$Item,
        [string]$AgePath,
        [string]$IdentityFilePath
    )

    $result = [PSCustomObject]@{
        Type    = $Item.Type
        RelPath = $Item.RelPath
        Success = $false
        Error   = $null
    }

    $tempFile = [System.IO.Path]::GetTempFileName()
    $stderrFile = [System.IO.Path]::GetTempFileName()
    try {
        if ($Item.Type -eq 'Entry') {
            $proc = Start-Process -FilePath $AgePath -ArgumentList "-d", "-i", "`"$IdentityFilePath`"", "-o", "`"$tempFile`"", "`"$($Item.InFile)`"" -NoNewWindow -Wait -PassThru -RedirectStandardError $stderrFile
            if ($proc.ExitCode -eq 0) {
                try {
                    $jsonContent = Get-Content $tempFile -Raw -Encoding UTF8
                    $entry = $jsonContent | ConvertFrom-Json
                    $plaintext = $entry.plaintext
                    if ($null -eq $plaintext) { $plaintext = "" }
                    [System.IO.File]::WriteAllText($Item.OutFile, $plaintext, [System.Text.UTF8Encoding]::new($false))
                    $result.Success = $true
                } catch {
                    $result.Error = "JSON parse error"
                    if (Test-Path $Item.OutFile) { Remove-Item $Item.OutFile -Force }
                }
            } else {
                $result.Error = "decryption error"
            }
        } else {
            # Media file — decrypt directly to output
            $proc = Start-Process -FilePath $AgePath -ArgumentList "-d", "-i", "`"$IdentityFilePath`"", "-o", "`"$($Item.OutFile)`"", "`"$($Item.InFile)`"" -NoNewWindow -Wait -PassThru -RedirectStandardError $stderrFile
            if ($proc.ExitCode -eq 0) {
                $result.Success = $true
            } else {
                $result.Error = "decryption error"
                if (Test-Path $Item.OutFile) { Remove-Item $Item.OutFile -Force }
            }
        }
    } catch {
        $result.Error = $_.Exception.Message
        if (Test-Path $Item.OutFile) { Remove-Item $Item.OutFile -Force }
    } finally {
        if (Test-Path $tempFile) { Remove-Item $tempFile -Force }
        if (Test-Path $stderrFile) { Remove-Item $stderrFile -Force }
    }

    return $result
}

# --- Decrypt files (parallel or sequential) -----------------------------------

$EntriesOk = 0
$EntriesFail = 0
$MediaOk = 0
$MediaFail = 0
$failedFiles = @()

$useParallel = $PSVersionTable.PSVersion.Major -ge 7

if ($useParallel) {
    $threadCount = [Environment]::ProcessorCount
    $threadCount = [Math]::Min($threadCount, 16)
    Write-Host "[INFO] Using $threadCount parallel threads (PowerShell $($PSVersionTable.PSVersion))" -ForegroundColor Cyan
    Write-Host ""

    # Synchronized state for progress tracking
    $sync = [hashtable]::Synchronized(@{
        Completed   = 0
        EntriesOk   = 0
        EntriesFail = 0
        MediaOk     = 0
        MediaFail   = 0
        FailedFiles = [System.Collections.ArrayList]::Synchronized([System.Collections.ArrayList]::new())
    })

    # Launch parallel work as a job
    $job = $workItems | ForEach-Object -Parallel {
        $item = $_
        $syncRef = $using:sync
        $ageTool = $using:agePath
        $idFile = $using:IdentityFile

        $tempFile = [System.IO.Path]::GetTempFileName()
        $stderrFile = [System.IO.Path]::GetTempFileName()
        try {
            if ($item.Type -eq 'Entry') {
                $proc = Start-Process -FilePath $ageTool -ArgumentList "-d", "-i", "`"$idFile`"", "-o", "`"$tempFile`"", "`"$($item.InFile)`"" -NoNewWindow -Wait -PassThru -RedirectStandardError $stderrFile
                if ($proc.ExitCode -eq 0) {
                    try {
                        $jsonContent = Get-Content $tempFile -Raw -Encoding UTF8
                        $entry = $jsonContent | ConvertFrom-Json
                        $plaintext = $entry.plaintext
                        if ($null -eq $plaintext) { $plaintext = "" }
                        [System.IO.File]::WriteAllText($item.OutFile, $plaintext, [System.Text.UTF8Encoding]::new($false))
                        $syncRef.EntriesOk++
                    } catch {
                        $syncRef.EntriesFail++
                        $syncRef.FailedFiles.Add("[ENTRY FAIL] $($item.RelPath) (JSON parse error)") | Out-Null
                        if (Test-Path $item.OutFile) { Remove-Item $item.OutFile -Force }
                    }
                } else {
                    $syncRef.EntriesFail++
                    $syncRef.FailedFiles.Add("[ENTRY FAIL] $($item.RelPath) (decryption error)") | Out-Null
                }
            } else {
                $proc = Start-Process -FilePath $ageTool -ArgumentList "-d", "-i", "`"$idFile`"", "-o", "`"$($item.OutFile)`"", "`"$($item.InFile)`"" -NoNewWindow -Wait -PassThru -RedirectStandardError $stderrFile
                if ($proc.ExitCode -eq 0) {
                    $syncRef.MediaOk++
                } else {
                    $syncRef.MediaFail++
                    $syncRef.FailedFiles.Add("[MEDIA FAIL] $($item.RelPath)") | Out-Null
                    if (Test-Path $item.OutFile) { Remove-Item $item.OutFile -Force }
                }
            }
        } catch {
            if ($item.Type -eq 'Entry') { $syncRef.EntriesFail++ } else { $syncRef.MediaFail++ }
            $syncRef.FailedFiles.Add("[$($item.Type.ToUpper()) FAIL] $($item.RelPath) ($_)") | Out-Null
            if (Test-Path $item.OutFile) { Remove-Item $item.OutFile -Force }
        } finally {
            if (Test-Path $tempFile) { Remove-Item $tempFile -Force }
            if (Test-Path $stderrFile) { Remove-Item $stderrFile -Force }
            $syncRef.Completed++
        }
    } -ThrottleLimit $threadCount -AsJob

    # Monitor progress from main thread
    while ($job.State -eq 'Running') {
        $completed = $sync.Completed
        $pct = if ($totalFiles -gt 0) { [Math]::Min(100, [int](($completed / $totalFiles) * 100)) } else { 0 }
        Write-Progress -Activity "Decrypting vault" -Status "$completed/$totalFiles entries processed" -PercentComplete $pct
        Start-Sleep -Milliseconds 250
    }

    # Final progress update
    $job | Receive-Job -Wait -AutoRemoveJob | Out-Null
    Write-Progress -Activity "Decrypting vault" -Completed

    $EntriesOk = $sync.EntriesOk
    $EntriesFail = $sync.EntriesFail
    $MediaOk = $sync.MediaOk
    $MediaFail = $sync.MediaFail
    $failedFiles = @($sync.FailedFiles)
} else {
    Write-Host "[WARN] PowerShell $($PSVersionTable.PSVersion) detected. Parallel decryption requires PowerShell 7+." -ForegroundColor Yellow
    Write-Host "       Falling back to sequential processing. Install PS 7 for faster decryption." -ForegroundColor Yellow
    Write-Host ""

    $completed = 0
    foreach ($item in $workItems) {
        $completed++
        $pct = if ($totalFiles -gt 0) { [Math]::Min(100, [int](($completed / $totalFiles) * 100)) } else { 0 }
        Write-Progress -Activity "Decrypting vault" -Status "$completed/$totalFiles entries processed" -PercentComplete $pct

        $result = Invoke-DecryptItem -Item $item -AgePath $agePath -IdentityFilePath $IdentityFile

        if ($result.Success) {
            if ($result.Type -eq 'Entry') { $EntriesOk++ } else { $MediaOk++ }
        } else {
            if ($result.Type -eq 'Entry') { $EntriesFail++ } else { $MediaFail++ }
            $failedFiles += "[$($result.Type.ToUpper()) FAIL] $($result.RelPath) ($($result.Error))"
        }
    }

    Write-Progress -Activity "Decrypting vault" -Completed
}

# --- Summary ------------------------------------------------------------------

Write-Host ""
Write-Host "============================================"
Write-Host "Decryption complete!" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Entries:  $EntriesOk succeeded, $EntriesFail failed"
Write-Host "  Media:    $MediaOk succeeded, $MediaFail failed"
Write-Host ""
Write-Host "Decrypted files are in: $OutputDir"
Write-Host ""

if ($failedFiles.Count -gt 0) {
    Write-Host "Failed files:" -ForegroundColor Yellow
    foreach ($f in $failedFiles) {
        Write-Host "  $f" -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host "NOTE: These files may be corrupted or your identity key" -ForegroundColor Yellow
    Write-Host "may not match this vault." -ForegroundColor Yellow
    exit 1
}
