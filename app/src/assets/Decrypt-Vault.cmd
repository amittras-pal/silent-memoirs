@echo off
REM =============================================================================
REM Silent Memoirs — Vault Decryption Launcher (Windows)
REM =============================================================================
REM This wrapper launches the PowerShell decryption script with the execution
REM policy bypassed for this process only. This avoids the "not digitally signed"
REM error without modifying your system-wide settings.
REM
REM Usage: Double-click this file, or run in a terminal:
REM   .\Decrypt-Vault.cmd
REM =============================================================================

REM Prefer PowerShell 7+ (pwsh.exe) if available, fall back to PowerShell 5.1
where pwsh >nul 2>nul
if %ERRORLEVEL% equ 0 (
    pwsh.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Decrypt-Vault.ps1"
) else (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Decrypt-Vault.ps1"
)
pause
