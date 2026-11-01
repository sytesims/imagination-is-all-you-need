# Imagination Is All You Need install for Windows (PowerShell). The app, optionally pointed at a running ComfyUI (-Mock: sample results, development only).
#   ./scripts/install.ps1                                  # the app (paste a Comfy key or point it at ComfyUI on first Generate)
#   ./scripts/install.ps1 -ComfyUrl http://127.0.0.1:8188  # use your ComfyUI (Desktop/portable)
# App only: install ComfyUI, custom nodes and model files separately if you want local generation.
param([string]$ComfyUrl = $env:OPENHIGGSFIELD_COMFY_URL, [switch]$Mock, [switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
function Need($cmd, $msg) { if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { throw $msg } }
$nodeSteps = 'Install it with: winget install OpenJS.NodeJS.LTS (or nvm-windows: nvm install 24), reopen PowerShell, then run this again.'
Need node "Imagination needs Node.js 22, 24 or 26 (24 recommended). $nodeSteps"
Need npm.cmd "npm is missing. Install Node.js 22, 24 or 26 (24 recommended) with npm. $nodeSteps"
# Node.js 22 (from 22.12), 24 or 26, the same rule as scripts/node-version.mjs (20, 23 and 25 are past their end of life)
$nodeV = [string](node -p "process.versions.node"); $parts = $nodeV.Split('.'); $major = [int]$parts[0]; $minor = [int]$parts[1]
if ($major -gt 26) { throw "Node.js $nodeV is newer than Imagination supports yet. Use Node.js 22, 24 or 26 (24 recommended). $nodeSteps" }
if ($major -eq 23 -or $major -eq 25) { throw "Node.js $nodeV reached its end of life and no longer gets security fixes. Install Node.js 22, 24 or 26 (24 recommended). $nodeSteps" }
if ($major -eq 22 -and $minor -lt 12) { throw "Node.js $nodeV is too old: Imagination needs 22.12 or newer. Install Node.js 22, 24 or 26 (24 recommended). $nodeSteps" }
if ($major -lt 22) { throw "Node.js $nodeV is too old. It reached its end of life and no longer gets security fixes. Install Node.js 22, 24 or 26 (24 recommended). $nodeSteps" }
foreach ($tool in @('ffmpeg', 'ffprobe')) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    Write-Warning "$tool not found. Install the FFmpeg tools (winget install --id Gyan.FFmpeg -e), reopen PowerShell, then retry. Examples can be browsed, but uploads and media processing need both ffmpeg and ffprobe."
  }
}
$gpu = 'CPU only'
if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) { $gpu = 'NVIDIA: ' + (nvidia-smi --query-gpu=name,memory.total --format=csv,noheader | Select-Object -First 1) }
Write-Host "==> $gpu, Node $(node -v)" -ForegroundColor Cyan
$backend = if ($Mock) { 'mock' } else { 'comfy' }  # comfy by default (2026-10-29); -Mock = sample results, development only
Write-Host "==> Backend: $backend $ComfyUrl" -ForegroundColor Cyan
npm.cmd ci --no-audit --no-fund; if ($LASTEXITCODE) { throw 'npm ci failed' }
if (-not $SkipBuild) { npm.cmd run build; if ($LASTEXITCODE) { throw 'build failed' } }
# Merge, never overwrite: re-runs keep the keys saved in Settings (same rule as install.sh). Only these settings are replaced.
$envFile = if ($env:OPENHIGGSFIELD_ENV_FILE) { $env:OPENHIGGSFIELD_ENV_FILE } else { '.env.local' }
$envPairs = @("OPENHIGGSFIELD_BACKEND=$backend")
if ($backend -eq 'comfy' -and $ComfyUrl) { $envPairs += "COMFY_BASE_URL=$ComfyUrl" }
if ($backend -eq 'mock') { $envPairs += 'OPENHIGGSFIELD_USE_LOCAL=1' }  # mock only: demo works with no keys; real installs stay cloud-first
node scripts/env-merge.mjs $envFile @envPairs; if ($LASTEXITCODE) { throw "couldn't update $envFile" }
$installDir = (Get-Location).Path.Replace("'", "''")
Write-Host @"

Installed the app. Start the web app, API and MCP server:
  Set-Location '$installDir'
  npm.cmd run setup

Setup prints the actual address and opens the connection wizard when you visit it.
Keep this terminal open while using the app; press Ctrl+C to stop it.
ComfyUI and model files are separate, optional requirements for local generation.
"@ -ForegroundColor Green
