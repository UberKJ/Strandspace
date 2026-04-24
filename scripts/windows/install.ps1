param(
  [string]$Name = "DiabeticSpace",
  [int]$Port = 3000
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\\..")
$StartScript = Join-Path $RepoRoot "scripts\\windows\\start-diabeticspace.ps1"

if (-not (Test-Path $StartScript)) {
  throw "Missing start script: $StartScript"
}

$Desktop = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $Desktop "$Name.lnk"

$WScriptShell = New-Object -ComObject WScript.Shell
$Shortcut = $WScriptShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = "$env:WINDIR\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"
$Shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$StartScript`" -Port $Port"
$Shortcut.WorkingDirectory = "$RepoRoot"
$Shortcut.WindowStyle = 1
$Shortcut.Description = "Start $Name (local-first)"
$Shortcut.Save()

Write-Host "Created desktop shortcut:" -ForegroundColor Green
Write-Host "  $ShortcutPath"
Write-Host ""
Write-Host "Local data folder will be created under:" -ForegroundColor Cyan
Write-Host "  $env:LOCALAPPDATA\\DiabeticSpace"
Write-Host ""
Write-Host "Double-click the shortcut to start the server and open the app." -ForegroundColor Green

