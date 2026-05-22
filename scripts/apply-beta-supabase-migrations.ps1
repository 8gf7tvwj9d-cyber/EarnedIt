$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ProjectRef = $env:SUPABASE_PROJECT_REF

if (-not $ProjectRef) {
  $envPath = Join-Path $ProjectRoot ".env.local"
  if (Test-Path $envPath) {
    $supabaseUrlLine = Get-Content $envPath | Where-Object { $_ -match "^NEXT_PUBLIC_SUPABASE_URL=" } | Select-Object -First 1
    $supabaseUrl = $supabaseUrlLine -replace "^NEXT_PUBLIC_SUPABASE_URL=", ""
    if ($supabaseUrl) {
      $ProjectRef = ([System.Uri]$supabaseUrl).Host.Split(".")[0]
    }
  }
}

if (-not $ProjectRef) {
  throw "Could not determine Supabase project ref. Set SUPABASE_PROJECT_REF or NEXT_PUBLIC_SUPABASE_URL."
}

if (-not $env:SUPABASE_ACCESS_TOKEN) {
  $env:SUPABASE_ACCESS_TOKEN = [Environment]::GetEnvironmentVariable("SUPABASE_ACCESS_TOKEN", "User")
}

if (-not $env:SUPABASE_ACCESS_TOKEN) {
  $env:SUPABASE_ACCESS_TOKEN = [Environment]::GetEnvironmentVariable("SUPABASE_ACCESS_TOKEN", "Machine")
}

if (-not $env:SUPABASE_ACCESS_TOKEN) {
  throw "SUPABASE_ACCESS_TOKEN is missing. Create one at https://supabase.com/dashboard/account/tokens and set it before running this script."
}

$MigrationFiles = @(
  "20260519_beta_multi_household_foundation.sql",
  "20260520_beta_child_login_code.sql",
  "20260520_beta_child_profile_details.sql",
  "20260520_beta_chore_sync_bridge.sql"
)

Push-Location $ProjectRoot
try {
  Write-Host "Linking Supabase project $ProjectRef..."
  npx supabase link --project-ref $ProjectRef

  foreach ($migration in $MigrationFiles) {
    $migrationPath = Join-Path $ProjectRoot "supabase\migrations\$migration"
    if (-not (Test-Path $migrationPath)) {
      throw "Missing migration file: $migrationPath"
    }

    Write-Host "Applying $migration..."
    npx supabase db query --linked --file $migrationPath
  }

  Write-Host "Verifying required beta objects..."
  npx supabase db query --linked --file (Join-Path $ProjectRoot "scripts\verify-beta-supabase-objects.sql")
} finally {
  Pop-Location
}
