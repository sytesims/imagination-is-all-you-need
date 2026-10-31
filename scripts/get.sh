#!/usr/bin/env bash
# Imagination Is All You Need: the one-line installer for macOS and Linux.
#
#   curl -fsSL https://iiayn.app/install | bash
#   curl -fsSL https://iiayn.app/install | bash -s -- --dir ~/Apps/Imagination     (with options)
#
# What it does, in order (it asks before installing anything on your computer):
#   1. Checks for git, Node.js 20 or newer (with npm) and ffmpeg, and offers to install what's missing
#      (Homebrew on macOS, apt or dnf on Linux).
#   2. Downloads the app into ~/Imagination, or updates it if it's already there (your library and keys are never touched).
#   3. Installs the app's own parts (npm run setup -- --no-start). No AI models, no ComfyUI, no keys:
#      you connect those inside the app when you want them.
#   4. Offers a way to start it again later: on macOS, Imagination.app in your Applications folder and Dock;
#      on Linux, an Imagination entry in your apps menu and on your desktop.
#   5. Starts the app (npm run setup) and opens it in your browser.
#
# Windows: use scripts/get.ps1 instead (irm https://iiayn.app/install.ps1 | iex).
set -euo pipefail

# Everything lives in functions and runs from the last line, so a cut-off download never runs half a script.

REPO_URL="${IIAYN_REPO:-https://github.com/sytesims/imagination-is-all-you-need.git}" # IIAYN_REPO: another copy to clone from (tests)
YES=0; DRY=0; START=1; SHORTCUT=1; MADE_SHORTCUT=0; BRANCH=main; DIR="$HOME/Imagination"
APPS_DIR="${IIAYN_APPS_DIR:-/Applications}" # IIAYN_APPS_DIR: another folder instead of /Applications (tests)

usage() { cat <<'EOF'
Install Imagination Is All You Need and open it in your browser.

  curl -fsSL https://iiayn.app/install | bash -s -- [options]

Options:
  --yes            answer yes to every question (installs missing tools, adds the shortcut)
  --dir PATH       where to put the app (default: ~/Imagination)
  --branch NAME    get another branch of the app (for testing; default: main)
  --no-start       install, but don't start the app
  --no-shortcut    don't offer the shortcut (on a Mac: the app in Applications and the Dock)
  --dry-run        show every step, change nothing
  --help           show this help

On a Mac the installer adds Imagination to Applications and your Dock.
EOF
}

# ---- small helpers -----------------------------------------------------------------------------
bold() { printf '\033[1m%s\033[0m\n' "$*"; }
say() { printf '%s\n' "$*"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; }
miss() { printf '  \033[33m✗\033[0m %s\n' "$*"; }
die() { printf '\n\033[31mStopped:\033[0m %s\n' "$1" >&2; [ -n "${2:-}" ] && printf '%s\n' "$2" >&2; exit 1; }
# run CMD...: does it, or with --dry-run only prints it.
run() { if [ "$DRY" = 1 ]; then printf '  + %s\n' "$*"; else "$@"; fi; }
# write FILE: saves what comes in on stdin to FILE, or with --dry-run only says so.
write() { if [ "$DRY" = 1 ]; then printf '  + write %s\n' "$1"; cat >/dev/null; else cat >"$1"; fi; }
have_tty() { { : </dev/tty; } 2>/dev/null; }
# ask "Question?" [yes]: yes/no, default no (or yes when the second word is "yes").
# --yes says yes; with nobody at a keyboard it's no.
ask() {
  if [ "$YES" = 1 ]; then say "$1 yes (--yes)"; return 0; fi
  if ! have_tty; then say "$1 no (nobody to answer; add --yes to say yes)"; return 1; fi
  local a="" hint="[y/N]"; [ "${2:-}" = yes ] && hint="[Y/n]"
  printf '%s %s ' "$1" "$hint" >/dev/tty; read -r a </dev/tty || a=""
  [ -z "$a" ] && [ "${2:-}" = yes ] && return 0
  case "$a" in [yY]|[yY][eE][sS]) return 0;; *) return 1;; esac
}
# as_root CMD...: runs a system command with sudo (never silently: callers say so first). Root needs no sudo.
as_root() { if [ "$(id -u)" = 0 ]; then run "$@"; else run sudo "$@"; fi; }

# ---- 1. tools ----------------------------------------------------------------------------------
has_git() {
  command -v git >/dev/null 2>&1 || return 1
  # macOS ships a stand-in git that only offers to install Apple's developer tools: that one doesn't count yet.
  if [ "$OS" = Darwin ] && [ "$(command -v git)" = /usr/bin/git ]; then xcode-select -p >/dev/null 2>&1 || return 1; fi
}
node_major() { node --version 2>/dev/null | sed -n 's/^v\([0-9]*\).*/\1/p'; }
has_node() { command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1 && [ "$(node_major)" -ge 20 ] 2>/dev/null; }
has_ffmpeg() { command -v ffmpeg >/dev/null 2>&1 && command -v ffprobe >/dev/null 2>&1; }

find_brew() {
  local b; for b in "$(command -v brew 2>/dev/null || true)" /opt/homebrew/bin/brew /usr/local/bin/brew; do
    if [ -n "$b" ] && [ -x "$b" ]; then eval "$("$b" shellenv)"; return 0; fi; done; return 1
}

# The package manager's name for each tool, and how to install it by hand.
pkg_for() { # pkg_for TOOL
  case "$PM:$1" in
    brew:node) echo node;; brew:*) echo "$1";;
    apt:node) echo "nodejs npm";; apt:*) echo "$1";;
    dnf:node) echo "nodejs npm";; dnf:ffmpeg) echo ffmpeg-free;; dnf:*) echo "$1";;
  esac
}
manual_steps() {
  say ""; say "To install them yourself:"
  case "$OS" in
    Darwin) say "  1. Install Homebrew: https://brew.sh"; say "  2. In Terminal: brew install git node ffmpeg";;
    *) say "  git and ffmpeg: your system's package manager (for example: sudo apt install git ffmpeg)"
       say "  Node.js 22 or 24 (with npm): https://nodejs.org/en/download";;
  esac
  say "Then run the install line again."
}
describe() { case "$1" in
  git) echo "git (downloads the app and its updates)";;
  node) echo "Node.js 20 or newer, with npm (runs the app)";;
  ffmpeg) echo "ffmpeg (handles video and audio; optional, browsing works without it)";; esac; }

check_tools() {
  bold "1. Checking your computer"
  local t missing=()
  for t in git node ffmpeg; do
    if "has_$t"; then case "$t" in
        git) ok "$(git --version)";; node) ok "Node.js $(node --version), npm $(npm --version)";; ffmpeg) ok "ffmpeg";; esac
    else
      if [ "$t" = node ] && command -v node >/dev/null 2>&1; then miss "Node.js $(node --version) is too old (or npm is missing): the app needs Node.js 20 or newer"
      else miss "$(describe "$t") is missing"; fi
      missing+=("$t")
    fi
  done
  [ ${#missing[@]} = 0 ] && return 0

  # Which package manager can install them?
  PM=""
  if [ "$OS" = Darwin ]; then
    if find_brew; then PM=brew
    else
      say ""; say "Homebrew is the usual way to add tools like these on macOS (https://brew.sh)."
      say "Its installer asks for your password and also installs Apple's command line tools."
      if ask "Install Homebrew now?"; then
        # Homebrew's official install command, as printed on https://brew.sh
        if [ "$DRY" = 1 ]; then run /bin/bash -c '$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)'; PM=brew
        else
          local hb_in=/dev/null; have_tty && hb_in=/dev/tty
          local hb_env=(); [ "$YES" = 1 ] && hb_env=(NONINTERACTIVE=1) # --yes: Homebrew doesn't stop to ask either
          env ${hb_env[@]+"${hb_env[@]}"} /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" <"$hb_in" \
            || die "Homebrew didn't install." "See https://brew.sh, then run the install line again."
          find_brew && PM=brew
        fi
      fi
    fi
  elif command -v apt-get >/dev/null 2>&1; then PM=apt
  elif command -v dnf >/dev/null 2>&1; then PM=dnf
  fi

  local apt_updated=0
  for t in "${missing[@]}"; do
    say ""
    if [ -z "$PM" ]; then
      [ "$t" = ffmpeg ] && { say "Skipping ffmpeg for now: you can add it later."; continue; }
      manual_steps; exit 0
    fi
    local pkg; pkg="$(pkg_for "$t")"
    local how="brew install $pkg"
    [ "$PM" = apt ] && how="sudo apt-get install -y $pkg"; [ "$PM" = dnf ] && how="sudo dnf install -y $pkg"
    say "$(describe "$t"): this command installs it: $how"
    [ "$PM" != brew ] && [ "$(id -u)" != 0 ] && say "It uses sudo, so your computer may ask for your password."
    if ! ask "Install $t now?"; then
      if [ "$t" = ffmpeg ]; then say "Skipping ffmpeg: you can install it later with: $how"; continue; fi
      manual_steps; exit 0
    fi
    # shellcheck disable=SC2086 # $pkg can be two package names
    case "$PM" in
      brew) run brew install $pkg;;
      apt) [ $apt_updated = 1 ] || { as_root apt-get update; apt_updated=1; }; as_root apt-get install -y $pkg;;
      dnf) as_root dnf install -y $pkg;;
    esac || { [ "$t" = ffmpeg ] && { say "ffmpeg didn't install; you can add it later."; continue; }; die "$t didn't install (see the messages above)." "$(manual_steps)"; }
  done
  hash -r
  [ "$DRY" = 1 ] && return 0
  # Check again: the required ones must work now.
  has_git || die "git still isn't available." "$(manual_steps)"
  has_node || die "Node.js 20 or newer (with npm) still isn't available$(command -v node >/dev/null && echo ": this computer has $(node --version)")." \
    "Install Node.js 22 or 24 from https://nodejs.org/en/download (it shows a few easy ways), then run the install line again."
}

# ---- 2. the app folder -------------------------------------------------------------------------
is_install() { [ -d "$1/.git" ] && [ -f "$1/scripts/setup.mjs" ]; }

get_app() {
  if [ "$MODE" = update ]; then
    bold "2. Updating the app in $DIR"
    local force=(); [ "$BRANCH" != main ] && force=(-- --force-branch)
    # npm run update never touches server/data or .env.local, and refuses when files were changed by hand.
    (cd "$DIR" && run npm run update ${force[@]+"${force[@]}"}) || say "Couldn't update (see above), so the version you have stays. That's fine: carrying on."
  else
    bold "2. Downloading the app into $DIR"
    run mkdir -p "$(dirname "$DIR")"
    run git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$DIR" || die "Couldn't download the app." "Check your internet connection and run the install line again."
  fi
}

# ---- 3. setup ----------------------------------------------------------------------------------
set_up() {
  bold "3. Installing the app's parts (this takes a few minutes the first time)"
  local st=0
  if [ "$DRY" = 1 ]; then run cd "$DIR"; run npm run setup -- --no-start; return 0; fi
  (cd "$DIR" && npm run setup -- --no-start) || st=$?
  # setup's own check: 0 = ready, 1 = something optional is missing (it says what), 2 = the app can't start yet.
  [ "$st" -ge 2 ] && die "The app isn't ready to start yet." "Fix the lines marked ✗ above, then run: cd \"$DIR\" && npm run setup"
  return 0
}

# ---- 4. shortcut -------------------------------------------------------------------------------
add_shortcut() {
  [ "$SHORTCUT" = 1 ] || return 0
  case "$DIR" in *[\"\$\`\\]*) say "Skipping the shortcut: the folder name has characters a shortcut can't hold."; return 0;; esac
  if [ "$OS" = Darwin ]; then add_mac_app; else add_linux_shortcut; fi
}

# The desktop file older installers wrote on macOS, except its PATH line (that one depends on where Node.js was).
old_command_text() { cat <<EOF
#!/bin/bash
# Starts Imagination Is All You Need and opens it in your browser. Close this window (or press Ctrl+C) to stop it.
cd "$DIR" || { echo "The app isn't in $DIR any more."; exit 1; }
exec npm run setup -- --open
EOF
}

# url_path PATH: PATH for a file:// address, the way macOS writes it (bytes outside the safe set as %XX, e.g. "é" and spaces)
url_path() {
  local LC_ALL=C s="$1" out="" c i
  for ((i = 0; i < ${#s}; i++)); do
    c="${s:i:1}"
    case "$c" in
      [A-Za-z0-9/._~!\$\&\(\)*+,\;=:@-]|"'") out+="$c";;
      *) out+="$(printf '%%%02X' $(( $(printf '%d' "'$c") & 255 )))";;
    esac
  done
  printf '%s' "$out"
}

# macOS: Imagination.app (built by scripts/make-mac-app.sh) in Applications, pinned to the Dock.
add_mac_app() {
  bold "4. The Imagination app"
  ask "Add Imagination to your Applications folder and Dock?" yes || { say "Not added."; return 0; }
  local apps="$APPS_DIR"
  if [ ! -w "$apps" ]; then
    apps="$HOME/Applications"
    say "$APPS_DIR needs an administrator to change, so Imagination goes in the Applications folder in your home folder ($apps)."
  fi
  local app="$apps/Imagination.app"
  # Replace an Imagination.app from an earlier install, never someone else's.
  if [ -e "$app" ] && [ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app/Contents/Info.plist" 2>/dev/null)" != app.iiayn.launcher ]; then
    say "There's already a different app called Imagination in $apps, so it stays as it is and nothing was added."
    say "To add ours later, move that one away and run: cd \"$DIR\" && npm run mac-app"
    return 0
  fi
  if [ "$DRY" = 1 ]; then run bash "$DIR/scripts/make-mac-app.sh" --repo "$DIR" --dest "$apps"
  else bash "$DIR/scripts/make-mac-app.sh" --repo "$DIR" --dest "$apps" >/dev/null || { say "Couldn't build the Imagination app (see above)."; return 0; }
  fi

  # Pin it to the Dock unless it's already there: a new persistent-apps tile, then restart the Dock to show it.
  local url tiles; url="file://$(url_path "$app")/"
  tiles="$(defaults read com.apple.dock persistent-apps 2>/dev/null || true)"
  if [[ "$tiles" == *"\"$url\""* ]]; then ok "Already in your Dock"
  else
    run defaults write com.apple.dock persistent-apps -array-add \
      "<dict><key>tile-data</key><dict><key>file-data</key><dict><key>_CFURLString</key><string>$url</string><key>_CFURLStringType</key><integer>15</integer></dict></dict><key>tile-type</key><string>file-tile</string></dict>"
    run killall Dock
  fi

  # The desktop shortcut earlier installers made isn't needed any more (only removed when it's exactly ours).
  local old="$HOME/Desktop/Imagination.command"
  if [ -f "$old" ] && [ "$(grep -v '^export PATH=' "$old")" = "$(old_command_text)" ]; then
    run rm "$old"; say "Removed the old Imagination.command shortcut from your desktop."
  fi
  ok "Imagination is in your Applications folder and Dock. Click it any time to start it."; MADE_SHORTCUT=1
}

# Linux: an entry in the apps menu, and a copy on the desktop.
add_linux_shortcut() {
  bold "4. Desktop shortcut"
  ask "Add an Imagination shortcut to your desktop?" || { say "No shortcut."; return 0; }
  local nodedir; nodedir="$(dirname "$(command -v node 2>/dev/null || echo /usr/local/bin/node)")"
  case "$nodedir" in *[\"\$\`\\]*) say "Skipping the shortcut: the folder name has characters a shortcut can't hold."; return 0;; esac
  local apps="${XDG_DATA_HOME:-$HOME/.local/share}/applications" desk
  desk="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")"
  run mkdir -p "$apps"
  write "$apps/imagination.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Imagination
Comment=Start Imagination Is All You Need and open it in your browser
Path=$DIR
Exec=env "PATH=$nodedir:/usr/local/bin:/usr/bin:/bin" npm run setup -- --open
Icon=$DIR/web/public/app-icon-512.png
Terminal=true
Categories=Graphics;
EOF
  run chmod +x "$apps/imagination.desktop"
  if [ -d "$desk" ] || [ "$DRY" = 1 ]; then
    run cp "$apps/imagination.desktop" "$desk/imagination.desktop"; run chmod +x "$desk/imagination.desktop"
    # GNOME only launches desktop files marked as trusted.
    [ "$DRY" = 1 ] || gio set "$desk/imagination.desktop" metadata::trusted true 2>/dev/null || true
  fi
  ok "Added Imagination to your apps menu$([ -d "$desk" ] && echo " and desktop")"; MADE_SHORTCUT=1
}

# ---- 5. start ----------------------------------------------------------------------------------
start_app() {
  local again="cd \"$DIR\" && npm run setup"
  if [ "$START" = 0 ]; then say ""; bold "Installed. Start it any time with: $again"; return 0; fi
  bold "5. Starting the app"
  say "Your browser opens by itself when it's ready. Keep this window open while you use it; Ctrl+C stops it."
  say "Start it again later with $([ "$MADE_SHORTCUT" = 1 ] && echo "the Imagination $([ "$OS" = Darwin ] && echo app || echo shortcut), or: " || echo ": ")$again"
  say ""
  if [ "$DRY" = 1 ]; then run cd "$DIR"; run npm run setup -- --open; return 0; fi
  cd "$DIR"
  # Hand the keyboard back to the app (this script itself may have come in through a pipe).
  if have_tty; then exec npm run setup -- --open </dev/tty; else exec npm run setup -- --open; fi
}

main() {
  while [ $# -gt 0 ]; do case "$1" in
    --yes|-y) YES=1;; --dry-run) DRY=1;; --no-start) START=0;; --no-shortcut) SHORTCUT=0;;
    --dir) [ $# -ge 2 ] || die "--dir needs a folder."; DIR="$2"; shift;;
    --branch) [ $# -ge 2 ] || die "--branch needs a name."; BRANCH="$2"; shift;;
    -h|--help) usage; exit 0;;
    *) usage >&2; die "Unknown option: $1";;
  esac; shift; done

  OS="$(uname -s)"
  case "$OS" in Darwin|Linux) ;; *) die "This installer is for macOS and Linux." "On Windows, open PowerShell and run: irm https://iiayn.app/install.ps1 | iex";; esac
  case "$DIR" in "~"*) DIR="$HOME${DIR#\~}";; /*) ;; *) DIR="$PWD/$DIR";; esac
  DIR="${DIR%/}"
  MODE=install
  if is_install "$DIR"; then MODE=update
  elif [ -e "$DIR" ] && [ -n "$(ls -A "$DIR" 2>/dev/null)" ]; then
    die "$DIR already has other files in it." "Choose another folder, for example: --dir \"$HOME/Imagination-app\""
  fi

  bold "Imagination Is All You Need: installer$([ "$DRY" = 1 ] && echo " (dry run: nothing will change)")"
  say "This will:"
  say "  1. Check for git, Node.js and ffmpeg, and offer to install any that are missing"
  if [ "$MODE" = update ]; then say "  2. Update the app already in $DIR (your library and keys stay as they are)"
  else say "  2. Download the app into $DIR$([ "$BRANCH" != main ] && echo " (branch $BRANCH)")"; fi
  say "  3. Install the app's own parts (no AI models, no keys)"
  if [ "$SHORTCUT" = 1 ]; then
    if [ "$OS" = Darwin ]; then say "  4. Offer to add Imagination to your Applications folder and Dock"; else say "  4. Offer a desktop shortcut"; fi
  fi
  [ "$START" = 1 ] && say "  5. Start the app and open it in your browser"
  say ""

  check_tools; say ""
  get_app; say ""
  set_up; say ""
  add_shortcut; [ "$SHORTCUT" = 1 ] && say ""
  start_app
}

main "$@"
