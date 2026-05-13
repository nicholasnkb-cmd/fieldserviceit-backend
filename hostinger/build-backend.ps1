# Builds backend, freezes node_modules, generates Prisma client, and packs into hostinger/dist-backend/
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root "backend"
$output = Join-Path $PSScriptRoot "dist-backend"

Write-Host "Building backend for Hostinger..." -ForegroundColor Cyan

Set-Location -LiteralPath $backend

# Kill lingering node processes (EPERM guard)
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1

# Install deps
npm ci

# Generate Prisma client
npx prisma generate

# Build NestJS
npx nest build

# Verify entry exists
if (-not (Test-Path "dist/src/main.js")) {
    Write-Host "ERROR: dist/src/main.js not found! Build may have failed." -ForegroundColor Red
    exit 1
}

# Create output package
if (Test-Path $output) { Remove-Item -Recurse -Force $output }
New-Item -ItemType Directory -Path $output -Force | Out-Null

Copy-Item -Recurse "$backend\dist" "$output\dist"
Copy-Item -Recurse "$backend\node_modules" "$output\node_modules"
Copy-Item -Recurse "$backend\prisma" "$output\prisma"
Copy-Item "$backend\package.json" "$output\package.json"

# Bundle startup script (for manual upload mode)
Copy-Item "$PSScriptRoot\start-backend.sh" "$output\start-backend.sh"

Write-Host "Backend build ready at: $output" -ForegroundColor Green
Write-Host "Entry point: dist/src/main.js" -ForegroundColor Yellow
