# One-click build of backend + frontend for Hostinger deployment
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  FieldserviceIT - Hostinger Full Build" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# Step 1: Build backend
Write-Host "`n>>> Building Backend..." -ForegroundColor Yellow
& "$PSScriptRoot\build-backend.ps1"
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) {
    Write-Host "Backend build FAILED" -ForegroundColor Red
    exit 1
}

# Step 2: Build frontend
Write-Host "`n>>> Building Frontend..." -ForegroundColor Yellow
& "$PSScriptRoot\build-frontend.ps1"
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) {
    Write-Host "Frontend build FAILED" -ForegroundColor Red
    exit 1
}

Write-Host "`n============================================" -ForegroundColor Cyan
Write-Host "  Build Complete!" -ForegroundColor Green
Write-Host "  Backend:  $PSScriptRoot\dist-backend\" -ForegroundColor Green
Write-Host "  Frontend: $PSScriptRoot\dist-frontend\" -ForegroundColor Green
Write-Host "  Upload these directories via hPanel file manager or FTP." -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
