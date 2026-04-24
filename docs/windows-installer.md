# Windows local installer (PowerShell)

DiabeticSpace runs locally on your machine and stores data in a user-local folder. No cloud login is required. AI features are optional.

## Requirements

- Windows 10/11
- Node.js LTS (recommended)

## Install (creates a Desktop shortcut)

From the repo root in PowerShell:

```powershell
.\scripts\windows\install.ps1
```

This creates a Desktop shortcut named `DiabeticSpace` that:

- uses a user-local data folder at `%LOCALAPPDATA%\DiabeticSpace`
- starts the server at `http://localhost:3000`
- opens the app at `/diabeticspace.html`

## Start the app (without installing)

```powershell
.\scripts\windows\start-diabeticspace.ps1
```

## Uninstall

Remove the Desktop shortcut:

```powershell
.\scripts\windows\uninstall.ps1
```

Remove the shortcut **and** delete local data:

```powershell
.\scripts\windows\uninstall.ps1 -RemoveData
```

## Local data location

- Database: `%LOCALAPPDATA%\DiabeticSpace\strandspace.sqlite`
- Recipe images: `%LOCALAPPDATA%\DiabeticSpace\diabetic-images\`

