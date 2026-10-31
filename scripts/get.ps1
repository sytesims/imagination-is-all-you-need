# Imagination Is All You Need: the one-line installer for Windows (PowerShell).
#
#   irm https://iiayn.app/install.ps1 | iex
#   & ([scriptblock]::Create((irm https://iiayn.app/install.ps1))) -Dir D:\Imagination     (with options)
#
# What it does, in order (it asks before installing anything on your computer):
#   1. Checks for git, Node.js 20 or newer (with npm) and ffmpeg, and offers to install what's missing with winget.
#   2. Downloads the app into %USERPROFILE%\Imagination, or updates it if it's already there
#      (your library and keys are never touched).
#   3. Installs the app's own parts (npm run setup -- --no-start). No AI models, no ComfyUI, no keys:
#      you connect those inside the app when you want them.
#   4. Offers a desktop shortcut that starts the app and opens it in your browser.
#   5. Starts the app (npm run setup) and opens it in your browser.
#
# Options: -Yes  -Dir PATH  -Branch NAME  -NoStart  -NoShortcut  -DryRun  -Help
# macOS and Linux: use scripts/get.sh instead (curl -fsSL https://iiayn.app/install | bash).
# Works in Windows PowerShell 5.1 and PowerShell 7. Plain ASCII on purpose (5.1 misreads other characters).

param(
  [switch]$Yes,
  [string]$Dir = '',
  [string]$Branch = 'main',
  [switch]$NoStart,
  [switch]$NoShortcut,
  [switch]$DryRun,
  [switch]$Help
)

# Everything runs inside this function: when pasted with "| iex", nothing it sets leaks into your PowerShell window,
# and it never closes that window (it returns instead of exiting).
function Install-Imagination {
  param([bool]$Yes, [string]$Dir, [string]$Branch, [bool]$NoStart, [bool]$NoShortcut, [bool]$DryRun, [bool]$Help)
  Set-StrictMode -Version 2
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue'

  $repoUrl = 'https://github.com/sytesims/imagination-is-all-you-need.git'
  if ($env:IIAYN_REPO) { $repoUrl = $env:IIAYN_REPO } # another copy to clone from (tests)

  if ($Help) {
    Write-Host @'
Install Imagination Is All You Need and open it in your browser.

  irm https://iiayn.app/install.ps1 | iex
  & ([scriptblock]::Create((irm https://iiayn.app/install.ps1))) [options]

Options:
  -Yes           answer yes to every question (installs missing tools, adds the shortcut)
  -Dir PATH      where to put the app (default: %USERPROFILE%\Imagination)
  -Branch NAME   get another branch of the app (for testing; default: main)
  -NoStart       install, but don't start the app
  -NoShortcut    don't offer a desktop shortcut
  -DryRun        show every step, change nothing
  -Help          show this help
'@
    return
  }

  # ---- small helpers ---------------------------------------------------------------------------
  function Say([string]$text) { Write-Host $text }
  function Bold([string]$text) { Write-Host $text -ForegroundColor Cyan }
  function Ok([string]$text) { Write-Host "  ok  $text" -ForegroundColor Green }
  function Miss([string]$text) { Write-Host "  --  $text" -ForegroundColor Yellow }
  function Stop-Install([string]$why, [string]$next) {
    Write-Host ''; Write-Host "Stopped: $why" -ForegroundColor Red
    if ($next) { Write-Host $next }
    throw 'IIAYN_STOP'
  }
  # Ask "Question?": yes/no, default no. -Yes says yes.
  function Ask([string]$question) {
    if ($Yes) { Say "$question yes (-Yes)"; return $true }
    try { $a = Read-Host "$question [y/N]" } catch { Say "$question no (nobody to answer; add -Yes to say yes)"; return $false }
    return ($a -match '^(y|yes)$')
  }
  # Runs a program (or with -DryRun only prints it) and says whether it worked.
  function Run([string]$exe, [string[]]$argv) {
    if ($DryRun) { Say ("  + $exe " + ($argv -join ' ')); return $true }
    & $exe @argv | Out-Host # to the screen, so only the true/false below is returned
    return ($LASTEXITCODE -eq 0)
  }
  # New installs change PATH in the registry; add what's new there so this window sees them (keeping what it has).
  function Update-Path {
    $have = $env:Path -split ';'
    foreach ($p in (([Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')) -split ';')) {
      if ($p -and ($have -notcontains $p)) { $env:Path += ";$p"; $have += $p }
    }
  }
  function Has([string]$cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
  function NodeMajor {
    if (-not (Has 'node')) { return 0 }
    $v = (& node --version) 2>$null
    if ($v -match '^v(\d+)') { return [int]$Matches[1] } else { return 0 }
  }
  function HasTool([string]$t) {
    switch ($t) {
      'git'    { return (Has 'git') }
      'node'   { return ((Has 'npm.cmd') -and ((NodeMajor) -ge 20)) }
      'ffmpeg' { return ((Has 'ffmpeg') -and (Has 'ffprobe')) }
    }
  }
  $describe = @{
    git    = 'git (downloads the app and its updates)'
    node   = 'Node.js 20 or newer, with npm (runs the app)'
    ffmpeg = 'ffmpeg (handles video and audio; optional, browsing works without it)'
  }
  $wingetId = @{ git = 'Git.Git'; node = 'OpenJS.NodeJS.LTS'; ffmpeg = 'Gyan.FFmpeg' }
  function Show-ManualSteps {
    Say ''
    Say 'To install them yourself:'
    Say '  git:     https://git-scm.com/download/win'
    Say '  Node.js: https://nodejs.org/en/download (version 22 or 24)'
    Say '  ffmpeg:  https://ffmpeg.org/download.html (optional)'
    Say 'Then open a new PowerShell window and run the install line again.'
  }

  # ---- the plan ----------------------------------------------------------------------------------
  if (-not $Dir) { $Dir = Join-Path $env:USERPROFILE 'Imagination' }
  $Dir = [IO.Path]::GetFullPath($ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Dir)).TrimEnd('\')
  $isInstall = (Test-Path (Join-Path $Dir '.git')) -and (Test-Path (Join-Path $Dir 'scripts\setup.mjs'))
  if (-not $isInstall -and (Test-Path $Dir) -and (Get-ChildItem -Force $Dir | Select-Object -First 1)) {
    Stop-Install "$Dir already has other files in it." "Choose another folder, for example: -Dir `"$env:USERPROFILE\Imagination-app`""
  }

  $title = 'Imagination Is All You Need: installer'
  if ($DryRun) { $title += ' (dry run: nothing will change)' }
  Bold $title
  Say 'This will:'
  Say '  1. Check for git, Node.js and ffmpeg, and offer to install any that are missing'
  if ($isInstall) { Say "  2. Update the app already in $Dir (your library and keys stay as they are)" }
  elseif ($Branch -ne 'main') { Say "  2. Download the app into $Dir (branch $Branch)" }
  else { Say "  2. Download the app into $Dir" }
  Say "  3. Install the app's own parts (no AI models, no keys)"
  if (-not $NoShortcut) { Say '  4. Offer a desktop shortcut' }
  if (-not $NoStart) { Say '  5. Start the app and open it in your browser' }
  Say ''

  # ---- 1. tools ----------------------------------------------------------------------------------
  Bold '1. Checking your computer'
  $missing = @()
  foreach ($t in 'git', 'node', 'ffmpeg') {
    if (HasTool $t) {
      switch ($t) {
        'git'    { Ok ((& git --version) | Out-String).Trim() }
        'node'   { Ok ("Node.js " + (& node --version) + ", npm " + (& npm.cmd --version)) }
        'ffmpeg' { Ok 'ffmpeg' }
      }
    } elseif ($t -eq 'node' -and (Has 'node')) {
      Miss ("Node.js " + (& node --version) + " is too old (or npm is missing): the app needs Node.js 20 or newer"); $missing += $t
    } else { Miss "$($describe[$t]) is missing"; $missing += $t }
  }
  if ($missing.Count -gt 0) {
    $hasWinget = Has 'winget'
    foreach ($t in $missing) {
      Say ''
      if (-not $hasWinget) {
        if ($t -eq 'ffmpeg') { Say 'Skipping ffmpeg for now: you can add it later.'; continue }
        Say 'winget (the Windows package manager) is not available here.'; Show-ManualSteps; return
      }
      $wingetArgs = @('install', '--id', $wingetId[$t], '-e', '--source', 'winget')
      # -Yes: also accept winget's source and package agreements, so it doesn't stop to ask. Without it, winget asks you itself.
      if ($Yes) { $wingetArgs += @('--accept-source-agreements', '--accept-package-agreements', '--silent') }
      Say "$($describe[$t]): this command installs it: winget install --id $($wingetId[$t]) -e"
      if (-not (Ask "Install $t now?")) {
        if ($t -eq 'ffmpeg') { Say "Skipping ffmpeg: you can install it later with: winget install --id $($wingetId[$t]) -e"; continue }
        Show-ManualSteps; return
      }
      if (-not (Run 'winget' $wingetArgs)) {
        if ($t -eq 'ffmpeg') { Say "ffmpeg didn't install; you can add it later."; continue }
        Show-ManualSteps; Stop-Install "$t didn't install (see the messages above)." ''
      }
    }
    if (-not $DryRun) {
      Update-Path
      if (-not (HasTool 'git')) { Show-ManualSteps; Stop-Install "git still isn't available." 'If it just installed, open a new PowerShell window and run the install line again.' }
      if (-not (HasTool 'node')) { Show-ManualSteps; Stop-Install "Node.js 20 or newer (with npm) still isn't available." 'If it just installed, open a new PowerShell window and run the install line again.' }
    }
  }
  Say ''

  # ---- 2. the app folder -------------------------------------------------------------------------
  if ($isInstall) {
    Bold "2. Updating the app in $Dir"
    # npm run update never touches server\data or .env.local, and refuses when files were changed by hand.
    $updateArgs = @('run', 'update'); if ($Branch -ne 'main') { $updateArgs += @('--', '--force-branch') }
    Push-Location $Dir
    try { $updated = Run 'npm.cmd' $updateArgs } finally { Pop-Location }
    if (-not $updated) { Say "Couldn't update (see above), so the version you have stays. That's fine: carrying on." }
  } else {
    Bold "2. Downloading the app into $Dir"
    $parent = Split-Path -Parent $Dir
    if (-not $DryRun) { New-Item -ItemType Directory -Force -Path $parent | Out-Null } else { Say "  + create folder $parent" }
    if (-not (Run 'git' @('clone', '--depth', '1', '--branch', $Branch, $repoUrl, $Dir))) {
      Stop-Install "Couldn't download the app." 'Check your internet connection and run the install line again.'
    }
  }
  Say ''

  # ---- 3. setup ----------------------------------------------------------------------------------
  Bold "3. Installing the app's parts (this takes a few minutes the first time)"
  if ($DryRun) { Say "  + cd $Dir"; Say '  + npm.cmd run setup -- --no-start' }
  else {
    Push-Location $Dir
    try { & npm.cmd run setup '--' '--no-start'; $st = $LASTEXITCODE } finally { Pop-Location }
    # setup's own check: 0 = ready, 1 = something optional is missing (it says what), 2 = the app can't start yet.
    if ($st -ge 2) { Stop-Install "The app isn't ready to start yet." "Fix the lines marked with a cross above, then run: cd `"$Dir`"; npm.cmd run setup" }
  }
  Say ''

  # ---- 4. shortcut -------------------------------------------------------------------------------
  $madeShortcut = $false
  if (-not $NoShortcut) {
    Bold '4. Desktop shortcut'
    if (Ask 'Add an Imagination shortcut to your desktop?') {
      $lnk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Imagination.lnk'
      $nodeDir = ''; $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
      if ($nodeCmd) { $nodeDir = Split-Path -Parent $nodeCmd.Source }
      if ($DryRun) { Say "  + create shortcut $lnk" }
      else {
        # A Command Prompt window that runs the app: closing it stops the app.
        $s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
        $s.TargetPath = $env:ComSpec
        $s.Arguments = "/k set `"PATH=$nodeDir;%PATH%`" && npm.cmd run setup -- --open"
        $s.WorkingDirectory = $Dir
        $s.Description = 'Start Imagination Is All You Need and open it in your browser'
        $ico = Join-Path $Dir 'web\public\favicon.ico'
        if (Test-Path $ico) { $s.IconLocation = $ico }
        $s.Save()
      }
      Ok 'Added Imagination to your desktop'; $madeShortcut = $true
    } else { Say 'No shortcut.' }
    Say ''
  }

  # ---- 5. start ----------------------------------------------------------------------------------
  $again = "cd `"$Dir`"; npm.cmd run setup"
  if ($NoStart) { Bold "Installed. Start it any time with: $again"; return }
  Bold '5. Starting the app'
  Say "Your browser opens by itself when it's ready. Keep this window open while you use it; Ctrl+C stops it."
  if ($madeShortcut) { Say "Start it again later with the Imagination shortcut, or: $again" } else { Say "Start it again later with: $again" }
  Say ''
  if ($DryRun) { Say "  + cd $Dir"; Say '  + npm.cmd run setup -- --open'; return }
  Push-Location $Dir
  try { & npm.cmd run setup '--' '--open' } finally { Pop-Location }
}

try {
  Install-Imagination -Yes $Yes.IsPresent -Dir $Dir -Branch $Branch -NoStart $NoStart.IsPresent -NoShortcut $NoShortcut.IsPresent -DryRun $DryRun.IsPresent -Help $Help.IsPresent
} catch {
  if ("$_" -ne 'IIAYN_STOP') { Write-Host "Stopped: $_" -ForegroundColor Red; Write-Host 'Please run the install line again; if it keeps failing, open an issue on GitHub with this message.' }
  # A script run with -File reports failure to its caller (CI); a pasted "| iex" keeps your window open.
  if ($MyInvocation.MyCommand.Path) { exit 1 }
}
