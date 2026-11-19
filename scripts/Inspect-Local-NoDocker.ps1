# PowerShell 5.1 read-only targeted local preflight; never prints environment values
$ErrorActionPreference = 'Stop'
$repo = 'C:\repos\WA-AKG'
Set-Location -LiteralPath $repo
$svc = Get-CimInstance Win32_Service -Filter "Name='MySQL80'" -ErrorAction SilentlyContinue
if ($null -ne $svc) {
  $binary = [regex]::Match([string]$svc.PathName, '(?:^"|^)([^"]*?mysqld\.exe)').Groups[1].Value
  Write-Output ('MYSQL_SERVICE=' + $svc.State)
  Write-Output ('MYSQL_BINARY_PRESENT=' + (Test-Path -LiteralPath $binary -PathType Leaf))
  if (Test-Path -LiteralPath $binary -PathType Leaf) {
    Write-Output ('MYSQL_BINARY_PATH=' + $binary)
  }
} else { Write-Output 'MYSQL_SERVICE=NOT_FOUND' }
foreach ($p in @(3306,3307,43000,3030,3000,8080)) {
  $connection = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -ne $connection) {
    Write-Output ('PORT_' + $p + '=LISTEN_PID_' + $connection.OwningProcess)
  } else { Write-Output ('PORT_' + $p + '=NO_LISTENER') }
}
$localEnv = Join-Path $repo '.env'
if (Test-Path $localEnv) {
  $keys = @([System.IO.File]::ReadAllLines($localEnv) |
    Where-Object { $_ -match '^\s*[A-Za-z_][A-Za-z0-9_]*\s*=' } |
    ForEach-Object { ($_ -split '=',2)[0].Trim() })
  foreach ($key in @('DATABASE_URL','AUTH_SECRET','AUTH_STATE_ENCRYPTION_KEY','WA_AKG_MCP_ENABLED','WA_AKG_MCP_HTTP_PATH','PORT','HOSTNAME','BASE_URL','NEXTAUTH_URL','WA_AKG_SESSION_AUTOSTART')) {
    Write-Output ('ENV_KEY_' + $key + '=' + [bool]($keys -contains $key))
  }
}
Write-Output ('BUILD_ID_PRESENT=' + (Test-Path (Join-Path $repo '.next\BUILD_ID')))
Write-Output ('PRISMA_LOCAL=' + (Test-Path (Join-Path $repo 'node_modules\prisma\build\index.js')))
Write-Output ('TSX_LOCAL=' + (Test-Path (Join-Path $repo 'node_modules\tsx\dist\cli.mjs')))
