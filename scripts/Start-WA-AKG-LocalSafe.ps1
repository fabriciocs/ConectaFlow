#requires -Version 5.1
[CmdletBinding()]
param([int]$Port = 43000, [int]$TimeoutSeconds = 90, [string]$PublicBaseUrl = '')
$ErrorActionPreference = 'Stop'
$repo = 'C:\repos\WA-AKG'
if ($Port -lt 1024 -or $Port -gt 65535) { throw 'Port must be 1024..65535' }
$publicUri = $null
if ($PublicBaseUrl) {
  $publicUri = [Uri]$PublicBaseUrl
  if (-not $publicUri.IsAbsoluteUri -or $publicUri.Scheme -ne 'https' -or
      $publicUri.UserInfo -or $publicUri.Query -or $publicUri.Fragment -or
      $publicUri.IsLoopback -or $publicUri.AbsolutePath -notin @('/', '/wa-akg', '/wa-akg/')) {
    throw 'PublicBaseUrl must be a public HTTPS origin, optionally followed by /wa-akg'
  }
}
if (-not (Test-Path (Join-Path $repo '.next\BUILD_ID'))) { throw 'Missing production build; run local gates first' }
if (-not (Test-Path (Join-Path $repo 'node_modules\tsx\dist\cli.mjs'))) { throw 'tsx is not installed' }
$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) { throw ('PORT_BUSY_PID_' + $listener.OwningProcess) }
$run = 'wa-akg-local-safe-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
$root = Join-Path $repo ('.remote-desktop\sessions\' + $run)
New-Item -ItemType Directory -Path $root -Force | Out-Null
$origin = 'http://127.0.0.1:' + $Port
$env:WA_AKG_SAFE_LOCAL_MODE = 'true'
$env:DISABLE_TELEMETRY = 'true'
$env:ENABLE_TELEMETRY = 'false'
$env:HOSTNAME = '127.0.0.1'
$env:PORT = [string]$Port
$env:BASE_URL = $origin
$env:NEXTAUTH_URL = $origin
$env:OAUTH_ISSUER_URL = $origin
if ($publicUri) {
  # Metadata only: the listener stays on loopback and no tunnel is created.
  $env:BASE_URL = $publicUri.GetLeftPart([UriPartial]::Authority)
  $env:NEXTAUTH_URL = $env:BASE_URL
  $env:OAUTH_ISSUER_URL = $publicUri.AbsoluteUri.TrimEnd('/')
}
$env:WA_AKG_API_BASE_URL = $origin + '/api'
$env:SOCKET_IO_DISTRIBUTED = 'false'
$env:SOCKET_IO_REDIS_URL = ''
$env:WA_AKG_MCP_ENABLED = 'true'
$env:NODE_ENV = 'production'
$out = Join-Path $root 'server.stdout.log'
$err = Join-Path $root 'server.stderr.log'
$proc = Start-Process -FilePath 'node.exe' -ArgumentList @('node_modules\tsx\dist\cli.mjs','scripts\start-production.mjs') -WorkingDirectory $repo -PassThru -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err
function Get-Status([string]$url) {
  $req = [System.Net.HttpWebRequest]::Create($url)
  $req.AllowAutoRedirect = $false
  $req.Timeout = 3000
  $res = $null
  try { $res = $req.GetResponse(); return [int]$res.StatusCode }
  catch [System.Net.WebException] {
    if ($_.Exception.Response) { $res = $_.Exception.Response; return [int]$res.StatusCode }
    return 0
  } finally { if ($null -ne $res) { $res.Close() } }
}
$ready = $false
$clock = [System.Diagnostics.Stopwatch]::StartNew()
while ($clock.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
  $proc.Refresh()
  if ($proc.HasExited) { break }
  $homeStatus = Get-Status ($origin + '/')
  if ($homeStatus -ge 200 -and $homeStatus -lt 400) { $ready = $true; break }
  Start-Sleep -Seconds 2
}
$sessionStatus = if ($ready) { Get-Status ($origin + '/api/sessions') } else { 0 }
$oauthStatus = if ($ready) { Get-Status ($origin + '/.well-known/oauth-authorization-server') } else { 0 }
$qrStatus = if ($ready) { Get-Status ($origin + '/api/sessions/local-unauthorized/qr') } else { 0 }
$listen = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
$onLoopback = $null -ne $listen -and $listen.LocalAddress -eq '127.0.0.1'
$listenerPid = if ($listen) { [int]$listen.OwningProcess } else { 0 }
$listenerOwner = if ($listenerPid) { Get-CimInstance Win32_Process -Filter ('ProcessId=' + $listenerPid) -ErrorAction SilentlyContinue } else { $null }
$ownedListener = $null -ne $listenerOwner -and $listenerOwner.Name -eq 'node.exe' -and ($listenerPid -eq $proc.Id -or $listenerOwner.ParentProcessId -eq $proc.Id)
$ok = $ready -and $onLoopback -and $ownedListener -and $sessionStatus -eq 401 -and $oauthStatus -eq 200 -and $qrStatus -eq 401
$result = [ordered]@{ status = $(if ($ok) {'VERIFIED'} else {'FAILED'}); pid = $listenerPid; launcherPid = $proc.Id; port = $Port; loopback = $onLoopback; home = $homeStatus; sessionsUnauthorized = $sessionStatus; oauthDiscovery = $oauthStatus; qrUnauthorized = $qrStatus; logs = $root; safeLocalMode = $true }
$result | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $root 'validation.json') -Encoding UTF8
Write-Output ('STATUS=' + $result.status + ';PID=' + $listenerPid + ';LAUNCHER_PID=' + $proc.Id + ';PORT=' + $Port + ';LOOPBACK=' + $onLoopback + ';SESSIONS=' + $sessionStatus + ';OAUTH=' + $oauthStatus + ';QR=' + $qrStatus + ';EVIDENCE=' + $root)
if (-not $ok) { exit 1 }
