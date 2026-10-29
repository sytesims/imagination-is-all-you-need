#!/usr/bin/env bash
# Install the pinned custom-node packs from readiness/manifest/custom-nodes.json into a ComfyUI install.
# Usage: npm run nodes:install -- /path/to/ComfyUI   (then: npm run models:download -- /path/to/ComfyUI)
set -euo pipefail
COMFY="${1:?usage: install-custom-nodes.sh /path/to/ComfyUI}"
MANIFEST="$(cd "$(dirname "$0")" && pwd)/custom-nodes.json"
PY="${PYTHON:-python3}"
[ -d "$COMFY/custom_nodes" ] || { echo "no custom_nodes dir in $COMFY"; exit 1; }
core_pin=$("$PY" -c "import json;print(json.load(open('$MANIFEST'))['packs']['ComfyUI (core)']['pin'])")
have=$(git -C "$COMFY" rev-parse HEAD 2>/dev/null || echo unknown)
[ "$have" = "$core_pin" ] || echo "WARN: ComfyUI core is $have, manifest validated against $core_pin"
"$PY" -c "import json
for k,p in json.load(open('$MANIFEST'))['packs'].items():
  if p['dir'] and not p.get('optional') and p.get('pin'): print(p['dir'], p['repo'], p['pin'])  # optional packs (e.g. ComfyUI-GGUF) are metadata only" | while read -r dir repo pin; do
  d="$COMFY/custom_nodes/$dir"
  if [ ! -d "$d/.git" ]; then git init -q "$d"; git -C "$d" remote add origin "$repo"; fi
  for try in 1 2 3; do
    [ "$(git -C "$d" rev-parse HEAD 2>/dev/null)" = "$pin" ] && break
    git -C "$d" fetch -q --depth 1 origin "$pin" && git -C "$d" checkout -q FETCH_HEAD || { echo "retry $dir ($try)"; sleep 3; }
  done
  [ "$(git -C "$d" rev-parse HEAD 2>/dev/null)" = "$pin" ] || { echo "ERROR: could not fetch $dir @ $pin from $repo" >&2; exit 1; }
  if [ -f "$d/.gitmodules" ]; then git -C "$d" submodule update -q --init --recursive --depth 1 || { echo "ERROR: submodules failed for $dir" >&2; exit 1; }; fi
  # local fixes listed in the manifest (patches/<pack>/*.patch, credited inside): applied once, skipped when already in
  for pf in $("$PY" -c "import json;[print(x) for x in json.load(open('$MANIFEST'))['packs'].get('$dir',{}).get('patches',[])]" 2>/dev/null || true); do
    f="$(dirname "$MANIFEST")/$pf"
    if git -C "$d" apply --reverse --check "$f" 2>/dev/null; then echo "  patch already in: $pf"
    elif git -C "$d" apply "$f"; then echo "  patched: $pf"
    else echo "WARN: could not apply $pf to $dir" >&2; fi
  done
  echo "ok $dir @ ${pin:0:10}"
  # a pack may list its own pip set (custom-nodes.json "pip") instead of its requirements.txt (Qwen3 TTS: the file pins packages that break a current ComfyUI)
  pips=$("$PY" -c "import json;print(' '.join(json.load(open('$MANIFEST'))['packs'].get('$dir',{}).get('pip') or []))" 2>/dev/null || true)
  if [ -n "$pips" ]; then "$PY" -m pip install -q $pips || true
  else [ -f "$d/requirements.txt" ] && "$PY" -m pip install -q -r "$d/requirements.txt" || true; fi
done
