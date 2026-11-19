#requires -Version 5.1
[CmdletBinding()]
param([int]$Port = 43000)
$ErrorActionPreference = 'Stop'
$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $listener) { Write-Output ('STATUS=NOT_RUNNING;PORT=' + $Port); exit 1 }
$processId = [int]$listener.OwningProcess
$httpProcess = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $processId) -ErrorAction Stop
if (-not $httpProcess) { Write-Output 'STATUS=NOT_VERIFIED'; exit 1 }
$launchId = [int]$httpProcess.ParentProcessId
$launchProcess = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $launchId) -ErrorAction SilentlyContinue
Write-Output ('STATUS=OBSERVED;PORT=' + $Port + ';BIND=' + $listener.LocalAddress + ';LISTENER_PID=' + $processId + ';LISTENER_NAME=' + $httpProcess.Name + ';PARENT_PID=' + $launchId + ';PARENT_NAME=' + $launchProcess.Name)
