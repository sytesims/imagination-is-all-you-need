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
#   --detect                   print what this computer is (OS, arch, GPU, memory, PyTorch wheel index) and exit; changes nothing
#   --models-only              only download models for --tools into --comfy-dir (no Node needed)
#   --yes | -y                 download without asking (ComfyUI clone, custom nodes, models). Required when not in a terminal:
#                              without --yes and without a terminal to ask in, the script prints what it would download and exits 0
#   --dry-run                  print every command instead of running it
#   --skip-build | --skip-nodes | --skip-models
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
MANIFEST=readiness/manifest/models.json
BACKEND=""; COMFY_URL="${OPENHIGGSFIELD_COMFY_URL:-${COMFY_BASE_URL:-}}"; COMFY_DIR=""; INSTALL_COMFY=""
TOOLS=""; MODELS_ONLY=0; YES=0; DRY=0; SKIP_BUILD=0; SKIP_NODES=0; SKIP_MODELS=0; LIST=0; DETECT=0
c() { printf '\033[%sm%s\033[0m\n' "$1" "$2"; }; info() { c 36 "==> $*"; }; warn() { c 33 "WARN: $*"; }; die() { c 31 "ERROR: $*"; exit 1; }
run() { if [ $DRY = 1 ]; then echo "+ $*"; else "$@"; fi; }
while [ $# -gt 0 ]; do case "$1" in
  --mock) BACKEND=mock;; --comfy) BACKEND=comfy;;
  --comfy-url) COMFY_URL="$2"; shift;; --comfy-dir) COMFY_DIR="$2"; shift;; --install-comfy) INSTALL_COMFY="$2"; COMFY_DIR="$2"; shift;;
  --tools) TOOLS="$2"; shift;; --models-only) MODELS_ONLY=1; SKIP_BUILD=1; SKIP_NODES=1;; --list-tools) LIST=1;; --detect) DETECT=1;; --yes|-y) YES=1;; --dry-run) DRY=1;;
  --skip-build) SKIP_BUILD=1;; --skip-nodes) SKIP_NODES=1;; --skip-models) SKIP_MODELS=1;;
  -h|--help) sed -n '2,24p' "$0"; exit 0;; *) die "unknown option $1 (see --help)";; esac; shift; done
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
# One reading (hardware plan B9, 2026-10-31). Mac: unified memory, about 75% usable by the GPU (Apple's recommendedMaxWorkingSetSize; the app's
# hardware.ts uses the same 0.75 estimate), never shown as "VRAM". NVIDIA: nvidia-smi memory.total. DGX Spark (GB10): nvidia-smi has no memory
# figure ("[N/A]" / "Not Supported", NVIDIA DGX Spark known issues), so a non-number means unified memory: the system's MemTotal stands in.
# PyTorch wheels: cu128 on x86_64; cu130 on aarch64, the index NVIDIA's DGX Spark ComfyUI playbook uses for sm_121 (build.nvidia.com/spark/comfyui).
OS="$(uname -s)"; ARCH="$(uname -m)"; GPU=cpu; VRAM_GB=0; RAM_GB=0; UNIFIED=0; MEMINFO="${OPENHIGGSFIELD_MEMINFO:-/proc/meminfo}" # MEMINFO: tests point it at a fixture
if [ "$OS" = Darwin ] && [ "$ARCH" = arm64 ]; then GPU=mps; UNIFIED=1; RAM_GB=$(( $(sysctl -n hw.memsize) / 1073741824 )); VRAM_GB=$(( RAM_GB * 3 / 4 ))
elif command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi -L >/dev/null 2>&1; then GPU=cuda
  MEM_MIB=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null | head -1 | tr -d ' ' || true)
  case "$MEM_MIB" in ''|*[!0-9]*) UNIFIED=1; RAM_GB=$(awk '/^MemTotal:/{printf "%d", $2/1048576}' "$MEMINFO" 2>/dev/null || true); RAM_GB=${RAM_GB:-0}; VRAM_GB=$RAM_GB;; # GB10: [N/A]
    *) VRAM_GB=$(( MEM_MIB / 1024 ));; esac; fi
TORCH_INDEX=cpu; [ "$GPU" = mps ] && TORCH_INDEX=default; if [ "$GPU" = cuda ]; then TORCH_INDEX=cu128; { [ "$ARCH" = aarch64 ] || [ "$ARCH" = arm64 ]; } && TORCH_INDEX=cu130; fi
case "$GPU" in
  cuda) if [ $UNIFIED = 1 ]; then GPU_LABEL="NVIDIA, unified memory (${VRAM_GB} GB shared with the system; DGX Spark class)"; else GPU_LABEL="NVIDIA CUDA (${VRAM_GB} GB VRAM)"; fi;;
  mps) GPU_LABEL="Apple Silicon / MPS (${RAM_GB} GB unified memory, about ${VRAM_GB} GB usable for models)";; *) GPU_LABEL="CPU only";; esac
info "System: $OS $ARCH, $GPU_LABEL"
if [ $DETECT = 1 ]; then echo "OS=$OS ARCH=$ARCH GPU=$GPU UNIFIED=$UNIFIED VRAM_GB=$VRAM_GB RAM_GB=$RAM_GB TORCH_INDEX=$TORCH_INDEX"; exit 0; fi

# ---- prerequisites --------------------------------------------------------------------------------
if [ $MODELS_ONLY = 0 ]; then
NODE_STEPS="Mac: brew install node@24 (this installer finds it). With nvm: nvm install 24 && nvm use 24. Then run the install line again."
command -v node >/dev/null || die "Imagination needs Node.js 22, 24 or 26 (24 recommended). $NODE_STEPS"
# Node.js 22 (from 22.12), 24 or 26, the same rule as scripts/node-version.mjs (20, 23 and 25 are past their end of life)
NODE_V=$(node -p 'process.versions.node'); NODE_MAJOR=${NODE_V%%.*}; NODE_MINOR=${NODE_V#*.}; NODE_MINOR=${NODE_MINOR%%.*}
case "$NODE_MAJOR" in
  24|26) ;;
  22) [ "$NODE_MINOR" -ge 12 ] || die "Node.js $NODE_V is too old: Imagination needs 22.12 or newer. Install Node.js 22, 24 or 26 (24 recommended). $NODE_STEPS";;
  23|25) die "Node.js $NODE_V reached its end of life and no longer gets security fixes. Install Node.js 22, 24 or 26 (24 recommended). $NODE_STEPS";;
  *) if [ "$NODE_MAJOR" -gt 26 ]; then die "Node.js $NODE_V is newer than Imagination supports yet. Use Node.js 22, 24 or 26 (24 recommended). $NODE_STEPS"
     else die "Node.js $NODE_V is too old. It reached its end of life and no longer gets security fixes. Install Node.js 22, 24 or 26 (24 recommended). $NODE_STEPS"; fi;;
esac
fi
# Python only for the ComfyUI / custom node / model steps and --list-tools; the app itself doesn't need it.
PY="${PYTHON:-python3}"; NEED_PY=0; { [ $LIST = 1 ] || [ -n "$COMFY_DIR" ] || [ $MODELS_ONLY = 1 ]; } && NEED_PY=1
if [ $NEED_PY = 1 ]; then
  command -v "$PY" >/dev/null || die "Python 3.10+ is required for ComfyUI, custom nodes and model downloads (the model/node manifest tools)"
  "$PY" -c 'import sys; sys.exit(0 if sys.version_info>=(3,10) else 1)' || die "Python 3.10+ required, found $("$PY" -V)"
fi
[ $MODELS_ONLY = 1 ] || command -v ffmpeg >/dev/null || warn "ffmpeg not found: uploads/remux/audio keep need it (apt install ffmpeg / brew install ffmpeg)"
info "$([ $MODELS_ONLY = 0 ] && echo "Node $(node -v)")$([ $NEED_PY = 1 ] && echo "$([ $MODELS_ONLY = 0 ] && echo ', ')$("$PY" -V)")"

# ---- tool table / disk estimate -------------------------------------------------------------------
estimate() { # args: prefixes...  -> prints table + "TOTAL <need_gb> <have_gb>"
  "$PY" - "$MANIFEST" "${COMFY_DIR:-}" "$GPU" "$VRAM_GB" "$@" <<'PY'
import json, os, sys
man, comfy, gpu, vram, *pre = sys.argv[1:]; m = json.load(open(man)); vram = int(vram)
wf = {k: v for k, v in m['workflows'].items() if not pre or any(k.startswith(p) for p in pre)}
files = {x['file']: x for x in m['models']}; need = set()
for k, v in sorted(wf.items()):
    need |= set(v['models']); fit = '' if gpu not in ('cuda', 'mps') else (' ok' if v['vram_est_gb'] <= vram else ' >VRAM' if gpu == 'cuda' else ' >usable')  # mps: vram = the usable estimate
    print(f"  {k:52s} {v['total_gb']:7.2f} GB  ~{v['vram_est_gb']:5.1f} GB VRAM{fit}  mac:{v['mps']}")
tot = have = 0
for f in need:
    x = files.get(f, {}); s = x.get('size') or 0; tot += s
    if comfy and os.path.exists(os.path.join(comfy, 'models', x.get('folder', ''), f)): have += s
gated = [f for f in need if files.get(f, {}).get('head_status') not in ('ok', None)]
if gated: print('  gated (accept the licence on Hugging Face, set OPENHIGGSFIELD_HF_TOKEN or HF_TOKEN) or unresolved:', ', '.join(sorted(gated)))
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
[ $MODELS_ONLY = 1 ] || { info "Installing app dependencies (npm ci)"; run npm ci --no-audit --no-fund \
  || die "The app's parts didn't install (npm ci failed; see above). Check your internet connection and free disk space, then run this again."; }
if [ $SKIP_BUILD = 0 ]; then info "Building server + web (npm run build)"; run npm run build || die "The build failed (see above). Fix what it says, then run this again."; fi

# ---- ComfyUI (optional) ---------------------------------------------------------------------------
if [ -n "$INSTALL_COMFY" ]; then
  command -v git >/dev/null || die "git is required to install ComfyUI"
  PIN=$("$PY" -c "import json;print(json.load(open('readiness/manifest/custom-nodes.json'))['packs']['ComfyUI (core)']['pin'])")
  info "Installing ComfyUI @ ${PIN:0:10} into $INSTALL_COMFY"
  if [ ! -d "$INSTALL_COMFY/.git" ]; then fetch git init -q "$INSTALL_COMFY"; fetch git -C "$INSTALL_COMFY" remote add origin https://github.com/comfyanonymous/ComfyUI; fi
  fetch git -C "$INSTALL_COMFY" fetch -q --depth 1 origin "$PIN"; fetch git -C "$INSTALL_COMFY" checkout -q FETCH_HEAD
  fetch "$PY" -m venv "$INSTALL_COMFY/venv"; VPY="$INSTALL_COMFY/venv/bin/python"
  case "$TORCH_INDEX" in default) TIDX="";; *) TIDX="--index-url https://download.pytorch.org/whl/$TORCH_INDEX";; esac # cu128 x86_64, cu130 aarch64 (DGX Spark), cpu
  fetch "$VPY" -m pip install -q --upgrade pip; fetch "$VPY" -m pip install -q torch torchvision torchaudio $TIDX
  fetch "$VPY" -m pip install -q -r "$INSTALL_COMFY/requirements.txt"; export PYTHON="$VPY"
fi
if [ -n "$COMFY_DIR" ]; then
  [ -z "${PYTHON:-}" ] && [ -x "$COMFY_DIR/venv/bin/python" ] && export PYTHON="$COMFY_DIR/venv/bin/python"
  if [ $SKIP_NODES = 0 ]; then info "Installing pinned custom nodes (npm run nodes:install)"; fetch npm run nodes:install -- "$COMFY_DIR"; fi
  # ARM64 Linux (DGX Spark): onnxruntime-gpu has no aarch64 wheel, so DWPose / insightface use the CPU onnxruntime (NVIDIA's Spark troubleshooting page).
  # Per-pack aarch64 notes: readiness/manifest/custom-nodes.json "aarch64".
  if [ $SKIP_NODES = 0 ] && [ "$OS" = Linux ] && { [ "$ARCH" = aarch64 ] || [ "$ARCH" = arm64 ]; }; then
    info "ARM64 Linux: installing the CPU onnxruntime (no onnxruntime-gpu wheel for aarch64)"; fetch "${PYTHON:-$PY}" -m pip install -q onnxruntime || warn "onnxruntime didn't install; DWPose and face-ID nodes won't load"
    "$PY" -c "import json
for k,p in json.load(open('readiness/manifest/custom-nodes.json'))['packs'].items():
  if p.get('aarch64') and not p.get('optional'): print('  ' + k + ': ' + p['aarch64'])" 2>/dev/null || true; fi
  if [ $SKIP_MODELS = 0 ] && [ -n "$SEL" ]; then # SEL / PREFIXES / NEED / HAVE from the plan above
    FREE=$(df -Pk "$COMFY_DIR" | awk 'NR==2{printf "%.1f", $4/1048576}')
    info "Download: ${NEED} GB total, ${HAVE} GB already present, ${FREE} GB free on $(df -P "$COMFY_DIR" | awk 'NR==2{print $6}')"
    awk -v n="$NEED" -v h="$HAVE" -v f="$FREE" 'BEGIN{exit !((n-h) > f)}' && die "not enough disk space"
    if [ "$GPU" = mps ]; then warn "Mac: fp8 checkpoints do not run on MPS (most video tools). See README > Mac."; fi
    if [ $SKIP_MODELS = 0 ]; then
      run "$PY" - "$MANIFEST" "$COMFY_DIR" $PREFIXES <<'PY'
# Download straight from models.json (sha256-verified, resumable-by-skip). Does not rewrite the manifest.
import hashlib, json, os, sys, urllib.error, urllib.request
man, comfy, *pre = sys.argv[1:]; m = json.load(open(man))
hf = os.environ.get('OPENHIGGSFIELD_HF_TOKEN') or os.environ.get('HF_TOKEN')  # the Settings name first, then the usual one
need = {f for k, v in m['workflows'].items() if any(k.startswith(p) for p in pre) for f in v['models']}
for x in m['models']:
    if x['file'] not in need: continue
    # Gated files (the author asks you to accept its licence on Hugging Face) download like the rest once a Hugging Face token is set; the licence is yours to follow.
    gated = x.get('head_status') == 'gated' and bool(x.get('url'))
    if not x.get('url') or (x.get('head_status') != 'ok' and not (gated and hf)):
        print('SKIP (gated: accept its licence on Hugging Face and set OPENHIGGSFIELD_HF_TOKEN or HF_TOKEN; unresolved: see README):', x['file']); continue
    fold = x['folder'] if x['folder'].startswith('custom_nodes/') else 'models/' + x['folder']
    dst = os.path.join(comfy, fold, x['file']); os.makedirs(os.path.dirname(dst), exist_ok=True)
    if os.path.exists(dst) and (not x.get('size') or os.path.getsize(dst) == x['size']): print('have', dst); continue
    print(f"get  {x['file']} ({(x.get('size') or 0)/1e9:.2f} GB) -> {dst}", flush=True)
    hdr = {'User-Agent': 'openhiggsfield-install'}
    if hf: hdr['Authorization'] = 'Bearer ' + hf
    h = hashlib.sha256()
    try:
        with urllib.request.urlopen(urllib.request.Request(x['url'], headers=hdr), timeout=60) as r, open(dst + '.part', 'wb') as o:
            while (b := r.read(1 << 20)): h.update(b); o.write(b)
    except urllib.error.HTTPError as e:
        if gated and e.code in (401, 403): print(f"SKIP (gated: accept the licence on {x.get('page_url') or x['url'].split('/resolve/')[0]}, then re-run):", x['file']); continue
        raise
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
# env_init FILE: create it if missing, mode 600. env_set FILE KEY VALUE: replace KEY's line (also "export KEY=", like scripts/env-merge.mjs)
# or append it (temp file next to it, never /tmp).
env_init() { [ -f "$1" ] || ( umask 077; echo "# written by scripts/install.sh; re-runs merge into this file and keep your saved keys" > "$1" ); chmod 600 "$1"; }
env_set() { local f="$1" k="$2" v="$3" t; t="$(mktemp "$f.XXXXXX")"; chmod 600 "$t"; grep -vE "^[[:space:]]*(export[[:space:]]+)?$k[[:space:]]*=" "$f" > "$t" || true; printf '%s=%s\n' "$k" "$v" >> "$t"; mv -f "$t" "$f"; chmod 600 "$f"; }
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
  npm start                     # http://localhost:5174 (API :8787)
  # or dev mode with hot reload:  npm run dev
  # check: curl -s localhost:8787/api/health"
if [ -n "$COMFY_DIR" ]; then c 32 "  Start ComfyUI: cd $COMFY_DIR && ${PYTHON:-python3} main.py --listen 127.0.0.1 --port 8188$([ "$GPU" = cpu ] && echo ' --cpu')"; fi
