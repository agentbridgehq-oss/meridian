# Keep local Meridian up — restart if health fails.
# Scheduled every 5 minutes at logon session.

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Start = Join-Path $Root 'start-meridian.ps1'
$Health = 'http://127.0.0.1:8891/health'

try {
  $r = Invoke-RestMethod -Uri $Health -TimeoutSec 3
  if ($r.status -eq 'online' -or $r.product -eq 'meridian') { exit 0 }
} catch {
  # down — start
}

powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Start
exit $LASTEXITCODE
