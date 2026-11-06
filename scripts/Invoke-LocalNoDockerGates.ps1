#requires -Version 5.1
[CmdletBinding()]
param([switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$repo = 'C:\repos\WA-AKG'
$session = 'local-nodocker-gates-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
$root = Join-Path $repo ('.remote-desktop\sessions\' + $session)
$raw = Join-Path $root 'raw'
New-Item -ItemType Directory -Path $raw -Force | Out-Null
$steps = @(
  @{ Id='typecheck'; File='node.exe'; Args=@('node_modules\typescript\bin\tsc','--noEmit','--incremental','false') },
  @{ Id='lint'; File='cmd.exe'; Args=@('/d','/c','npm.cmd run lint') },
  @{ Id='unit'; File='cmd.exe'; Args=@('/d','/c','npm.cmd test') },
  @{ Id='prisma-unit'; File='node.exe'; Args=@('--test','scripts\__tests__\prisma-bootstrap-v2.test.mjs','scripts\__tests__\container-start-v2.test.mjs') },
  @{ Id='mcp'; File='cmd.exe'; Args=@('/d','/c','npm.cmd run mcp:test') },
  @{ Id='git-diff'; File='git.exe'; Args=@('diff','--check') }
)
if (-not $SkipBuild) {
  $steps += @{ Id='private-build'; File='node.exe'; Args=@('scripts\verify-private-media-build.mjs') }
}
$results = @()
$failed = $false
foreach ($step in $steps) {
  $output = Join-Path $raw ($step.Id + '.stdout.log')
  $errorLog = Join-Path $raw ($step.Id + '.stderr.log')
  $start = Get-Date
  try {
    $process = Start-Process -FilePath $step.File -ArgumentList $step.Args -WorkingDirectory $repo -Wait -PassThru -NoNewWindow -RedirectStandardOutput $output -RedirectStandardError $errorLog
    $rc = $process.ExitCode
  } catch { $rc = 70 }
  $elapsed = [int]((Get-Date) - $start).TotalSeconds
  $results += [pscustomobject]@{step=$step.Id;exit=$rc;seconds=$elapsed}
  Write-Output ('STEP=' + $step.Id + ';EXIT=' + $rc + ';SECONDS=' + $elapsed)
  if ($rc -ne 0) { $failed = $true; break }
}
$results | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $root 'validation.json') -Encoding UTF8
$hashes = @()
$sha = [System.Security.Cryptography.SHA256]::Create()
try {
  foreach ($file in (Get-ChildItem -LiteralPath $raw -File)) {
    $stream = [System.IO.File]::OpenRead($file.FullName)
    try {
      $digest = ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-','').ToLowerInvariant()
      $hashes += ($digest + '  raw/' + $file.Name)
    } finally { $stream.Dispose() }
  }
} finally { $sha.Dispose() }
$hashes | Set-Content -LiteralPath (Join-Path $root 'checksums.sha256') -Encoding ASCII
Write-Output ('STATUS=' + $(if ($failed) { 'FAILED' } else { 'VERIFIED' }) + ';EVIDENCE=' + $root)
if ($failed) { exit 1 }
