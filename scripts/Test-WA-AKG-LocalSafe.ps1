#requires -Version 5.1
[CmdletBinding()]
param([int]$Port=43000)
$ErrorActionPreference = 'Stop'
$root='C:\repos\WA-AKG'
$origin='http://127.0.0.1:'+$Port
$listen=Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $listen) { Write-Output 'STATUS=FAILED;REASON=NO_LISTENER'; exit 1 }
$ownerId = $listen.OwningProcess
$ownerProcess = Get-Process -Id $ownerId -ErrorAction Stop
function Get-Status([string]$url) {
  $req = [System.Net.HttpWebRequest]::Create($url)
  $req.AllowAutoRedirect = $false
  $req.Timeout = 5000
  $res = $null
  try { $res = $req.GetResponse(); return [int]$res.StatusCode }
  catch [System.Net.WebException] {
    if ($_.Exception.Response) { $res = $_.Exception.Response; return [int]$res.StatusCode }
    return 0
  } finally { if ($null -ne $res) { $res.Close() } }
}
$homeStatus=Get-Status ($origin+'/')
$sessionStatus=Get-Status ($origin+'/api/sessions')
$oauthStatus=Get-Status ($origin+'/.well-known/oauth-authorization-server')
$qrStatus=Get-Status ($origin+'/api/sessions/local-unauthorized/qr')
$ok=$listen.LocalAddress -eq '127.0.0.1' -and $ownerProcess.ProcessName -eq 'node' -and
  $homeStatus -ge 200 -and $homeStatus -lt 400 -and $sessionStatus -eq 401 -and
  $oauthStatus -eq 200 -and $qrStatus -eq 401
$evidence=Join-Path $root ('.remote-desktop\sessions\local-safe-http-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $evidence -Force | Out-Null
$result=[ordered]@{status=$(if($ok){'VERIFIED'}else{'FAILED'});port=$Port;process=$ownerId;processName=$ownerProcess.ProcessName;localAddress=$listen.LocalAddress;home=$homeStatus;sessionsUnauthenticated=$sessionStatus;oauthMetadata=$oauthStatus;qrUnauthenticated=$qrStatus}
$result | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $evidence 'validation.json') -Encoding UTF8
Write-Output ('STATUS='+$result.status+';PORT='+$Port+';PROCESS='+$ownerId+';HOME='+$homeStatus+';SESSIONS='+$sessionStatus+';OAUTH='+$oauthStatus+';QR='+$qrStatus+';EVIDENCE='+$evidence)
if(-not $ok){exit 1}
