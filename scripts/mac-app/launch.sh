#!/bin/bash
# The Imagination Mac app's launcher (copied into Imagination.app/Contents/Resources by scripts/make-mac-app.sh).
#
#   launch.sh          open the app: start it in the background when it isn't running, wait until it answers, open the browser
#   launch.sh --stop   stop the copy this launcher started (by its saved process id only)
#   launch.sh --status print running | starting | stopped
#
# Output for the app around it: on failure, a friendly message on stdout and exit 1.
# Settings (all optional, for custom ports and safe tests): PORT, WEB_PORT, OPENHIGGSFIELD_ENV_FILE,
# IMAGINATION_REPO (instead of Contents/Resources/repo-path), IMAGINATION_START_TIMEOUT (seconds),
# IMAGINATION_NO_NOTIFY=1 (no "Starting Imagination…" notification). Every other variable is passed on to the app.
set -u

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="${IMAGINATION_REPO:-$(cat "$HERE/repo-path" 2>/dev/null)}"
SUPPORT="$HOME/Library/Application Support/Imagination"
LOGS="$HOME/Library/Logs/Imagination"
LOG="$LOGS/app.log"
PIDFILE="$SUPPORT/app.pid"
LOCK="$SUPPORT/start.lock"

fail() { printf '%s\n' "$1"; exit 1; }
notify() { [ -n "${IMAGINATION_NO_NOTIFY:-}" ] || osascript -e "display notification \"$1\" with title \"Imagination\"" >/dev/null 2>&1 || true; }

# Ports: the shell first, then these two lines of the settings file (the same lookup npm run setup does; nothing else is read).
ENV_FILE="${OPENHIGGSFIELD_ENV_FILE:-$REPO/.env.local}"
setting() {
  local v="${!1:-}"
  [ -z "$v" ] && [ -f "$ENV_FILE" ] && v="$(grep -E "^[[:space:]]*$1[[:space:]]*=" "$ENV_FILE" 2>/dev/null | tail -n 1 | sed -E 's/^[^=]*=[[:space:]]*//; s/[[:space:]]*(#.*)?$//; s/^["'\'']//; s/["'\'']$//')"
  printf '%s' "${v:-$2}"
}
API_PORT="$(setting PORT 8787)"; WEB_PORT="$(setting WEB_PORT 5174)"
URL="http://localhost:$WEB_PORT/"

web_up() { curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$WEB_PORT/"; }
api_up() { curl -sf -o /dev/null --max-time 2 "http://127.0.0.1:$API_PORT/api/health"; }
ready() { web_up && api_up; }
# the saved process, only while it is still our app (guards against a reused process id)
our_pid() {
  local pid; pid="$(cat "$PIDFILE" 2>/dev/null)" || return 1
  [[ "$pid" =~ ^[0-9]+$ ]] && ps -p "$pid" -o command= 2>/dev/null | grep -q 'scripts/setup.mjs' && printf '%s' "$pid"
}
last_lines() { tail -n 15 "$LOG" 2>/dev/null | sed -E $'s/\x1b\\[[0-9;]*m//g'; }

case "${1:-}" in
  --status)
    if ready; then echo running; elif our_pid >/dev/null; then echo starting; else echo stopped; fi; exit 0 ;;
  --stop)
    if ! pid="$(our_pid)"; then
      web_up || api_up || fail "Imagination isn't running."
      fail "Imagination wasn't started from this app, so it can't stop it. If you started it in a terminal, press Ctrl+C there."
    fi
    kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null # its own process group: setup, npm and the servers
    for _ in $(seq 1 20); do kill -0 "$pid" 2>/dev/null || break; sleep 0.5; done
    kill -0 "$pid" 2>/dev/null && { kill -KILL -- "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null; }
    rm -f "$PIDFILE"; echo "Imagination stopped."; exit 0 ;;
  "") ;;
  *) fail "Unknown option $1 (use --stop or --status)." ;;
esac

# 1. already running: just open it
if ready; then open "$URL"; exit 0; fi

# Apps opened from Finder or the Dock get a bare PATH. First the PATH your terminal has (your shell's startup files, at
# most 5 seconds), then the usual places node lives (Homebrew, nvm, volta, fnm, asdf, mise).
add_path() { [ -d "$1" ] && PATH="$PATH:$1"; return 0; }
if [ -x "${SHELL:-}" ]; then
  shell_out="$(mktemp)"
  "$SHELL" -i -l -c 'printf "\n__PATH__%s\n" "$PATH"' > "$shell_out" 2>/dev/null < /dev/null &
  shell_pid=$!
  for _ in $(seq 1 50); do kill -0 "$shell_pid" 2>/dev/null || break; sleep 0.1; done
  kill "$shell_pid" 2>/dev/null
  login_path="$(sed -n 's/^__PATH__//p' "$shell_out" | tail -n 1)"; rm -f "$shell_out"
  [ -n "$login_path" ] && PATH="$PATH:$login_path"
fi
add_path /opt/homebrew/bin; add_path /usr/local/bin
add_path "$HOME/.volta/bin"; add_path "$HOME/.asdf/shims"; add_path "$HOME/.local/share/mise/shims"; add_path "$HOME/.nodenv/shims"
for d in "$HOME/Library/Application Support/fnm/aliases/default/bin" "$HOME/.local/share/fnm/aliases/default/bin" "$HOME/.fnm/aliases/default/bin"; do add_path "$d"; done
if [ -d "$HOME/.nvm/versions/node" ]; then # newest installed nvm node
  newest="$(ls -1 "$HOME/.nvm/versions/node" 2>/dev/null | sed 's/^v//' | sort -t. -k1,1n -k2,2n -k3,3n | tail -n 1)"
  [ -n "$newest" ] && add_path "$HOME/.nvm/versions/node/v$newest/bin"
fi
export PATH

[ -n "$REPO" ] && [ -f "$REPO/scripts/setup.mjs" ] || fail "Imagination couldn't find its app folder${REPO:+ at $REPO}. Run npm run mac-app in the app folder to rebuild this launcher."
command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1 || fail "Imagination needs Node.js (20 or newer) and npm. Install Node from https://nodejs.org, then open Imagination again."
mkdir -p "$SUPPORT" "$LOGS" || fail "Imagination couldn't create $SUPPORT."

# 2. one start at a time: a second click while starting waits for the first one instead of starting another copy
if ! mkdir "$LOCK" 2>/dev/null; then
  holder="$(cat "$LOCK/pid" 2>/dev/null)"
  if [[ "$holder" =~ ^[0-9]+$ ]] && kill -0 "$holder" 2>/dev/null; then echo "Imagination is already starting."; exit 0; fi
  rm -rf "$LOCK"; mkdir "$LOCK" 2>/dev/null || { echo "Imagination is already starting."; exit 0; }
fi
echo $$ > "$LOCK/pid"
trap 'rm -rf "$LOCK"' EXIT

pid="$(our_pid)"
if [ -z "$pid" ]; then
  # 3. start it: the README's own command (npm run setup: installs what's missing, checks, then npm run dev), detached in its
  # own process group so closing this launcher or the browser never stops it
  { echo; echo "=== $(date '+%Y-%m-%d %H:%M:%S') Starting Imagination from $REPO (web $WEB_PORT, api $API_PORT)"; } >> "$LOG"
  cd "$REPO" || fail "Imagination couldn't open $REPO."
  set -m
  PORT="$API_PORT" WEB_PORT="$WEB_PORT" nohup node scripts/setup.mjs >> "$LOG" 2>&1 < /dev/null &
  pid=$!
  set +m
  echo "$pid" > "$PIDFILE"
fi
notify "Starting Imagination…"

# 4. wait until it answers (longer on a first start that still has to install), then open the browser
limit="${IMAGINATION_START_TIMEOUT:-}"; [ -z "$limit" ] && { [ -d "$REPO/node_modules" ] && limit=90 || limit=900; }
start=$SECONDS
until ready; do
  if ! kill -0 "$pid" 2>/dev/null; then
    rm -f "$PIDFILE"
    fail "Imagination stopped while starting. The last lines of its log:

$(last_lines)

Full log: $LOG"
  fi
  if (( SECONDS - start > limit )); then
    fail "Imagination is taking longer than usual to start. It is still trying in the background. The last lines of its log:

$(last_lines)

Full log: $LOG"
  fi
  sleep 1
done
notify "Imagination is ready"
open "$URL"
exit 0
