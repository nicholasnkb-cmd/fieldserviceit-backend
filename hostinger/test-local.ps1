param([switch]$Kill)

if ($Kill) {
  Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
  if (Test-Path "backend\prisma\dev.db") { Remove-Item "backend\prisma\dev.db" -Force }
  if (Test-Path "backend\.env.prod.bak") { Move-Item "backend\.env.prod.bak" "backend\.env" -Force }
  Write-Host "Cleaned up" -ForegroundColor Green; exit
}

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

Write-Host "=== FieldserviceIT Local Test Suite ===" -ForegroundColor Cyan

# 1. Create SQLite schema
Write-Host "[1/6] Creating SQLite schema..." -ForegroundColor Yellow
$schema = Get-Content "$root\backend\prisma\schema.prisma" -Raw
$schema = $schema -replace 'provider = "mysql"', 'provider = "sqlite"'
Set-Content "$root\backend\prisma\schema.local.prisma" -Value $schema

# 2. Backup .env and switch to SQLite
Copy-Item "$root\backend\.env" "$root\backend\.env.prod.bak" -Force
(Get-Content "$root\backend\.env") -replace 'DATABASE_URL=.*', 'DATABASE_URL="file:./prisma/dev.db"' | Set-Content "$root\backend\.env"

# 3. Generate + push + seed
Write-Host "[2/6] Generating Prisma Client..." -ForegroundColor Yellow
Set-Location "$root\backend"; npx prisma generate --schema=prisma/schema.local.prisma 2>&1 | Out-Null

Write-Host "[3/6] Creating SQLite database..." -ForegroundColor Yellow
npx prisma db push --schema=prisma/schema.local.prisma --accept-data-loss 2>&1 | Out-Null

Write-Host "[4/6] Seeding data..." -ForegroundColor Yellow
npx ts-node prisma/seed.ts 2>&1

# 5. Start backend
Write-Host "[5/6] Starting backend (port 4000)..." -ForegroundColor Yellow
$bp = Start-Process -WindowStyle Hidden -FilePath "node" -ArgumentList "dist/src/main.js" -WorkingDirectory "$root\backend" -PassThru
Start-Sleep -Seconds 4

# 6. Start frontend
Write-Host "[6/6] Starting frontend (port 3000)..." -ForegroundColor Yellow
$fp = Start-Process -WindowStyle Hidden -FilePath "node" -ArgumentList "server.js" -WorkingDirectory "$root\frontend\.next\standalone" -PassThru
Start-Sleep -Seconds 3

# Run smoke tests
Write-Host "`n=== Running Smoke Tests ===" -ForegroundColor Cyan
$api = "http://localhost:4000/v1"; $pass=0; $fail=0

try {
  $r = Invoke-RestMethod "$api/auth/login" -Method Post -Body (@{email="admin@acme.com";password="admin123"} | ConvertTo-Json) -ContentType "application/json"
  $token = $r.accessToken; $pass++
  Write-Host "  PASS: Login" -ForegroundColor Green
} catch { $fail++; Write-Host "  FAIL: Login" -ForegroundColor Red }

try { $r = Invoke-RestMethod "$api/tickets" -Headers @{Authorization="Bearer $token"} -ErrorAction Stop; $pass++; Write-Host "  PASS: List tickets" -ForegroundColor Green }
catch { $fail++; Write-Host "  FAIL: List tickets" -ForegroundColor Red }

try { $r = Invoke-RestMethod "$api/users/me" -Headers @{Authorization="Bearer $token"} -ErrorAction Stop; $pass++; Write-Host "  PASS: Users/me ($($r.email))" -ForegroundColor Green }
catch { $fail++; Write-Host "  FAIL: Users/me" -ForegroundColor Red }

try { $r = Invoke-RestMethod "$api/search?q=ticket" -Headers @{Authorization="Bearer $token"} -ErrorAction Stop; $pass++; Write-Host "  PASS: Search" -ForegroundColor Green }
catch { $fail++; Write-Host "  FAIL: Search" -ForegroundColor Red }

try { $r = Invoke-RestMethod "$api/integrations/rmm/providers" -Headers @{Authorization="Bearer $token"} -ErrorAction Stop; $pass++; Write-Host "  PASS: RMM providers ($($r.providers -join ', '))" -ForegroundColor Green }
catch { $fail++; Write-Host "  FAIL: RMM providers" -ForegroundColor Red }

try { $r = Invoke-RestMethod "$api/reports/tickets" -Headers @{Authorization="Bearer $token"} -ErrorAction Stop; $pass++; Write-Host "  PASS: Reports" -ForegroundColor Green }
catch { $fail++; Write-Host "  FAIL: Reports" -ForegroundColor Red }

try { $r = Invoke-RestMethod "$api/settings" -Headers @{Authorization="Bearer $token"} -ErrorAction Stop; $pass++; Write-Host "  PASS: Settings" -ForegroundColor Green }
catch { $fail++; Write-Host "  FAIL: Settings" -ForegroundColor Red }

# Super admin tests
try {
  $sr = Invoke-RestMethod "$api/auth/login" -Method Post -Body (@{email="super@fieldserviceit.com";password="admin123"} | ConvertTo-Json) -ContentType "application/json"
  $stoken = $sr.accessToken
  $r = Invoke-RestMethod "$api/admin/stats" -Headers @{Authorization="Bearer $stoken"} -ErrorAction Stop
  $pass++; Write-Host "  PASS: Admin stats ($($r.totalUsers) users, $($r.totalCompanies) companies)" -ForegroundColor Green
} catch { $fail++; Write-Host "  FAIL: Admin stats" -ForegroundColor Red }

try { $r = Invoke-RestMethod "$api/admin/roles" -Headers @{Authorization="Bearer $stoken"} -ErrorAction Stop; $pass++; Write-Host "  PASS: Admin roles ($($r.Count) roles)" -ForegroundColor Green }
catch { $fail++; Write-Host "  FAIL: Admin roles" -ForegroundColor Red }

try { $r = Invoke-RestMethod "$api/admin/permissions" -Headers @{Authorization="Bearer $stoken"} -ErrorAction Stop; $pass++; Write-Host "  PASS: Admin permissions ($($r.Count) perms)" -ForegroundColor Green }
catch { $fail++; Write-Host "  FAIL: Admin permissions" -ForegroundColor Red }

# Health
try { $r = Invoke-RestMethod "$api/health"; $pass++; Write-Host "  PASS: Health" -ForegroundColor Green }
catch { $fail++; Write-Host "  FAIL: Health" -ForegroundColor Red }

# Frontend
try { $r = Invoke-WebRequest "http://localhost:3000/login" -UseBasicParsing -ErrorAction Stop; $pass++; Write-Host "  PASS: Frontend ($($r.StatusCode))" -ForegroundColor Green }
catch { $fail++; Write-Host "  FAIL: Frontend" -ForegroundColor Red }

Write-Host "`n=== RESULTS: PASS=$pass FAIL=$fail TOTAL=$($pass+$fail) ===" -ForegroundColor $(if ($fail -eq 0) {"Green"} else {"Red"})
Write-Host "Run '.\hostinger\test-local.ps1 -Kill' to stop servers and clean up" -ForegroundColor Cyan
