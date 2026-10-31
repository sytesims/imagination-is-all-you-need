# Temporary Windows hunt: shared paths (dot-sourced by each step). The install folder has a space and non-ASCII letters.
$ErrorActionPreference = 'Continue'
$HuntHome = Join-Path $env:RUNNER_TEMP ('Jos' + [char]0x00E9 + ' ' + [char]0x00D1 + 'u user')
$Dir = Join-Path $HuntHome 'Imagination'
$Work = Join-Path $env:RUNNER_TEMP 'hunt'
New-Item -ItemType Directory -Force $HuntHome, $Work | Out-Null
$RepoUrl = 'file:///' + ($env:GITHUB_WORKSPACE -replace '\\', '/')
function Update-PathFromRegistry {
  foreach ($p in (([Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')) -split ';')) {
    if ($p -and (($env:Path -split ';') -notcontains $p)) { $env:Path += ";$p" } }
}
function Get-Listeners { Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in 8787, 5174, 8788 } }
function Get-AppNodes { Get-CimInstance Win32_Process -Filter "Name = 'node.exe' OR Name = 'esbuild.exe'" }
$script:Fails = 0
function Check([bool]$cond, [string]$what) { if ($cond) { Write-Host "PASS $what" } else { Write-Host "FAIL $what" -ForegroundColor Red; $script:Fails++ } }
