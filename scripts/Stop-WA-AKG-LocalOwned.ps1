#requires -Version 5.1
[CmdletBinding()]
param([int]$Port=43000,[int]$ExpectedPid=0)
$ErrorActionPreference='Stop'
if($ExpectedPid -le 0){throw 'ExpectedPid mandatory'}
$listener=Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if(-not $listener -or $listener.OwningProcess -ne $ExpectedPid -or $listener.LocalAddress -ne '127.0.0.1'){
  Write-Output 'STATUS=BLOCKED;REASON=PORT_OWNERSHIP_MISMATCH'
  exit 2
}
$owned=Get-CimInstance Win32_Process -Filter ('ProcessId=' + $ExpectedPid) -ErrorAction Stop
if(-not $owned -or $owned.Name -ne 'node.exe' -or [string]$owned.CommandLine -notmatch 'start-production\.mjs'){
  Write-Output 'STATUS=BLOCKED;REASON=NOT_AN_OWNED_WA_AKG_PROCESS'
  exit 2
}
Stop-Process -Id $ExpectedPid -ErrorAction Stop
Start-Sleep -Seconds 2
$remaining=Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if($remaining){ Write-Output ('STATUS=FAILED;REASON=PORT_STILL_LISTENING_PID_'+$remaining.OwningProcess); exit 1 }
Write-Output ('STATUS=VERIFIED;OWN_PROCESS_STOPPED='+$ExpectedPid+';PORT='+$Port)
