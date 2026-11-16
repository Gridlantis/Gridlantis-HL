# Open HL live folders - set up this Windows PC.
#
# Run it in PowerShell as yourself (no admin needed):
#   irm http://<openhl>:3000/live/setup.ps1 | iex
# To remove it:
#   $env:OPENHL_LIVE_UNINSTALL=1; irm http://<openhl>:3000/live/setup.ps1 | iex
#
# It installs a private Syncthing (the same version Open HL runs, downloaded
# from Open HL), started at sign-in with no window, pointed at Open HL only: no
# discovery, relays or internet, just Open HL's tailnet address. Folders Open HL
# shares with this PC appear in "$HOME\Open HL Live\<name>". Then it prints a
# pairing code to paste into Open HL -> Live folders -> Add a PC.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$OpenHLUrl = '__OPENHL_URL__'
$OpenHLId  = '__OPENHL_ID__'
$OpenHLIp  = '__OPENHL_IP__'
$SyncPort = __SYNC_PORT__
$Gui      = '127.0.0.1:8386'

$App     = Join-Path $env:LOCALAPPDATA 'OpenHLLive'
$StHome  = Join-Path $App 'home'
$Exe     = Join-Path $App 'syncthing.exe'
$Folders = if ($env:OPENHL_LIVE_FOLDER) { $env:OPENHL_LIVE_FOLDER } else { Join-Path $HOME 'Open HL Live' }
$Name    = if ($env:OPENHL_LIVE_NAME) { $env:OPENHL_LIVE_NAME } else { $env:COMPUTERNAME }
$Startup = Join-Path ([Environment]::GetFolderPath('Startup')) 'Open HL Live.lnk'
$StartupReport = Join-Path ([Environment]::GetFolderPath('Startup')) 'Open HL Live report.lnk'
$Report  = Join-Path $App 'report.ps1'

function Say($m)  { Write-Host ''; Write-Host $m -ForegroundColor White }
function Warn($m) { Write-Host "! $m" -ForegroundColor Yellow }
function Die($m)  { Write-Host "x $m" -ForegroundColor Red; throw $m }

function Stop-Live {
  Get-Process syncthing -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $Exe } | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 500
}
function Stop-Report {
  Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*$Report*" } |
    ForEach-Object { Invoke-CimMethod -InputObject $_ -MethodName Terminate -ErrorAction SilentlyContinue | Out-Null }
}

if ($env:OPENHL_LIVE_UNINSTALL) {
  Say 'Removing Open HL live folders'
  Stop-Live
  Stop-Report
  Remove-Item $Startup, $StartupReport -Force -ErrorAction SilentlyContinue
  Remove-Item $App -Recurse -Force -ErrorAction SilentlyContinue
  Write-Host "Done. Your files in $Folders are left as they are. Remove this PC in Open HL too."
  return
}

# -- Checks -------------------------------------------------------------------
Say '1/4  Checking this PC'
if ($OpenHLId.StartsWith('__')) { Die 'this script must be downloaded from Open HL (.../live/setup.ps1)' }
$ts = Get-Command tailscale -ErrorAction SilentlyContinue
$tsExe = if ($ts) { $ts.Source } else { Join-Path $env:ProgramFiles 'Tailscale\tailscale.exe' }
if (-not (Test-Path $tsExe)) { Die 'Tailscale is not installed - https://tailscale.com/download/windows' }
$TsIp = (& $tsExe ip -4 2>$null | Select-Object -First 1)
if (-not $TsIp) { Die 'Tailscale is not connected - open Tailscale and sign in first' }
$TsIp = $TsIp.Trim()
if (-not [Environment]::Is64BitOperatingSystem) { Die 'this needs 64-bit Windows' }
$Name = ($Name -replace '[^A-Za-z0-9 ._-]', '')
if ($Name.Length -gt 60) { $Name = $Name.Substring(0, 60) }
Write-Host "   this PC:  $Name at $TsIp"
Write-Host "   Open HL:    $OpenHLIp"
Write-Host "   folders:  $Folders"

# -- Install ------------------------------------------------------------------
Say '2/4  Installing Syncthing (from Open HL)'
New-Item -ItemType Directory -Force -Path $App, $StHome, $Folders | Out-Null
$tmp = Join-Path $env:TEMP ('openhl-live-' + [guid]::NewGuid())
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
try {
  try { Invoke-WebRequest -UseBasicParsing "$OpenHLUrl/live/dl/windows-amd64" -OutFile "$tmp\st.zip" }
  catch { Die "could not download Syncthing from Open HL ($OpenHLUrl)" }
  Expand-Archive "$tmp\st.zip" -DestinationPath $tmp -Force
  $new = Get-ChildItem $tmp -Recurse -Filter syncthing.exe | Select-Object -First 1
  if (-not $new) { Die 'the Syncthing download from Open HL is not what was expected' }
  Stop-Live
  Copy-Item $new.FullName $Exe -Force
} finally { Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue }
Write-Host ('   ' + (& $Exe --version))

if (-not (Test-Path (Join-Path $StHome 'config.xml'))) { & $Exe generate --home $StHome --no-port-probing | Out-Null }
$KeyFile = Join-Path $StHome 'openhl-apikey'
if (-not (Test-Path $KeyFile)) { -join ((1..48) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) }) | Set-Content -NoNewline $KeyFile }
$Key = (Get-Content $KeyFile -Raw).Trim()

# -- Service ------------------------------------------------------------------
# A Startup-folder shortcut starts it at sign-in without admin rights. Without
# --no-restart, Syncthing watches itself and restarts after a crash.
Say '3/4  Starting it (and at every sign-in)'
$args_ = "serve --home `"$StHome`" --no-browser --no-upgrade --no-console --gui-address=$Gui --gui-apikey=$Key"
$sh = New-Object -ComObject WScript.Shell
$lnk = $sh.CreateShortcut($Startup)
$lnk.TargetPath = $Exe
$lnk.Arguments = $args_
$lnk.WorkingDirectory = $App
$lnk.WindowStyle = 7
$lnk.Description = 'Open HL live folders (Syncthing, synced with Open HL)'
$lnk.Save()
Stop-Live
Start-Process -FilePath $Exe -ArgumentList $args_ -WindowStyle Hidden

$H = @{ 'X-API-Key' = $Key }
function Api($method, $path, $body) {
  $p = @{ Method = $method; Uri = "http://$Gui$path"; Headers = $H; UseBasicParsing = $true }
  if ($null -ne $body) { $p.Body = ($body | ConvertTo-Json -Depth 6 -Compress); $p.ContentType = 'application/json' }
  Invoke-RestMethod @p
}
$up = $false
for ($i = 0; $i -lt 60; $i++) { try { Api GET '/rest/system/ping' $null | Out-Null; $up = $true; break } catch { Start-Sleep -Milliseconds 500 } }
if (-not $up) { Die 'Syncthing did not start' }

# Windows asks for admin before a program may listen on the network, so this PC
# only listens on itself and dials Open HL instead (every 10 seconds when apart).
Api PATCH '/rest/config/options' @{ listenAddresses = @("tcp://127.0.0.1:$SyncPort"); globalAnnounceEnabled = $false; localAnnounceEnabled = $false
  relaysEnabled = $false; natEnabled = $false; urAccepted = -1; crashReportingEnabled = $false; autoUpgradeIntervalH = 0
  startBrowser = $false; reconnectionIntervalS = 10 } | Out-Null
Api PATCH '/rest/config/defaults/folder' @{ path = $Folders; fsWatcherDelayS = 1 } | Out-Null
$MyId = (Api GET '/rest/system/status' $null).myID
try { Api PATCH "/rest/config/devices/$MyId" @{ name = $Name } | Out-Null } catch {}
Api PUT "/rest/config/devices/$OpenHLId" @{ deviceID = $OpenHLId; name = 'Open HL'; addresses = @("tcp://${OpenHLIp}:$SyncPort"); autoAcceptFolders = $true; compression = 'metadata' } | Out-Null
Write-Host "   running; it talks to Open HL only (${OpenHLIp}:$SyncPort)"

# Syncthing never tells Open HL when a folder here is in trouble (say the folder
# was replaced and lost its .stfolder marker), so a small reporter posts this
# PC's own view of each folder to Open HL every 10 seconds for the Live folders
# page: state, errors, what it still has to download and to upload.
@{ gui = $Gui; key = $Key; openhlUrl = $OpenHLUrl; openhlId = $OpenHLId; myId = $MyId } | ConvertTo-Json -Compress |
  Set-Content -Path (Join-Path $StHome 'report.json')
@'
# Open HL live folders: tell Open HL how this PC's copy of each folder is doing.
$ErrorActionPreference = 'SilentlyContinue'
$cfg = Get-Content (Join-Path $PSScriptRoot 'home\report.json') -Raw | ConvertFrom-Json
$H = @{ 'X-API-Key' = $cfg.key }
function Api($p) { Invoke-RestMethod -UseBasicParsing -TimeoutSec 5 -Headers $H -Uri ("http://" + $cfg.gui + $p) -ErrorAction Stop }
while ($true) {
  $body = @{ v = 1; id = $cfg.myId; running = $false; folders = @{} }
  try {
    $fs = Api '/rest/config/folders'
    $body.running = $true
    foreach ($f in $fs) {
      $e = [uri]::EscapeDataString($f.id); $o = @{}
      try { $o.status = Api "/rest/db/status?folder=$e" } catch {}
      try { $o.errors = Api "/rest/folder/errors?folder=$e&perpage=5" } catch {}
      try { $o.openhl  = Api "/rest/db/completion?folder=$e&device=$($cfg.openhlId)" } catch {}
      $body.folders[$f.id] = $o
    }
  } catch {}
  try {
    Invoke-RestMethod -UseBasicParsing -TimeoutSec 10 -Method Post -Uri ($cfg.openhlUrl + '/live/report') `
      -ContentType 'application/json' -Body ($body | ConvertTo-Json -Depth 8 -Compress) | Out-Null
  } catch {}
  Start-Sleep -Seconds 10
}
'@ | Set-Content -Path $Report
$rargs = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Report`""
$rl = $sh.CreateShortcut($StartupReport)
$rl.TargetPath = 'powershell.exe'
$rl.Arguments = $rargs
$rl.WorkingDirectory = $App
$rl.WindowStyle = 7
$rl.Description = 'Open HL live folders: report this PC''s sync status to Open HL'
$rl.Save()
Stop-Report
Start-Process -FilePath 'powershell.exe' -ArgumentList $rargs -WindowStyle Hidden
Write-Host '   reporting its sync status to Open HL'

# -- Pairing code -------------------------------------------------------------
Say '4/4  Pairing code - paste it into Open HL -> Live folders -> Add a PC'
$json = (@{ v = 1; name = $Name; id = $MyId; host = $TsIp; os = 'windows' } | ConvertTo-Json -Compress)
$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json)).TrimEnd('=').Replace('+', '-').Replace('/', '_')
$Code = "openhl-live:$b64"
Write-Host ''; Write-Host "  $Code"; Write-Host ''
Set-Content -Path (Join-Path $StHome 'pairing.txt') -Value $Code
try { Set-Clipboard -Value $Code; Write-Host '(It is on your clipboard too.)' } catch {}
Write-Host "Then pick which live folders this PC gets. They appear in $Folders."
Write-Host 'Running this again is safe: it keeps this PC''s identity.'
