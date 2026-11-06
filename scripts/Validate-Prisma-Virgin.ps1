param([ValidateSet('ExpectP3018','ExpectSuccess')][string]$Mode='ExpectSuccess',[switch]$RunTenantFixture)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$hadDatabaseUrl=Test-Path Env:DATABASE_URL
$previousDatabaseUrl=[Environment]::GetEnvironmentVariable('DATABASE_URL','Process')
$hadUpdateMessage=Test-Path Env:PRISMA_HIDE_UPDATE_MESSAGE
$previousUpdateMessage=[Environment]::GetEnvironmentVariable('PRISMA_HIDE_UPDATE_MESSAGE','Process')
$previousIsolation=[Environment]::GetEnvironmentVariable('WA_AKG_SYNTHETIC_ISOLATION','Process')
$previousIsolationContainer=[Environment]::GetEnvironmentVariable('WA_AKG_ISOLATION_CONTAINER','Process')
$id='prisma-virgin-'+$Mode+'-'+(Get-Date -Format 'yyyyMMdd-HHmmss')
$root=Join-Path $repo ('.remote-desktop\sessions\'+$id)
$raw=Join-Path $root 'raw'
New-Item -ItemType Directory -Path $raw -Force | Out-Null
$name='wa-akg-prisma-test-'+(Get-Date -Format 'MMddHHmmss')
$pw=[guid]::NewGuid().ToString('N')+[guid]::NewGuid().ToString('N')
$started=$false
$good=$false
$checks=@{}
$exitCode=-1
$reason='NOT_RUN'
try{
    if($RunTenantFixture -and $Mode -ne 'ExpectSuccess'){throw 'Tenant fixture requires ExpectSuccess mode'}
    $output=& docker.exe run --pull never --rm --detach --name $name --tmpfs '/var/lib/mysql:rw,size=1g' --publish '127.0.0.1::3306' --env ('MYSQL_ROOT_PASSWORD='+$pw) --env 'MYSQL_DATABASE=wa_akg_sandbox' mysql:8.0 --lower-case-table-names=1
    if($LASTEXITCODE -ne 0){throw 'docker run failed'}
    $started=$true
    $mount=(& docker.exe inspect $name --format '{{json .HostConfig.Tmpfs}}' | ConvertFrom-Json)
    if(-not ($mount.PSObject.Properties.Name -contains '/var/lib/mysql')){throw 'No isolated tmpfs mount'}
    $bound=(& docker.exe port $name '3306/tcp' | Select-Object -First 1).ToString()
    if($bound -notmatch '127\.0\.0\.1:(\d+)$'){throw 'Port not loopback-bound'}
    $port=[int]$Matches[1]
    $ready=$false
    for($i=0;$i -lt 90;$i++){
        & docker.exe exec --env ('MYSQL_PWD='+$pw) $name mysqladmin ping -h 127.0.0.1 -u root --silent *> $null
        if($LASTEXITCODE -eq 0){$ready=$true;break}
        Start-Sleep -Seconds 1
    }
    if(-not $ready){throw 'MySQL not ready'}
    $env:DATABASE_URL='mysql://root:'+$pw+'@127.0.0.1:'+$port+'/wa_akg_sandbox'
    $env:PRISMA_HIDE_UPDATE_MESSAGE='1'
    if($Mode -eq 'ExpectSuccess'){
        $probe=Start-Process -FilePath 'cmd.exe' -ArgumentList @('/d','/c','node scripts\prisma-bootstrap-v2.mjs --deploy --expect-db wa_akg_sandbox') -WorkingDirectory $repo -Wait -PassThru -NoNewWindow -RedirectStandardOutput (Join-Path $raw 'guard.stdout.log') -RedirectStandardError (Join-Path $raw 'guard.stderr.log')
        $checks.emptyBootstrapRequiresOptIn=($probe.ExitCode -ne 0 -and (Get-Content (Join-Path $raw 'guard.stderr.log') -Raw) -match 'EMPTY_DATABASE_REQUIRES_EXPLICIT_V2_CONFIRMATION')
        if(-not $checks.emptyBootstrapRequiresOptIn){throw 'V2 empty database opt-in guard failed'}
    }
    $stdout=Join-Path $raw 'deploy.stdout.log'
    $stderr=Join-Path $raw 'deploy.stderr.log'
    $initialCommand=if($Mode -eq 'ExpectP3018'){'node_modules\.bin\prisma.cmd migrate deploy --schema prisma\schema.prisma'}else{'node scripts\prisma-bootstrap-v2.mjs --deploy --expect-db wa_akg_sandbox --confirm-empty-v2'}
    $p=Start-Process -FilePath 'cmd.exe' -ArgumentList @('/d','/c',$initialCommand) -WorkingDirectory $repo -Wait -PassThru -NoNewWindow -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    $exitCode=$p.ExitCode
    if($Mode -eq 'ExpectP3018'){
        $all=[IO.File]::ReadAllText($stdout)+[IO.File]::ReadAllText($stderr)
        $checks.P3018=[bool]($all -match 'P3018')
        $checks.duplicateColumn=[bool]($all -match '1060|Duplicate column')
        $good=$exitCode -ne 0 -and $checks.P3018 -and $checks.duplicateColumn
        $reason=if($good){'EXPECTED_P3018_CONFIRMED'}else{'UNEXPECTED_BASELINE_RESULT'}
    }else{
        $checks.firstDeployOk=$exitCode -eq 0
        if($exitCode -eq 0){
            $p2=Start-Process -FilePath 'cmd.exe' -ArgumentList @('/d','/c','node scripts\prisma-bootstrap-v2.mjs --deploy --expect-db wa_akg_sandbox') -WorkingDirectory $repo -Wait -PassThru -NoNewWindow -RedirectStandardOutput (Join-Path $raw 'redeploy.stdout.log') -RedirectStandardError (Join-Path $raw 'redeploy.stderr.log')
            $checks.redeployOk=$p2.ExitCode -eq 0
            $sql=@{
                migrations='SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL';
                column="SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=database() AND lower(table_name)='inboundevent' AND lower(column_name)='messageid'";
                index="SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=database() AND lower(table_name)='inboundevent' AND index_name='inbound_event_message_idx'";
                foreignKey="SELECT COUNT(*) FROM information_schema.key_column_usage WHERE table_schema=database() AND lower(table_name)='inboundevent' AND lower(column_name)='messageid' AND lower(referenced_table_name)='message'";
                coreTables="SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=database() AND table_name IN ('Tenant','TenantMembership','ProcessingResult')";
            }
            foreach($key in $sql.Keys){
                $val=(& docker.exe exec --env ('MYSQL_PWD='+$pw) $name mysql -u root --batch --skip-column-names wa_akg_sandbox -e $sql[$key] 2>$null | Select-Object -Last 1).ToString().Trim()
                $checks[$key]=[int]$val
            }
            $expected=@(Get-ChildItem (Join-Path $repo 'prisma\bootstrap-v2\migrations') -Directory).Count
            $checks.expected=$expected
            $good=$checks.firstDeployOk -and $checks.redeployOk -and $checks.migrations -eq $expected -and $checks.column -eq 1 -and $checks.index -eq 1 -and $checks.foreignKey -eq 1 -and $checks.coreTables -eq 3
            if($RunTenantFixture -and $good){
                $env:WA_AKG_SYNTHETIC_ISOLATION='1'
                $env:WA_AKG_ISOLATION_CONTAINER=$name
                $fixture=Start-Process -FilePath 'cmd.exe' -ArgumentList @('/d','/c','node node_modules\tsx\dist\cli.mjs scripts\integration\tenant-isolation.fixture.ts') -WorkingDirectory $repo -Wait -PassThru -NoNewWindow -RedirectStandardOutput (Join-Path $raw 'isolation.stdout.log') -RedirectStandardError (Join-Path $raw 'isolation.stderr.log')
                $checks.fixtureExitCode=$fixture.ExitCode
                $checks.fixtureVerified=($fixture.ExitCode -eq 0 -and ([IO.File]::ReadAllText((Join-Path $raw 'isolation.stdout.log')) -match '"status":"VERIFIED"'))
                $good=$good -and $checks.fixtureVerified
            }
            $reason=if($good){'FRESH_BOOTSTRAP_VERIFIED'}elseif($RunTenantFixture -and $checks.ContainsKey('fixtureVerified')){'TENANT_FIXTURE_FAILED'}else{'SCHEMA_OR_REDEPLOY_FAILED'}
        }else{$reason='DEPLOY_FAILED'}
    }
}catch{$reason='BLOCKED: '+$_.Exception.GetType().Name+': '+$_.Exception.Message}
finally{
    if($hadDatabaseUrl){$env:DATABASE_URL=$previousDatabaseUrl}else{Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue}
    if($hadUpdateMessage){$env:PRISMA_HIDE_UPDATE_MESSAGE=$previousUpdateMessage}else{Remove-Item Env:PRISMA_HIDE_UPDATE_MESSAGE -ErrorAction SilentlyContinue}
    if($null -ne $previousIsolation){$env:WA_AKG_SYNTHETIC_ISOLATION=$previousIsolation}else{Remove-Item Env:WA_AKG_SYNTHETIC_ISOLATION -ErrorAction SilentlyContinue}
    if($null -ne $previousIsolationContainer){$env:WA_AKG_ISOLATION_CONTAINER=$previousIsolationContainer}else{Remove-Item Env:WA_AKG_ISOLATION_CONTAINER -ErrorAction SilentlyContinue}
    $cleanup='NOT_STARTED'
    if($started){
        & docker.exe stop --time 3 $name *> $null
        $cleanup=if($LASTEXITCODE -eq 0){'OWN_TMPFS_SANDBOX_STOPPED'}else{'CLEANUP_NOT_VERIFIED'}
    }
    $verified=$good -and $cleanup -eq 'OWN_TMPFS_SANDBOX_STOPPED'
    $result=[ordered]@{session=$id;mode=$Mode;result=$(if($verified){'VERIFIED'}else{'FAILED'});reason=$reason;exitCode=$exitCode;checks=$checks;cleanup=$cleanup;started=(Get-Date).ToString('o');root=$root}
    $result | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $root 'validation.json') -Encoding UTF8
    $sha=[System.Security.Cryptography.SHA256]::Create()
    $lines=@()
    foreach($f in @(Get-ChildItem $raw -File; Get-Item (Join-Path $root 'validation.json'))){
        $stream=[IO.File]::OpenRead($f.FullName)
        try{$h=([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-','').ToLowerInvariant();$lines+=($h+'  '+$f.FullName.Substring($root.Length+1).Replace('\','/'))}finally{$stream.Dispose()}
    }
    $sha.Dispose()
    $lines | Set-Content (Join-Path $root 'checksums.sha256') -Encoding Ascii
    Write-Output ('SESSION_ID='+$id)
    Write-Output ('RESULT='+$result.result)
    Write-Output ('REASON='+$reason)
    Write-Output ('PRISMA_EXIT='+$exitCode)
    Write-Output ('CHECKS='+($checks | ConvertTo-Json -Compress))
    Write-Output ('CLEANUP='+$cleanup)
    Write-Output ('EVIDENCE_ROOT='+$root)
}
if(-not $verified){exit 1}
