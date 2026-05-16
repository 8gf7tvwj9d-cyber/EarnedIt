$appRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$npmCmd = "C:\Program Files\nodejs\npm.cmd"
$hostName = "127.0.0.1"
$port = 3017
$appUrl = "http://${hostName}:${port}"
$buildIdPath = Join-Path $appRoot ".next\BUILD_ID"
$logPath = Join-Path $appRoot "launch_earned.log"
$didBuild = $false

function Write-LaunchLog {
  param(
    [string]$Message
  )

  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -Path $logPath -Value "[$timestamp] $Message" -Encoding UTF8
}

"" | Set-Content -Path $logPath -Encoding UTF8
Write-LaunchLog "Launcher start."

if (-not (Test-Path $npmCmd)) {
  Write-LaunchLog "npm.cmd not found at $npmCmd"
  exit 1
}

if (-not (Test-Path (Join-Path $appRoot "node_modules"))) {
  Write-LaunchLog "node_modules missing."
  exit 1
}

function Get-LatestSourceWriteTime {
  $watchPaths = @(
    (Join-Path $appRoot "src"),
    (Join-Path $appRoot "public"),
    (Join-Path $appRoot "package.json"),
    (Join-Path $appRoot "package-lock.json"),
    (Join-Path $appRoot "next.config.ts"),
    (Join-Path $appRoot "next.config.js")
  )

  $latest = Get-Item $buildIdPath

  foreach ($path in $watchPaths) {
    if (-not (Test-Path $path)) {
      continue
    }

    $items =
      if ((Get-Item $path) -is [System.IO.DirectoryInfo]) {
        Get-ChildItem -Path $path -Recurse -File -ErrorAction SilentlyContinue
      } else {
        Get-Item $path -ErrorAction SilentlyContinue
      }

    foreach ($item in $items) {
      if ($item.LastWriteTime -gt $latest.LastWriteTime) {
        $latest = $item
      }
    }
  }

  return $latest.LastWriteTime
}

function Test-BuildIsFresh {
  if (-not (Test-Path $buildIdPath)) {
    return $false
  }

  $buildTime = (Get-Item $buildIdPath).LastWriteTime
  $sourceTime = Get-LatestSourceWriteTime
  return $buildTime -ge $sourceTime
}

function Test-AppReady {
  try {
    $response = Invoke-WebRequest -UseBasicParsing $appUrl -TimeoutSec 2
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Test-ServedBuildIsCurrent {
  if (-not (Test-Path $buildIdPath)) {
    Write-LaunchLog "Cannot compare served build: BUILD_ID is missing."
    return $false
  }

  $buildId = (Get-Content -Path $buildIdPath -Raw).Trim()
  if ([string]::IsNullOrWhiteSpace($buildId)) {
    Write-LaunchLog "Cannot compare served build: BUILD_ID is empty."
    return $false
  }

  try {
    $cacheBust = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $response = Invoke-WebRequest -UseBasicParsing "${appUrl}/?build-check=${buildId}-${cacheBust}" -TimeoutSec 3
    $isCurrent = $response.Content.Contains($buildId)
    if (-not $isCurrent) {
      Write-LaunchLog "Existing app server is stale. Served HTML does not include current build ${buildId}."
    }
    return $isCurrent
  } catch {
    Write-LaunchLog "Could not verify served build: $($_.Exception.Message)"
    return $false
  }
}

function Get-LaunchUrl {
  if (-not (Test-Path $buildIdPath)) {
    return $appUrl
  }

  $buildId = (Get-Content -Path $buildIdPath -Raw).Trim()
  if ([string]::IsNullOrWhiteSpace($buildId)) {
    return $appUrl
  }

  return "${appUrl}/?build=${buildId}"
}

function Stop-StaleAppServer {
  try {
    $listeners = Get-NetTCPConnection -LocalAddress $hostName -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($listener in $listeners) {
      if ($listener.OwningProcess -and $listener.OwningProcess -ne $PID) {
        Write-LaunchLog "Stopping existing listener on port ${port}: PID $($listener.OwningProcess)"
        Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
      }
    }
  } catch {
    Write-LaunchLog "Failed while stopping stale app server: $($_.Exception.Message)"
  }
}

if (-not (Test-BuildIsFresh)) {
  $didBuild = $true
  Write-LaunchLog "Build is stale. Running npm run build."
  Push-Location $appRoot
  try {
    & $npmCmd run build
    if ($LASTEXITCODE -ne 0) {
      Write-LaunchLog "Build failed with exit code $LASTEXITCODE"
      exit $LASTEXITCODE
    }
    Write-LaunchLog "Build completed successfully."
  } finally {
    Pop-Location
  }
} else {
  Write-LaunchLog "Build is already fresh."
}

if ($didBuild) {
  Write-LaunchLog "Build occurred. Forcing server restart on port $port."
  Stop-StaleAppServer
} elseif (Test-AppReady) {
  if (-not (Test-ServedBuildIsCurrent)) {
    Write-LaunchLog "Forcing server restart on port $port so it serves the current build."
    Stop-StaleAppServer
  }
}

if ($didBuild -or -not (Test-AppReady)) {
  Write-LaunchLog "Starting Next production server on port $port."
  Start-Process -FilePath $npmCmd -WorkingDirectory $appRoot -ArgumentList @(
    "run",
    "start",
    "--",
    "--hostname",
    $hostName,
    "--port",
    "$port"
  ) -WindowStyle Minimized
} else {
  Write-LaunchLog "Existing app server is already responding. Reusing it."
}

$deadline = (Get-Date).AddSeconds(45)
do {
  Start-Sleep -Milliseconds 750
  if (Test-AppReady) {
    $launchUrl = Get-LaunchUrl
    Write-LaunchLog "App ready. Opening $launchUrl"
    Start-Process (Get-LaunchUrl)
    exit 0
  }
} while ((Get-Date) -lt $deadline)

Write-LaunchLog "App did not become ready before timeout. Not opening browser."
exit 1
