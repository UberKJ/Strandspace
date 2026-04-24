param(
  [int]$Port = 3000
)

$ErrorActionPreference = "Stop"

function Wait-ForHttp {
  param(
    [string]$Url,
    [int]$TimeoutSeconds = 20
  )
  $start = Get-Date
  while (((Get-Date) - $start).TotalSeconds -lt $TimeoutSeconds) {
    try {
      $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
      if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500) {
        return $true
      }
    } catch {
      Start-Sleep -Milliseconds 400
    }
  }
  return $false
}

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\\..")
$AppDataRoot = Join-Path $env:LOCALAPPDATA "DiabeticSpace"
$ImageDir = Join-Path $AppDataRoot "diabetic-images"

New-Item -ItemType Directory -Force -Path $AppDataRoot | Out-Null
New-Item -ItemType Directory -Force -Path $ImageDir | Out-Null

$env:STRANDSPACE_DB_PATH = Join-Path $AppDataRoot "strandspace.sqlite"
$env:DIABETICSPACE_IMAGE_DIR = $ImageDir
$env:PORT = "$Port"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js is required. Install Node.js LTS first: https://nodejs.org/"
}

Set-Location $RepoRoot

if (-not (Test-Path (Join-Path $RepoRoot "node_modules"))) {
  Write-Host "Installing dependencies (first run)..." -ForegroundColor Cyan
  npm install
}

Write-Host "Starting DiabeticSpace on http://localhost:$Port ..." -ForegroundColor Green
$server = Start-Process -FilePath "node" -ArgumentList "server.mjs" -WorkingDirectory $RepoRoot -PassThru

$ready = Wait-ForHttp -Url "http://127.0.0.1:$Port/" -TimeoutSeconds 25
if ($ready) {
  Start-Process "http://localhost:$Port/diabeticspace.html"
} else {
  Write-Host "Server did not respond in time. Check the server window/logs." -ForegroundColor Yellow
  Start-Process "http://localhost:$Port/"
}

Write-Host ""
Write-Host "Local data folder: $AppDataRoot" -ForegroundColor DarkGray
Write-Host "Close this window to stop the server." -ForegroundColor DarkGray
Write-Host ""

try {
  Wait-Process -Id $server.Id
} catch {
  # ignore
}

