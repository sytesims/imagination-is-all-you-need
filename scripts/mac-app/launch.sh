#!/bin/bash
# The Imagination Mac app's launcher (copied into Imagination.app/Contents/Resources by scripts/make-mac-app.sh).
#
#   launch.sh          open the app: start it in the background when it isn't running, wait until it answers, open the browser
#   launch.sh --stop   stop the copy this launcher started (by its saved process id and process group only)
#   launch.sh --status print running | starting | stopped
#
# Output for the app around it: on failure, a friendly message on stdout and exit 1 (anything else a command prints goes
# to the log, so it never replaces the message). "Imagination is already starting." with exit 0: another click is starting it.
# Settings (all optional, for custom ports and safe tests): PORT, WEB_PORT, OPENHIGGSFIELD_ENV_FILE,
# IMAGINATION_REPO (instead of Contents/Resources/repo-path), IMAGINATION_START_TIMEOUT (seconds),
# IMAGINATION_NO_NOTIFY=1 (no "Starting Imagination…" notification). Every other variable is passed on to the app.
set -u

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="${IMAGINATION_REPO:-$(cat "$HERE/repo-path" 2>/dev/null)}"
SUPPORT="$HOME/Library/Application Support/Imagination"
LOGS="$HOME/Library/Logs/Imagination"
LOG="$LOGS/app.log"
PIDFILE="$SUPPORT/app.pid" # line 1: the process id of the copy we started, line 2: its app folder
LOCK="$SUPPORT/launch.lock" # a link to the process id of the launcher that is starting it

mkdir -p "$SUPPORT" "$LOGS" 2>/dev/null
if { : >> "$LOG"; } 2>/dev/null; then exec 2>>"$LOG"; else exec 2>/dev/null; fi

fail() { printf '%s\n' "$1"; exit 1; }
notify() { [ -n "${IMAGINATION_NO_NOTIFY:-}" ] || osascript -e "display notification \"$1\" with title \"Imagination\"" >/dev/null 2>&1 || true; }

# Ports: the shell first, then these two lines of the settings file (the same lookup npm run setup does, first line wins;
# nothing else is read).
ENV_FILE="${OPENHIGGSFIELD_ENV_FILE:-$REPO/.env.local}"
setting() {
  local v="${!1:-}"
  [ -z "$v" ] && [ -f "$ENV_FILE" ] && v="$(grep -E "^[[:space:]]*$1[[:space:]]*=" "$ENV_FILE" 2>/dev/null | head -n 1 | sed -E 's/^[^=]*=[[:space:]]*//; s/[[:space:]]*(#.*)?$//; s/^["'\'']//; s/["'\'']$//')"
  printf '%s' "${v:-$2}"
}
API_PORT="$(setting PORT 8787)"; WEB_PORT="$(setting WEB_PORT 5174)"
[[ "$API_PORT$WEB_PORT" =~ ^[0-9]+$ ]] || fail "Imagination's PORT or WEB_PORT setting isn't a number. Fix it in .env.local in the app folder."
URL="http://localhost:$WEB_PORT/"

web_up() { curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$WEB_PORT/"; }
api_up() { curl -sf -o /dev/null --max-time 2 "http://127.0.0.1:$API_PORT/api/health"; }
ready() { web_up && api_up; }
# something already listens on our ports (a copy started in a terminal, or one reloading after an update)
port_busy() { lsof -ti "tcp:$WEB_PORT" -sTCP:LISTEN >/dev/null 2>&1 || lsof -ti "tcp:$API_PORT" -sTCP:LISTEN >/dev/null 2>&1; }
# wait up to $1 seconds for the app to answer
wait_ready() { local end=$((SECONDS + $1)); until ready; do (( SECONDS >= end )) && return 1; sleep 1; done; }
# the saved process, only while it is still the app we started: setup.mjs, leading its own process group (guards against
# a reused process id, and against ever signalling a group that isn't ours)
our_pid() {
  local pid; pid="$(head -n 1 "$PIDFILE" 2>/dev/null)"
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  ps -p "$pid" -o command= 2>/dev/null | grep -q 'scripts/setup.mjs' || return 1
  [ "$(ps -p "$pid" -o pgid= 2>/dev/null | tr -d ' ')" = "$pid" ] || return 1
  printf '%s' "$pid"
}
# the log of the latest start only (from its "===" line), without colour codes
last_lines() { awk '/^=== /{n=0; next} {l[n++]=$0} END{for(i=(n>15?n-15:0);i<n;i++) print l[i]}' "$LOG" 2>/dev/null | sed -E $'s/\x1b\\[[0-9;]*m//g'; }
# keep the log small: over 2 MB, keep its last 1 MB (in place, so the running app keeps appending to the same file)
trim_log() {
  [ "$(wc -c < "$LOG" 2>/dev/null || echo 0)" -gt 2097152 ] || return 0
  tail -c 1048576 "$LOG" | tail -n +2 > "$LOG.tmp" && cat "$LOG.tmp" > "$LOG"; rm -f "$LOG.tmp"
}

case "${1:-}" in
  --status) # (the app asks every few seconds while it is open: a good moment to keep the log small)
    trim_log
    if ready; then echo running; elif our_pid >/dev/null; then echo starting; else echo stopped; fi; exit 0 ;;
  --stop)
    if ! pid="$(our_pid)"; then
      web_up || api_up || fail "Imagination isn't running."
      fail "Imagination wasn't started from this app, so it can't stop it. If you started it in a terminal, press Ctrl+C there."
    fi
    kill -TERM -- "-$pid" # its own process group: setup, npm and the servers
    for _ in $(seq 1 20); do kill -0 "$pid" 2>/dev/null || break; sleep 0.5; done
    kill -0 -- "-$pid" 2>/dev/null && kill -KILL -- "-$pid"
    rm -f "$PIDFILE"; echo "Imagination stopped."; exit 0 ;;
  "") ;;
  *) fail "Unknown option $1 (use --stop or --status)." ;;
esac

trim_log

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
  kill -KILL "$shell_pid" 2>/dev/null # an interactive shell ignores a plain kill
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
[ -d "$SUPPORT" ] || fail "Imagination couldn't create $SUPPORT."

# 2. one start at a time: a second click while starting waits for the first one instead of starting another copy.
# The lock is a link to the launcher's process id; one left behind by a launcher that is gone is cleared.
[ -d "$LOCK" ] && [ ! -L "$LOCK" ] && rm -rf "$LOCK" # (ln would put the link inside a folder and "succeed")
if ! ln -s "$$" "$LOCK" 2>/dev/null; then
  holder="$(readlink "$LOCK" 2>/dev/null)"
  if [[ "$holder" =~ ^[0-9]+$ ]] && ps -p "$holder" -o command= 2>/dev/null | grep -q 'launch\.sh'; then echo "Imagination is already starting."; exit 0; fi
  rm -rf "$LOCK"; ln -s "$$" "$LOCK" 2>/dev/null || { echo "Imagination is already starting."; exit 0; }
fi
trap 'rm -f "$LOCK"' EXIT

pid="$(our_pid)"; started=0
if [ -n "$pid" ]; then
  other="$(sed -n 2p "$PIDFILE" 2>/dev/null)"
  [ -z "$other" ] || [ "$other" = "$REPO" ] || fail "Imagination is already running from another folder ($other). Hold Option while opening Imagination and choose Stop Imagination, then open it again."
elif port_busy; then
  # a copy we didn't start is already there (started in a terminal, or reloading after an update): use it, never start a second one
  wait_ready 30 && { open "$URL"; exit 0; }
  fail "Something is using port $WEB_PORT or $API_PORT but Imagination isn't answering there. If Imagination is running in a terminal, give it a moment and open Imagination again."
else
  # 3. start it: the README's own command (npm run setup: installs what's missing, checks, then npm run dev), detached in its
  # own process group so closing this launcher or the browser never stops it
  { echo; echo "=== $(date '+%Y-%m-%d %H:%M:%S') Starting Imagination from $REPO (web $WEB_PORT, api $API_PORT)"; } >> "$LOG"
  cd "$REPO" || fail "Imagination couldn't open $REPO."
  set -m
  PORT="$API_PORT" WEB_PORT="$WEB_PORT" nohup node scripts/setup.mjs >> "$LOG" 2>&1 < /dev/null &
  pid=$!; started=1
  set +m
  printf '%s\n%s\n' "$pid" "$REPO" > "$PIDFILE"
fi
notify "Starting Imagination…"

# 4. wait until it answers (longer on a first start that still has to install), then open the browser
deps_ok() { [ -d "$REPO/node_modules/fastify" ] && [ -d "$REPO/node_modules/tsx" ] && [ -d "$REPO/node_modules/concurrently" ]; }
limit="${IMAGINATION_START_TIMEOUT:-}"; [ -z "$limit" ] && { deps_ok && limit=180 || limit=900; }
start=$SECONDS
until ready; do
  if ! kill -0 "$pid" 2>/dev/null; then
    [ "$(head -n 1 "$PIDFILE" 2>/dev/null)" = "$pid" ] && rm -f "$PIDFILE"
    code=0; [ "$started" = 1 ] && { wait "$pid"; code=$?; }
    [ "$code" = 2 ] && fail "Imagination can't start yet: something it needs is missing. The last lines of its log:

$(last_lines)

Full log: $LOG"
    wait_ready 10 && break  # it found Imagination already running and handed over
    fail "Imagination stopped while starting. The last lines of its log:

$(last_lines)

Full log: $LOG"
  fi
  if (( SECONDS - start > limit )); then
    fail "Imagination is taking longer than usual to start. It is still trying in the background. If it stays like this, hold Option while opening Imagination and choose Stop Imagination, then open it again. The last lines of its log:

$(last_lines)

Full log: $LOG"
  fi
  sleep 1
done
notify "Imagination is ready"
open "$URL"
exit 0
