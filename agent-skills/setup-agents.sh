#!/usr/bin/env bash
# One-command agent setup: ./agent-skills/setup-agents.sh claude|chatgpt|all [--api URL] [--public-url URL] [--npx] [--home DIR] [--dry-run]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Build when dist is missing or older than src (dist is git-ignored, so a pull can leave it behind; stdio agents run dist/index.js).
if [ ! -f "$ROOT/mcp/dist/setup.js" ] || [ ! -f "$ROOT/mcp/dist/index.js" ] || [ -n "$(find "$ROOT/mcp/src" -name '*.ts' -newer "$ROOT/mcp/dist/index.js" -print -quit)" ]; then
  echo "[setup] building the MCP server (mcp/dist is missing or older than mcp/src)"
  (cd "$ROOT/mcp" && { [ -d node_modules ] || npm install --no-audit --no-fund; } && npm run build)
fi
exec node "$ROOT/mcp/dist/index.js" setup "$@"
