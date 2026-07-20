# Meridian Agency — start local server if not already up
$ErrorActionPreference = 'Continue'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogDir = Join-Path $Root 'logs'
$LogFile = Join-Path $LogDir 'meridian-local.log'
$Port = 8891
$Health = "http://127.0.0.1:$Port/health"

if (-not (Test-Path $LogDir)) {
  New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

function Write-Log([string]$msg) {
  Add-Content -Path $LogFile -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $msg" -Encoding utf8
}

function Test-MeridianUp {
  try {
    $r = Invoke-RestMethod -Uri $Health -TimeoutSec 2
    return ($r.status -eq 'online' -or $r.product -eq 'meridian')
  } catch {
    return $false
  }
}

if (Test-MeridianUp) {
  Write-Log "Already online on :$Port"
  exit 0
}

$env:PORT = "$Port"
if (-not $env:PUBLIC_BASE_URL) { $env:PUBLIC_BASE_URL = "http://localhost:$Port" }
if (-not $env:DATA_DIR) { $env:DATA_DIR = Join-Path $Root 'data' }
if (-not $env:MERIDIAN_OPENCLAW_AUTO) { $env:MERIDIAN_OPENCLAW_AUTO = '0' }

$envFile = Join-Path $Root '.env'
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
    if ($_ -match '^\s*([^=]+)=(.*)$') {
      Set-Item -Path ("Env:" + $Matches[1].Trim()) -Value ($Matches[2].Trim().Trim('"').Trim("'"))
    }
  }
}

if (-not (Test-Path (Join-Path $Root 'node_modules'))) {
  Write-Log 'Running npm install…'
  Push-Location $Root
  npm install --omit=dev *>> $LogFile
  Pop-Location
}

$out = Join-Path $LogDir 'stdout.log'
$err = Join-Path $LogDir 'stderr.log'
Write-Log "Starting node server.mjs on :$Port"
$proc = Start-Process -FilePath 'node' -ArgumentList 'server.mjs' -WorkingDirectory $Root `
  -WindowStyle Hidden -PassThru `
  -RedirectStandardOutput $out -RedirectStandardError $err

if (-not $proc) {
  Write-Log 'Failed to start node'
  exit 1
}

for ($i = 0; $i -lt 25; $i++) {
  Start-Sleep -Milliseconds 400
  if (Test-MeridianUp) {
    Write-Log "Online PID=$($proc.Id)  http://localhost:$Port"
    exit 0
  }
}

Write-Log "Process PID=$($proc.Id) started; health still warming - see $LogDir"
exit 0
