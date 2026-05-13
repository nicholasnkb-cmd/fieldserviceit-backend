param(
  [string]$ComposeFile = "docker-compose.yml",
  [int]$TimeoutSeconds = 120
)

$ErrorActionPreference = "Stop"
$composeDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$composePath = Join-Path $composeDir $ComposeFile
$pass = 0; $fail = 0

function Check { param($name, $result)
  if ($result) { $script:pass++; Write-Host "  PASS: $name" -ForegroundColor Green }
  else { $script:fail++; Write-Host "  FAIL: $name" -ForegroundColor Red }
}

Write-Host "`n============================================" -ForegroundColor Cyan
Write-Host "  FIELDSERVICEIT DOCKER SMOKE TEST" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# ── Prerequisites ──
Write-Host "`n[0] PREREQUISITES" -ForegroundColor Yellow
try { docker info --format '{{.ServerVersion}}' *>$null; Check "Docker running" $true }
catch { Check "Docker running" $false; Write-Host "Docker is not running. Aborting." -ForegroundColor Red; exit 1 }

# ── Build ──
Write-Host "`n[1] BUILD" -ForegroundColor Yellow
$buildOutput = docker compose -f $composePath build --no-cache 2>&1
Check "docker compose build" ($LASTEXITCODE -eq 0)

# ── Start ──
Write-Host "`n[2] START SERVICES" -ForegroundColor Yellow
docker compose -f $composePath down -v 2>&1 | Out-Null
$upOutput = docker compose -f $composePath up -d 2>&1
Check "docker compose up" ($LASTEXITCODE -eq 0)

# ── Wait for healthy ──
Write-Host "`n[3] WAIT FOR HEALTHY ($TimeoutSeconds seconds)" -ForegroundColor Yellow
$elapsed = 0
$backendOk = $false
$mysqlOk = $false
while ($elapsed -lt $TimeoutSeconds) {
  $ps = docker compose -f $composePath ps --format json 2>$null | ConvertFrom-Json
  if ($ps) {
    if (-not $ps -is [array]) { $ps = @($ps) }
    foreach ($svc in $ps) {
      if ($svc.Name -like '*mysql*' -and $svc.Health -eq 'healthy') { $mysqlOk = $true }
      if ($svc.Name -like '*backend*' -and $svc.Health -eq 'healthy') { $backendOk = $true }
    }
  }
  if ($mysqlOk -and $backendOk) { break }
  Start-Sleep -Seconds 2
  $elapsed += 2
}
Check "MySQL healthy" $mysqlOk
Check "Backend healthy" $backendOk
Check "Frontend started" (docker compose -f $composePath ps --format json 2>$null | ConvertFrom-Json | Where-Object { $_.Name -like '*frontend*' -and $_.State -eq 'running' })

if (-not $backendOk) {
  Write-Host "`nBackend logs (last 30 lines):" -ForegroundColor Red
  docker compose -f $composePath logs backend --tail 30 2>&1
}

# ── Smoke Tests Against Docker ──
Write-Host "`n[4] API SMOKE TESTS" -ForegroundColor Yellow
$env:API_URL = "http://localhost:4000/v1"
$smokeScript = Join-Path (Split-Path $composeDir -Parent) "backend/test/smoke-test.ps1"
if (Test-Path $smokeScript) {
  & $smokeScript
} else {
  Check "Smoke test script found" $false
}

# ── Cleanup ──
Write-Host "`n[5] CLEANUP" -ForegroundColor Yellow
docker compose -f $composePath down -v 2>&1 | Out-Null
Check "Cleanup completed" $true

# ── Results ──
Write-Host "`n============================================" -ForegroundColor Cyan
Write-Host "  RESULTS:  PASS=$pass  FAIL=$fail  TOTAL=$($pass+$fail)" -ForegroundColor $(if ($fail -eq 0) {"Green"} else {"Red"})
Write-Host "============================================" -ForegroundColor Cyan
exit $fail
