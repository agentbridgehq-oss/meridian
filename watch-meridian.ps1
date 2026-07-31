# Keep local Meridian up — restart if health fails.
# Scheduled every 5 minutes at logon session.
# STOP: if .watchdog-DISABLED exists (user asked to kill PS popups), exit silently.

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
if (Test-Path (Join-Path $Root '.watchdog-DISABLED')) { exit 0 }

$Start = Join-Path $Root 'start-meridian.ps1'
$Health = 'http://127.0.0.1:8891/health'

try {
  $r = Invoke-RestMethod -Uri $Health -TimeoutSec 3
  if ($r.status -eq 'online' -or $r.product -eq 'meridian') { exit 0 }
} catch {
  # down — start
}

# Use same process / hidden only — never open a visible console
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = 'powershell.exe'
$psi.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Start`""
$psi.CreateNoWindow = $true
$psi.UseShellExecute = $false
$psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
[void][System.Diagnostics.Process]::Start($psi)
exit 0
