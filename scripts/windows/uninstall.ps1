param(
  [string]$Name = "DiabeticSpace",
  [switch]$RemoveData
)

$ErrorActionPreference = "Stop"

$Desktop = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $Desktop "$Name.lnk"

if (Test-Path $ShortcutPath) {
  Remove-Item -Force -LiteralPath $ShortcutPath
  Write-Host "Removed shortcut:" -ForegroundColor Green
  Write-Host "  $ShortcutPath"
} else {
  Write-Host "Shortcut not found:" -ForegroundColor Yellow
  Write-Host "  $ShortcutPath"
}

if ($RemoveData) {
  $AppDataRoot = Join-Path $env:LOCALAPPDATA "DiabeticSpace"
  if (Test-Path $AppDataRoot) {
    Remove-Item -Recurse -Force -LiteralPath $AppDataRoot
    Write-Host "Removed local data folder:" -ForegroundColor Green
    Write-Host "  $AppDataRoot"
  } else {
    Write-Host "Local data folder not found:" -ForegroundColor Yellow
    Write-Host "  $AppDataRoot"
  }
} else {
  Write-Host "Local data preserved. Use -RemoveData to delete it." -ForegroundColor Cyan
}

