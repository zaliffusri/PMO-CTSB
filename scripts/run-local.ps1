# Run PMO-CTSB locally (API + Vite) on Windows.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/run-local.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Resolve-NodeDir {
  if (Get-Command node -ErrorAction SilentlyContinue) { return $null }
  $portable = Join-Path $Root ".tools\node"
  if (Test-Path (Join-Path $portable "node.exe")) { return $portable }
  $programFiles = "${env:ProgramFiles}\nodejs"
  if (Test-Path (Join-Path $programFiles "node.exe")) { return $programFiles }
  return $null
}

$nodeDir = Resolve-NodeDir
if ($nodeDir) {
  $env:Path = "$nodeDir;$env:Path"
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host ""
  Write-Host "Node.js not found." -ForegroundColor Red
  Write-Host "Install from https://nodejs.org (LTS), then run this script again."
  Write-Host "Or place a portable Node build in: $Root\.tools\node"
  Write-Host ""
  exit 1
}

if (-not (Test-Path (Join-Path $Root "node_modules"))) {
  Write-Host "Installing dependencies..."
  npm install
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host ""
Write-Host "Starting PMO-CTSB local dev..." -ForegroundColor Cyan
Write-Host "  App:  http://localhost:5173"
Write-Host "  API:  http://localhost:3001"
Write-Host "  Login: admin@pmo.local / admin123"
Write-Host ""
Write-Host "Press Ctrl+C to stop."
Write-Host ""

npm run dev
