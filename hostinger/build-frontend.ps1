# Builds frontend (Next.js standalone), copies static assets, packs into hostinger/dist-frontend/
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$frontend = Join-Path $root "frontend"
$output = Join-Path $PSScriptRoot "dist-frontend"

Write-Host "Building frontend for Hostinger..." -ForegroundColor Cyan

Set-Location -LiteralPath $frontend

# Kill lingering node processes
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1

# Clean rebuild
if (Test-Path ".next") { Remove-Item -Recurse -Force ".next" -ErrorAction SilentlyContinue }

# Install deps
npm ci

# Build Next.js (outputs to .next/standalone)
npx next build

# Verify standalone output exists
if (-not (Test-Path ".next\standalone\server.js")) {
    Write-Host "ERROR: .next/standalone/server.js not found! Build may have failed." -ForegroundColor Red
    exit 1
}

# Create output package
if (Test-Path $output) { Remove-Item -Recurse -Force $output }
New-Item -ItemType Directory -Path $output -Force | Out-Null

# Copy standalone build
Copy-Item -Recurse "$frontend\.next\standalone\*" "$output\"

# Copy static assets (Next.js bug: standalone doesn't copy .next/static)
Copy-Item -Recurse "$frontend\.next\static" "$output\.next\static"

# Copy public assets
if (Test-Path "$frontend\public") {
    Copy-Item -Recurse "$frontend\public" "$output\public"
}

# Bundle startup script
Copy-Item "$PSScriptRoot\start-frontend.sh" "$output\start-frontend.sh"

Write-Host "Frontend build ready at: $output" -ForegroundColor Green
Write-Host "Entry point: server.js" -ForegroundColor Yellow
