# install-windows.ps1 — keep Meridian local always available after login
$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Start = Join-Path $Root "start-meridian.ps1"
$Watch = Join-Path $Root "watch-meridian.ps1"
$Startup = [Environment]::GetFolderPath("Startup")
$Lnk = Join-Path $Startup "Meridian Agency.lnk"

# Startup shortcut (no admin needed)
$w = New-Object -ComObject WScript.Shell
$s = $w.CreateShortcut($Lnk)
$s.TargetPath = "powershell.exe"
$s.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Start`""
$s.WorkingDirectory = $Root
$s.WindowStyle = 7
$s.Description = "Start Meridian Agency local server on login"
$s.Save()
Write-Host "Startup: $Lnk"

# Scheduled tasks (current user)
$trStart = "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Start`""
$trWatch = "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Watch`""
schtasks /Delete /TN "MeridianAgency-Start" /F 2>$null
schtasks /Delete /TN "MeridianAgency-Watch" /F 2>$null
# At logon for current user
schtasks /Create /TN "MeridianAgency-Start" /TR $trStart /SC ONLOGON /RL LIMITED /F 2>&1
# Every 5 minutes keep-alive
schtasks /Create /TN "MeridianAgency-Watch" /TR $trWatch /SC MINUTE /MO 5 /RL LIMITED /F 2>&1

# Desktop launcher
$desk = [Environment]::GetFolderPath("Desktop")
$openBat = Join-Path $desk "OPEN-MERIDIAN.bat"
@"
@echo off
start "" "https://meridian-production-2eb0.up.railway.app/"
start "" "http://localhost:8891/"
powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "$Start"
"@ | Set-Content $openBat -Encoding ASCII

# Start now
powershell -NoProfile -ExecutionPolicy Bypass -File $Start
Write-Host "Install complete."
