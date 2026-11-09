#Requires -Version 5.1
<#
.SYNOPSIS
  Sincronizacao segura do fork ConectaFlow e preflight da candidata B2.
.DESCRIPTION
  Audit e o modo padrao (somente leitura). Fetch nunca faz merge.
  Prepare cria apenas um worktree isolado. Check executa testes offline,
  sem instalar dependencias, migrar banco, reiniciar servicos ou publicar.
#>
[CmdletBinding()]
param(
    [ValidateSet('Audit', 'Fetch', 'Prepare', 'Check')]
    [string]$Mode = 'Audit',
    [string]$RepoPath = (Join-Path $PSScriptRoot '..'),
    [string]$UpstreamUrl = 'https://github.com/mrifqidaffaaditya/WA-AKG.git',
    [string]$BaseRef = 'main',
    [string]$CandidateBranch = 'release/b2-integration-20261109',
    [string]$CandidatePath = '',
    [switch]$IncludeBuild
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

function Invoke-RepoGit {
    param([string[]]$Arguments, [switch]$AllowFailure)
    $oldPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $lines = @(& git -C $script:RepoRoot @Arguments 2>$null)
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $oldPreference
    }
    if ($exitCode -ne 0 -and -not $AllowFailure) {
        throw ('GIT_FAILED: ' + $Arguments[0] + ' exit=' + $exitCode)
    }
    return @{ Code = $exitCode; Lines = $lines }
}

function Get-GitFirst {
    param([string[]]$Arguments)
    $response = Invoke-RepoGit -Arguments $Arguments
    return [string]($response.Lines | Select-Object -First 1)
}

function Get-ChangeCount {
    $response = Invoke-RepoGit -Arguments @('status', '--porcelain=v1', '--untracked-files=normal')
    return @($response.Lines | Where-Object { [string]$_ -ne '' }).Count
}

function Invoke-OfflineCheck {
    param([string]$Name, [string]$Executable, [string[]]$Arguments, [string]$LogRoot)
    $stdout = Join-Path $LogRoot ($Name + '.stdout.log')
    $stderr = Join-Path $LogRoot ($Name + '.stderr.log')
    $oldPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    Push-Location -LiteralPath $script:RepoRoot
    try {
        & $Executable @Arguments 1> $stdout 2> $stderr
        $code = $LASTEXITCODE
    } finally {
        Pop-Location
        $ErrorActionPreference = $oldPreference
    }
    Write-Host ('CHECK=' + $Name + ';EXIT=' + $code)
    return ($code -eq 0)
}

try {
    $resolved = Resolve-Path -LiteralPath $RepoPath
    $script:RepoRoot = [string]$resolved.Path
    [void](Invoke-RepoGit -Arguments @('rev-parse', '--show-toplevel'))
    $head = Get-GitFirst -Arguments @('rev-parse', 'HEAD')
    $dirtyCount = Get-ChangeCount

    switch ($Mode) {
        'Audit' {
            $branch = Get-GitFirst -Arguments @('branch', '--show-current')
            $remotes = @( (Invoke-RepoGit -Arguments @('remote')).Lines )
            $delta = 'UPSTREAM_NOT_FETCHED'
            if ($remotes -contains 'upstream') {
                $ref = Invoke-RepoGit -Arguments @('rev-parse', '--verify', 'refs/remotes/upstream/main') -AllowFailure
                if ($ref.Code -eq 0) {
                    $delta = Get-GitFirst -Arguments @('rev-list', '--left-right', '--count', ($BaseRef + '...upstream/main'))
                }
            }
            Write-Output ('STATUS=VERIFIED;MODE=Audit;BRANCH=' + $branch + ';HEAD=' + $head + ';DIRTY_ENTRIES=' + $dirtyCount + ';DIVERGENCE=' + $delta)
        }
        'Fetch' {
            $remotes = @( (Invoke-RepoGit -Arguments @('remote')).Lines )
            if ($remotes -contains 'upstream') {
                $configured = Get-GitFirst -Arguments @('remote', 'get-url', 'upstream')
                if ($configured -ne $UpstreamUrl) { throw 'UPSTREAM_URL_MISMATCH' }
            } else {
                [void](Invoke-RepoGit -Arguments @('remote', 'add', 'upstream', $UpstreamUrl))
            }
            [void](Invoke-RepoGit -Arguments @('fetch', '--quiet', '--no-tags', 'upstream', 'main'))
            $newHead = Get-GitFirst -Arguments @('rev-parse', 'HEAD')
            if ($newHead -ne $head -or (Get-ChangeCount) -ne $dirtyCount) {
                throw 'WORKTREE_CHANGED_DURING_FETCH'
            }
            $upstreamHead = Get-GitFirst -Arguments @('rev-parse', 'refs/remotes/upstream/main')
            $divergence = Get-GitFirst -Arguments @('rev-list', '--left-right', '--count', ($BaseRef + '...upstream/main'))
            Write-Output ('STATUS=VERIFIED;MODE=Fetch;UPSTREAM_SHA=' + $upstreamHead + ';DIVERGENCE=' + $divergence + ';MERGED=false;PUSHED=false')
        }
        'Prepare' {
            if (-not $CandidatePath) {
                $CandidatePath = Join-Path (Split-Path -Parent $script:RepoRoot) 'WA-AKG-B2-integration'
            }
            if (Test-Path -LiteralPath $CandidatePath) { throw 'CANDIDATE_PATH_EXISTS' }
            $ref = Invoke-RepoGit -Arguments @('show-ref', '--verify', '--quiet', ('refs/heads/' + $CandidateBranch)) -AllowFailure
            if ($ref.Code -eq 0) { throw 'CANDIDATE_BRANCH_EXISTS' }
            $baseHead = Get-GitFirst -Arguments @('rev-parse', '--verify', $BaseRef)
            [void](Invoke-RepoGit -Arguments @('worktree', 'add', '--quiet', '-b', $CandidateBranch, $CandidatePath, $BaseRef))
            $actualHead = @(& git -C $CandidatePath rev-parse HEAD 2>$null)[0]
            $actualCode = $LASTEXITCODE
            if ($actualCode -ne 0 -or $actualHead -ne $baseHead) { throw 'CANDIDATE_VERIFICATION_FAILED' }
            Write-Output ('STATUS=VERIFIED;MODE=Prepare;BRANCH=' + $CandidateBranch + ';HEAD=' + $actualHead + ';PATH=' + $CandidatePath)
        }
        'Check' {
            if (-not (Test-Path -LiteralPath (Join-Path $script:RepoRoot 'node_modules'))) {
                Write-Output 'STATUS=BLOCKED;MODE=Check;CAUSE=NODE_MODULES_ABSENT;INSTALL_AUTOMATIC=false'
                exit 24
            }
            $logRoot = Join-Path $env:LOCALAPPDATA ('ConectaFlow\B2\checks-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
            [void](New-Item -ItemType Directory -Path $logRoot -Force)
            $passed = $true
            $checks = @(
                @{ Name='prisma-bootstrap'; Exe='npm.cmd'; Args=@('run', 'db:bootstrap:v2:test') },
                @{ Name='unit'; Exe='npm.cmd'; Args=@('test') },
                @{ Name='typecheck'; Exe='node.exe'; Args=@('node_modules/typescript/bin/tsc', '--noEmit') },
                @{ Name='lint'; Exe='npm.cmd'; Args=@('run', 'lint') }
            )
            if ($IncludeBuild) {
                $checks += @{ Name='build'; Exe='npm.cmd'; Args=@('run', 'build') }
            }
            foreach ($check in $checks) {
                if (-not (Invoke-OfflineCheck -Name $check.Name -Executable $check.Exe -Arguments $check.Args -LogRoot $logRoot)) {
                    $passed = $false
                }
            }
            if (-not $passed) {
                Write-Output ('STATUS=FAILED;MODE=Check;LOG_DIR=' + $logRoot)
                exit 25
            }
            Write-Output ('STATUS=TESTED;MODE=Check;CHECKS=' + $checks.Count + ';LIVE_DB_VALIDATED=false;PRODUCTION_READY=false')
        }
    }
} catch {
    $reason = [string]$_.Exception.Message
    if ($reason -match '(?i)(token|password|secret|key=)') { $reason = 'REDACTED_ERROR' }
    Write-Output ('STATUS=BLOCKED;MODE=' + $Mode + ';REASON=' + $reason)
    exit 1
}
