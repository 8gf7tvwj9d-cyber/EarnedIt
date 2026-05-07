@echo off
setlocal

cd /d "%~dp0"

set "NPM_CMD=C:\Program Files\nodejs\npm.cmd"
set "APP_HOST=127.0.0.1"
set "APP_PORT=3017"
set "APP_URL=http://%APP_HOST%:%APP_PORT%"

if not exist "%NPM_CMD%" exit /b 1
if not exist "node_modules" exit /b 1
if not exist ".next\BUILD_ID" exit /b 1

powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $response = Invoke-WebRequest -UseBasicParsing '%APP_URL%' -TimeoutSec 2; if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 goto open_app

start "Earned Server" /min cmd /c "\"%NPM_CMD%\" run start -- --hostname %APP_HOST% --port %APP_PORT%"

set "WAIT_SCRIPT=%TEMP%\earned_wait_%RANDOM%%RANDOM%.ps1"
(
  echo $url = '%APP_URL%'
  echo $deadline = ^(Get-Date^).AddSeconds^(45^)
  echo do {
  echo   Start-Sleep -Milliseconds 750
  echo   try {
  echo     $response = Invoke-WebRequest -UseBasicParsing $url -TimeoutSec 2
  echo     if ^($response.StatusCode -ge 200 -and $response.StatusCode -lt 500^) {
  echo       Start-Process $url
  echo       exit 0
  echo     }
  echo   } catch {}
  echo } while ^((Get-Date^) -lt $deadline^)
  echo Start-Process $url
) > "%WAIT_SCRIPT%"

powershell -ExecutionPolicy Bypass -File "%WAIT_SCRIPT%"
del "%WAIT_SCRIPT%" >nul 2>nul
exit /b 0

:open_app
start "" "%APP_URL%"
exit /b 0
