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
#   Open PowerShell, navigate to this directory, and run:
#   .\Decrypt-Vault.ps1
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

# --- Decrypt files ------------------------------------------------------------

$EntriesOk = 0
$EntriesFail = 0
$MediaOk = 0
$MediaFail = 0

# Find year directories (4-digit folders)
$yearDirs = Get-ChildItem -Path $VaultDir -Directory | Where-Object { $_.Name -match '^\d{4}$' }

foreach ($yearDir in $yearDirs) {
    # Process entry files: YYYY/*.age
    $entryFiles = Get-ChildItem -Path $yearDir.FullName -File -Filter "*.age" -ErrorAction SilentlyContinue
    foreach ($entryFile in $entryFiles) {
        $relPath = Get-RelativePath -BasePath $VaultDir -FullPath $entryFile.FullName
        $relPath = $relPath -replace '\\', '/'
        $outRel = $relPath -replace '\.age$', '.md'
        $outFile = Join-Path $OutputDir ($outRel -replace '/', '\')

        $outDir = Split-Path -Parent $outFile
        if (-not (Test-Path $outDir)) {
            New-Item -ItemType Directory -Path $outDir -Force | Out-Null
        }

        # Decrypt entry
        $tempFile = [System.IO.Path]::GetTempFileName()
        try {
            $proc = Start-Process -FilePath $agePath -ArgumentList "-d", "-i", "`"$IdentityFile`"", "-o", "`"$tempFile`"", "`"$($entryFile.FullName)`"" -NoNewWindow -Wait -PassThru -RedirectStandardError ([System.IO.Path]::GetTempFileName())
            if ($proc.ExitCode -eq 0) {
                # Parse JSON and extract plaintext
                try {
                    $jsonContent = Get-Content $tempFile -Raw -Encoding UTF8
                    $entry = $jsonContent | ConvertFrom-Json
                    $plaintext = $entry.plaintext
                    if ($null -eq $plaintext) { $plaintext = "" }
                    # Write with UTF8 no BOM
                    [System.IO.File]::WriteAllText($outFile, $plaintext, [System.Text.UTF8Encoding]::new($false))
                    Write-Host "  [ENTRY OK] $relPath -> $outRel" -ForegroundColor Green
                    $EntriesOk++
                } catch {
                    Write-Host "  [ENTRY FAIL] $relPath (JSON parse error)" -ForegroundColor Yellow
                    if (Test-Path $outFile) { Remove-Item $outFile -Force }
                    $EntriesFail++
                }
            } else {
                Write-Host "  [ENTRY FAIL] $relPath (decryption error)" -ForegroundColor Yellow
                $EntriesFail++
            }
        } finally {
            if (Test-Path $tempFile) { Remove-Item $tempFile -Force }
        }
    }

    # Process media files: YYYY/media/*.{png,webp,jpg,jpeg,avif}
    $mediaDir = Join-Path $yearDir.FullName "media"
    if (Test-Path $mediaDir) {
        $mediaFiles = Get-ChildItem -Path $mediaDir -File | Where-Object {
            $MediaExtensions -contains $_.Extension.ToLower()
        }

        foreach ($mediaFile in $mediaFiles) {
            $relPath = Get-RelativePath -BasePath $VaultDir -FullPath $mediaFile.FullName
            $relPath = $relPath -replace '\\', '/'
            $outFile = Join-Path $OutputDir ($relPath -replace '/', '\')

            $outDir = Split-Path -Parent $outFile
            if (-not (Test-Path $outDir)) {
                New-Item -ItemType Directory -Path $outDir -Force | Out-Null
            }

            # Decrypt media (binary output)
            try {
                $proc = Start-Process -FilePath $agePath -ArgumentList "-d", "-i", "`"$IdentityFile`"", "-o", "`"$outFile`"", "`"$($mediaFile.FullName)`"" -NoNewWindow -Wait -PassThru -RedirectStandardError ([System.IO.Path]::GetTempFileName())
                if ($proc.ExitCode -eq 0) {
                    Write-Host "  [MEDIA OK] $relPath" -ForegroundColor Green
                    $MediaOk++
                } else {
                    Write-Host "  [MEDIA FAIL] $relPath" -ForegroundColor Yellow
                    if (Test-Path $outFile) { Remove-Item $outFile -Force }
                    $MediaFail++
                }
            } catch {
                Write-Host "  [MEDIA FAIL] $relPath (error: $_)" -ForegroundColor Yellow
                if (Test-Path $outFile) { Remove-Item $outFile -Force }
                $MediaFail++
            }
        }
    }
}

Write-Host ""
Write-Host "============================================"
Write-Host "Decryption complete!" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Entries:  $EntriesOk succeeded, $EntriesFail failed"
Write-Host "  Media:    $MediaOk succeeded, $MediaFail failed"
Write-Host ""
Write-Host "Decrypted files are in: $OutputDir"
Write-Host ""

if ($EntriesFail -gt 0 -or $MediaFail -gt 0) {
    Write-Host "NOTE: Some files could not be decrypted. They may be corrupted" -ForegroundColor Yellow
    Write-Host "or your identity key may not match this vault." -ForegroundColor Yellow
    exit 1
}
