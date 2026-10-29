#!/usr/bin/env bash
# Imagination Is All You Need one-command local install.
#   ./scripts/install.sh                      # auto: detect OS/GPU, install the app (real runs once a Comfy key or ComfyUI is connected)
#   ./scripts/install.sh --mock               # development only: sample results, no ComfyUI, no models
#   ./scripts/install.sh --comfy-url http://127.0.0.1:8188            # use a running ComfyUI
#   ./scripts/install.sh --comfy-dir ~/ComfyUI --tools image-upscale,cutout   # pin nodes + download models
#   ./scripts/install.sh --install-comfy ~/ComfyUI --tools starter    # clone ComfyUI at the pinned commit too
# Options:
#   --mock | --comfy           backend (default: comfy; mock = sample results for development and tests)
#   --comfy-url URL            ComfyUI URL (or env OPENHIGGSFIELD_COMFY_URL / COMFY_BASE_URL)
#   --comfy-dir PATH           existing local ComfyUI checkout (runs nodes:install + models:download into it)
#   --install-comfy PATH       clone ComfyUI at the pinned commit into PATH (+ venv, torch for the detected GPU)
#   --tools LIST               comma list of tool ids, or a preset: starter | audio | image | video | all | none
#   --list-tools               print tools with download size / VRAM / Mac status and exit
#   --models-only              only download models for --tools into --comfy-dir (no Node needed; used by docker compose)
#   --yes | -y                 download without asking (ComfyUI clone, custom nodes, models). Required when not in a terminal:
#                              without --yes and without a terminal to ask in, the script prints what it would download and exits 0
#   --dry-run                  print every command instead of running it
#   --skip-build | --skip-nodes | --skip-models
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
MANIFEST=readiness/manifest/models.json
BACKEND=""; COMFY_URL="${OPENHIGGSFIELD_COMFY_URL:-${COMFY_BASE_URL:-}}"; COMFY_DIR=""; INSTALL_COMFY=""
TOOLS=""; MODELS_ONLY=0; YES=0; DRY=0; SKIP_BUILD=0; SKIP_NODES=0; SKIP_MODELS=0; LIST=0
c() { printf '\033[%sm%s\033[0m\n' "$1" "$2"; }; info() { c 36 "==> $*"; }; warn() { c 33 "WARN: $*"; }; die() { c 31 "ERROR: $*"; exit 1; }
run() { if [ $DRY = 1 ]; then echo "+ $*"; else "$@"; fi; }
while [ $# -gt 0 ]; do case "$1" in
  --mock) BACKEND=mock;; --comfy) BACKEND=comfy;;
  --comfy-url) COMFY_URL="$2"; shift;; --comfy-dir) COMFY_DIR="$2"; shift;; --install-comfy) INSTALL_COMFY="$2"; COMFY_DIR="$2"; shift;;
  --tools) TOOLS="$2"; shift;; --models-only) MODELS_ONLY=1; SKIP_BUILD=1; SKIP_NODES=1;; --list-tools) LIST=1;; --yes|-y) YES=1;; --dry-run) DRY=1;;
  --skip-build) SKIP_BUILD=1;; --skip-nodes) SKIP_NODES=1;; --skip-models) SKIP_MODELS=1;;
  -h|--help) sed -n '2,23p' "$0"; exit 0;; *) die "unknown option $1 (see --help)";; esac; shift; done
# Never clone, install or download ComfyUI / custom nodes / models without an explicit yes (one confirmation, see "plan + confirm" below):
# --yes skips it; in a terminal it asks once (default no); with no terminal to ask in and no --yes it prints the plan and exits 0.
NOASK=0; if [ $YES = 0 ] && [ $DRY = 0 ] && [ $LIST = 0 ] && ! [ -t 0 ] && [ -n "$COMFY_DIR$INSTALL_COMFY" ]; then NOASK=1; fi
fetch() { run "$@"; } # download / install steps (git / pip / nodes:install); only reached after the confirmation

# ---- tool id -> manifest workflow prefixes --------------------------------------------------------
tool_prefixes() { case "$1" in
  object-swap) echo "workflows/object-swap";; motion-transfer) echo "workflows/motion-transfer";;
  restyle) echo "workflows/restyle";; reshoot) echo "workflows/reshoot";; camera) echo "workflows/camera-";;
  photo-fx) echo "workflows/photo-fx";; upscale) echo "workflows/upscale-";; create-image) echo "workflows/create-image-";;
  h3-video) echo "workflows/h3-";; audio) echo "workflows/audio-";; soundtrack) echo "workflows/soundtrack-";;
  voice) echo "workflows/voice-";; image-upscale) echo "workflows/image-upscale-";; cutout) echo "plugins/cutout/";;
  cinema|director) echo "workflows/cinema workflows/director";; *) return 1;; esac; }
ALL_TOOLS="object-swap motion-transfer restyle reshoot camera photo-fx upscale create-image h3-video audio soundtrack voice image-upscale cutout cinema"
expand_one() { case "$1" in
  starter) echo "image-upscale cutout";; audio) echo "audio soundtrack";; image) echo "create-image image-upscale cutout";;
  video) echo "object-swap motion-transfer h3-video upscale";; all) echo "$ALL_TOOLS";; none) ;; *) echo "$1";; esac; }
expand_tools() { local out="" t; for t in $(echo "$1" | tr ',' ' '); do out="$out $(expand_one "$t")"; done; echo "$out" | tr ' ' '\n' | awk 'NF && !s[$0]++' | tr '\n' ' '; }

# ---- OS / GPU -------------------------------------------------------------------------------------
OS="$(uname -s)"; ARCH="$(uname -m)"; GPU=cpu; VRAM_GB=0
if [ "$OS" = Darwin ] && [ "$ARCH" = arm64 ]; then GPU=mps; VRAM_GB=$(( $(sysctl -n hw.memsize) / 1073741824 ))
elif command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi -L >/dev/null 2>&1; then GPU=cuda
  VRAM_GB=$(( $(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits | head -1 | tr -d ' ') / 1024 )); fi
case "$GPU" in cuda) GPU_LABEL="NVIDIA CUDA (${VRAM_GB} GB VRAM)";; mps) GPU_LABEL="Apple Silicon / MPS (${VRAM_GB} GB unified memory)";; *) GPU_LABEL="CPU only";; esac
info "System: $OS $ARCH, $GPU_LABEL"

# ---- prerequisites --------------------------------------------------------------------------------
if [ $MODELS_ONLY = 0 ]; then
command -v node >/dev/null || die "Node.js 20+ is required (https://nodejs.org or: brew install node / nvm install 20)"
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]'); [ "$NODE_MAJOR" -ge 20 ] || die "Node $NODE_MAJOR found, need 20+"
fi
PY="${PYTHON:-python3}"; command -v "$PY" >/dev/null || die "Python 3.10+ is required (used by the model/node manifest tools)"
"$PY" -c 'import sys; sys.exit(0 if sys.version_info>=(3,10) else 1)' || die "Python 3.10+ required, found $("$PY" -V)"
[ $MODELS_ONLY = 1 ] || command -v ffmpeg >/dev/null || warn "ffmpeg not found: uploads/remux/audio keep need it (apt install ffmpeg / brew install ffmpeg)"
info "$([ $MODELS_ONLY = 0 ] && echo "Node $(node -v), ")$("$PY" -V)"

# ---- tool table / disk estimate -------------------------------------------------------------------
estimate() { # args: prefixes...  -> prints table + "TOTAL <need_gb> <have_gb>"
  "$PY" - "$MANIFEST" "${COMFY_DIR:-}" "$GPU" "$VRAM_GB" "$@" <<'PY'
import json, os, sys
man, comfy, gpu, vram, *pre = sys.argv[1:]; m = json.load(open(man)); vram = int(vram)
wf = {k: v for k, v in m['workflows'].items() if not pre or any(k.startswith(p) for p in pre)}
files = {x['file']: x for x in m['models']}; need = set()
for k, v in sorted(wf.items()):
    need |= set(v['models']); fit = '' if gpu != 'cuda' else (' ok' if v['vram_est_gb'] <= vram else ' >VRAM')
    print(f"  {k:52s} {v['total_gb']:7.2f} GB  ~{v['vram_est_gb']:5.1f} GB VRAM{fit}  mac:{v['mps']}")
tot = have = 0
for f in need:
    x = files.get(f, {}); s = x.get('size') or 0; tot += s
    if comfy and os.path.exists(os.path.join(comfy, 'models', x.get('folder', ''), f)): have += s
gated = [f for f in need if files.get(f, {}).get('head_status') not in ('ok', None)]
if gated: print('  gated/unresolved (manual download):', ', '.join(sorted(gated)))
print(f"TOTAL {tot/1e9:.1f} {have/1e9:.1f} {len(wf)}")
PY
}
if [ $LIST = 1 ]; then for t in $ALL_TOOLS; do c 1 "$t"; estimate $(tool_prefixes "$t") | grep -v '^TOTAL' || true; done; exit 0; fi

# ---- backend choice -------------------------------------------------------------------------------
# comfy by default (2026-10-29): real runs once a Comfy key or a ComfyUI is connected; --mock = sample results, for development only
[ -n "$BACKEND" ] || BACKEND=comfy
[ "$BACKEND" = comfy ] && [ -z "$COMFY_URL" ] && [ -n "$COMFY_DIR" ] && COMFY_URL=http://127.0.0.1:8188; true
info "Backend: $BACKEND${COMFY_URL:+ ($COMFY_URL)}"

# ---- plan + confirm (one question, before the first clone / install / download) -----------------
PLAN=(); SEL=""; PREFIXES=""; NEED=0; HAVE=0
if [ -n "$COMFY_DIR" ] && [ -z "$INSTALL_COMFY" ]; then
  [ $DRY = 1 ] || [ $NOASK = 1 ] || [ $MODELS_ONLY = 1 ] || [ -d "$COMFY_DIR/custom_nodes" ] || die "$COMFY_DIR is not a ComfyUI checkout (no custom_nodes/)"; fi
if [ -n "$INSTALL_COMFY" ]; then
  PIN0=$("$PY" -c "import json;print(json.load(open('readiness/manifest/custom-nodes.json'))['packs']['ComfyUI (core)']['pin'])")
  PLAN+=("clone ComfyUI @ ${PIN0:0:10} from github.com/comfyanonymous/ComfyUI into $INSTALL_COMFY (a shallow clone, tens of MB)")
  PLAN+=("create a Python venv there and pip install torch, torchvision and torchaudio for $GPU_LABEL (size depends on the platform: a few hundred MB on CPU / Mac, several GB with CUDA)")
  PLAN+=("pip install ComfyUI's requirements.txt into that venv")
fi
if [ -n "$COMFY_DIR" ] && [ $SKIP_NODES = 0 ]; then
  NPACKS=$("$PY" -c "import json;print(sum(1 for p in json.load(open('readiness/manifest/custom-nodes.json'))['packs'].values() if p['dir'] and not p.get('optional') and p.get('pin')))")
  PLAN+=("install $NPACKS pinned custom-node packs into $COMFY_DIR/custom_nodes (git clones plus their pip requirements; size not listed)")
fi
if [ -n "$COMFY_DIR" ] && [ $SKIP_MODELS = 0 ]; then
  SEL="$(expand_tools "${TOOLS:-starter}")"
  if [ -n "$SEL" ]; then
    for t in $SEL; do p=$(tool_prefixes "$t") || die "unknown tool '$t' (try --list-tools)"; PREFIXES="$PREFIXES $p"; done
    info "Models for: $SEL"; OUT=$(estimate $PREFIXES); echo "$OUT" | grep -v '^TOTAL'
    read -r _ NEED HAVE NWF <<<"$(echo "$OUT" | grep '^TOTAL')"
    PLAN+=("download model files for: $(echo $SEL) ($NEED GB total, $HAVE GB already present) into $COMFY_DIR/models")
  fi
fi
if [ ${#PLAN[@]} -gt 0 ] && [ $YES = 0 ] && [ $DRY = 0 ]; then
  info "This will:"; for x in "${PLAN[@]}"; do echo "  - $x"; done
  if [ $NOASK = 1 ]; then warn "Not installing or downloading anything: no terminal to ask in. Re-run with --yes to go ahead, or in a terminal to be asked."; exit 0; fi
  a=""; read -r -p "Go ahead? [y/N] " a || true
  [[ "$a" =~ ^[Yy] ]] || { info "Nothing was cloned, installed or downloaded."; exit 0; }
fi

# ---- app ------------------------------------------------------------------------------------------
[ $MODELS_ONLY = 1 ] || { info "Installing app dependencies (npm ci)"; run npm ci --no-audit --no-fund; }
if [ $SKIP_BUILD = 0 ]; then info "Building server + web (npm run build)"; run npm run build; fi

# ---- ComfyUI (optional) ---------------------------------------------------------------------------
if [ -n "$INSTALL_COMFY" ]; then
  command -v git >/dev/null || die "git is required to install ComfyUI"
  PIN=$("$PY" -c "import json;print(json.load(open('readiness/manifest/custom-nodes.json'))['packs']['ComfyUI (core)']['pin'])")
  info "Installing ComfyUI @ ${PIN:0:10} into $INSTALL_COMFY"
  if [ ! -d "$INSTALL_COMFY/.git" ]; then fetch git init -q "$INSTALL_COMFY"; fetch git -C "$INSTALL_COMFY" remote add origin https://github.com/comfyanonymous/ComfyUI; fi
  fetch git -C "$INSTALL_COMFY" fetch -q --depth 1 origin "$PIN"; fetch git -C "$INSTALL_COMFY" checkout -q FETCH_HEAD
  fetch "$PY" -m venv "$INSTALL_COMFY/venv"; VPY="$INSTALL_COMFY/venv/bin/python"
  case "$GPU" in cuda) TIDX="--index-url https://download.pytorch.org/whl/cu128";; mps) TIDX="";; *) TIDX="--index-url https://download.pytorch.org/whl/cpu";; esac
  fetch "$VPY" -m pip install -q --upgrade pip; fetch "$VPY" -m pip install -q torch torchvision torchaudio $TIDX
  fetch "$VPY" -m pip install -q -r "$INSTALL_COMFY/requirements.txt"; export PYTHON="$VPY"
fi
if [ -n "$COMFY_DIR" ]; then
  [ -z "${PYTHON:-}" ] && [ -x "$COMFY_DIR/venv/bin/python" ] && export PYTHON="$COMFY_DIR/venv/bin/python"
  if [ $SKIP_NODES = 0 ]; then info "Installing pinned custom nodes (npm run nodes:install)"; fetch npm run nodes:install -- "$COMFY_DIR"; fi
  if [ $SKIP_MODELS = 0 ] && [ -n "$SEL" ]; then # SEL / PREFIXES / NEED / HAVE from the plan above
    FREE=$(df -Pk "$COMFY_DIR" | awk 'NR==2{printf "%.1f", $4/1048576}')
    info "Download: ${NEED} GB total, ${HAVE} GB already present, ${FREE} GB free on $(df -P "$COMFY_DIR" | awk 'NR==2{print $6}')"
    awk -v n="$NEED" -v h="$HAVE" -v f="$FREE" 'BEGIN{exit !((n-h) > f)}' && die "not enough disk space"
    if [ "$GPU" = mps ]; then warn "Mac: fp8 checkpoints do not run on MPS (most video tools). See README > Mac."; fi
    if [ $SKIP_MODELS = 0 ]; then
      run "$PY" - "$MANIFEST" "$COMFY_DIR" $PREFIXES <<'PY'
# Download straight from models.json (sha256-verified, resumable-by-skip). Does not rewrite the manifest.
import hashlib, json, os, sys, urllib.request
man, comfy, *pre = sys.argv[1:]; m = json.load(open(man))
need = {f for k, v in m['workflows'].items() if any(k.startswith(p) for p in pre) for f in v['models']}
for x in m['models']:
    if x['file'] not in need: continue
    if x.get('head_status') != 'ok' or not x.get('url'): print('SKIP (gated/unresolved, see README):', x['file']); continue
    fold = x['folder'] if x['folder'].startswith('custom_nodes/') else 'models/' + x['folder']
    dst = os.path.join(comfy, fold, x['file']); os.makedirs(os.path.dirname(dst), exist_ok=True)
    if os.path.exists(dst) and (not x.get('size') or os.path.getsize(dst) == x['size']): print('have', dst); continue
    print(f"get  {x['file']} ({(x.get('size') or 0)/1e9:.2f} GB) -> {dst}", flush=True)
    hdr = {'User-Agent': 'openhiggsfield-install'}
    if os.environ.get('HF_TOKEN'): hdr['Authorization'] = 'Bearer ' + os.environ['HF_TOKEN']
    h = hashlib.sha256()
    with urllib.request.urlopen(urllib.request.Request(x['url'], headers=hdr)) as r, open(dst + '.part', 'wb') as o:
        while (b := r.read(1 << 20)): h.update(b); o.write(b)
    if x.get('sha256') and h.hexdigest() != x['sha256']: os.remove(dst + '.part'); sys.exit('sha256 mismatch: ' + x['file'])
    os.replace(dst + '.part', dst)
PY
    fi
  fi
elif [ -n "$TOOLS" ] && [ "$TOOLS" != none ]; then warn "--tools needs --comfy-dir or --install-comfy (models go into ComfyUI/models); skipping downloads"; fi

# ---- env file + next steps ------------------------------------------------------------------------
[ $MODELS_ONLY = 1 ] && { info "Models done."; exit 0; }
ENVF="${OPENHIGGSFIELD_ENV_FILE:-$ROOT/.env.local}"
# ---- env-file helpers (merge, never overwrite: re-runs keep keys saved in Settings) ----
# env_init FILE: create it if missing, mode 600. env_set FILE KEY VALUE: replace KEY's line or append it (temp file next to it, never /tmp).
env_init() { [ -f "$1" ] || ( umask 077; echo "# written by scripts/install.sh; re-runs merge into this file and keep your saved keys" > "$1" ); chmod 600 "$1"; }
env_set() { local f="$1" k="$2" v="$3" t; t="$(mktemp "$f.XXXXXX")"; chmod 600 "$t"; grep -v "^$k=" "$f" > "$t" || true; printf '%s=%s\n' "$k" "$v" >> "$t"; mv -f "$t" "$f"; chmod 600 "$f"; }
# ---- end env-file helpers ----
if [ $DRY = 0 ]; then
  env_init "$ENVF"; env_set "$ENVF" OPENHIGGSFIELD_BACKEND "$BACKEND"
  [ "$BACKEND" = comfy ] && [ -n "$COMFY_URL" ] && env_set "$ENVF" COMFY_BASE_URL "$COMFY_URL"
  # mock installs only (development): sample renders count as "local", so turn local on so samples work with no API keys.
  # real (comfy) installs stay cloud-first; turn on Settings > Use local ComfyUI yourself.
  [ "$BACKEND" = mock ] && env_set "$ENVF" OPENHIGGSFIELD_USE_LOCAL 1; true
fi
if [ "$BACKEND" = comfy ] && [ -n "$COMFY_URL" ] && [ $DRY = 0 ]; then
  curl -fsS -m 3 "$COMFY_URL/system_stats" >/dev/null 2>&1 && info "ComfyUI reachable at $COMFY_URL" || warn "ComfyUI not reachable at $COMFY_URL yet (start it; the app finds it once it answers)"
fi
[ "$BACKEND" = comfy ] && [ -z "$COMFY_URL" ] && info "No ComfyUI given: open the app and paste a Comfy key, or point it at your ComfyUI (the app asks on the first Generate)"; true
c 32 "
Installed. Start it:
  set -a; . ./.env.local; set +a; node docker/start.mjs     # one port: http://localhost:8080
  # or dev mode with hot reload:  set -a; . ./.env.local; set +a; npm run dev   (web :5174, API :8787)
  # check: curl -s localhost:8080/api/health"
if [ -n "$COMFY_DIR" ]; then c 32 "  Start ComfyUI: cd $COMFY_DIR && ${PYTHON:-python3} main.py --listen 127.0.0.1 --port 8188$([ "$GPU" = cpu ] && echo ' --cpu')"; fi
