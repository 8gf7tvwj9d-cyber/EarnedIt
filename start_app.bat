@echo off
setlocal

cd /d "%~dp0"
set "LAUNCHER_PS1=%~dp0launch_earned.ps1"
if not exist "%LAUNCHER_PS1%" exit /b 1

powershell -NoProfile -ExecutionPolicy Bypass -File "%LAUNCHER_PS1%"
exit /b %errorlevel%
