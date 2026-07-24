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

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Decrypt-Vault.ps1"
pause
