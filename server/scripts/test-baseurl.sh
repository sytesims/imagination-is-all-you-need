#!/bin/bash
# Runs the tests that need a live server URL (test/<name>.test.ts <baseUrl>) against a throwaway MOCK server
# on its own port and scratch data dir (never :8787). Usage: scripts/test-baseurl.sh [port] [test-name ...]
# Default tests: cinema-composer elements-photofx. Exit code = number of failed tests. Logs: $LOG_DIR (default $TMPDIR).
set -u
cd "$(dirname "$0")/.."
PORT=${1:-8984}; shift || true
TESTS=${*:-cinema-composer elements-photofx}
[ "$PORT" = 8787 ] || [ "$PORT" = 8788 ] || [ "$PORT" = 8790 ] && { echo "refusing port $PORT"; exit 99; }
SCR=${TMPDIR:-/tmp}; D=$(mktemp -d "$SCR/baseurl-data.XXXX"); L=${LOG_DIR:-$SCR}; mkdir -p "$L"
env PORT=$PORT OPENHIGGSFIELD_DATA_DIR=$D OPENHIGGSFIELD_BACKEND=mock OPENHIGGSFIELD_MOCK_KEYS=1 OPENHIGGSFIELD_HOSTED= OPENHIGGSFIELD_MOCK_DELAY_MS=100 \
  OPENHIGGSFIELD_FILMING_FILE="$D/no-filming.json" OPENHIGGSFIELD_ENV_FILE="$D/.env.local" \
  OPENHIGGSFIELD_BFL_API_KEY= OPENHIGGSFIELD_FAL_KEY= FAL_KEY= OPENHIGGSFIELD_REPLICATE_API_TOKEN= REPLICATE_API_TOKEN= COMFY_API_KEY= \
  ../node_modules/.bin/tsx src/index.ts > "$L/baseurl-server-$PORT.log" 2>&1 &
SRV=$!; trap 'kill $SRV 2>/dev/null; wait $SRV 2>/dev/null; rm -rf "$D"' EXIT
for i in $(seq 60); do curl -sf "http://localhost:$PORT/api/config" >/dev/null && break; sleep 1; done
FAILS=0
for t in $TESTS; do timeout 300 ../node_modules/.bin/tsx "test/$t.test.ts" "http://localhost:$PORT" > "$L/$t.test.ts.log" 2>&1; c=$?; echo "$t.test.ts $c"; [ $c = 0 ] || FAILS=$((FAILS+1)); done
exit $FAILS
