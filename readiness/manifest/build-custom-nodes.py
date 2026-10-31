#!/usr/bin/env python3
"""Regenerate readiness/manifest/custom-nodes.json (npm run nodes:pins).
Every node class used by workflows is mapped to its pack, each pack pinned to a commit; the pin is shallow-cloned
(git fetch --depth 1 <sha>) into $PIN_CACHE (default /tmp/oj-node-pins) and each class name is grepped in that tree."""
import json, glob, os, re, subprocess, collections
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'readiness', 'manifest', 'custom-nodes.json')
CACHE = os.environ.get('PIN_CACHE', '/tmp/oj-node-pins')
OBJ = os.environ.get('OBJECT_INFO', os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../.cache/object_info.json'))  # a ComfyUI /object_info dump
# Pins = the commits installed on the validator (our local CPU ComfyUI), which validate-workflows.py passes against.
PACKS = {
 'ComfyUI (core)': {'repo': 'https://github.com/comfyanonymous/ComfyUI', 'pin': 'bdc63e72f5ab29fde448c161db3057827148c0ef', 'dir': None, 'license': 'GPL-3.0'},
 'ComfyUI-KJNodes': {'repo': 'https://github.com/kijai/ComfyUI-KJNodes', 'pin': '17195fcfa8a05f601b766a0f09c9733284f47416', 'dir': 'ComfyUI-KJNodes', 'license': 'GPL-3.0'},
 'comfyui_controlnet_aux': {'repo': 'https://github.com/Fannovel16/comfyui_controlnet_aux', 'pin': 'a587a4c1594524c1d2de5cd1a86cd868ff448e1c', 'dir': 'comfyui_controlnet_aux', 'license': 'Apache-2.0'},
 'ComfyUI-segment-anything-2': {'repo': 'https://github.com/kijai/ComfyUI-segment-anything-2', 'pin': '0c35fff5f382803e2310103357b5e985f5437f32', 'dir': 'ComfyUI-segment-anything-2', 'license': 'Apache-2.0'},
 'ComfyUI-Frame-Interpolation': {'repo': 'https://github.com/Fannovel16/ComfyUI-Frame-Interpolation', 'pin': '26545cc2dd95bc3d27f056016300673bdeee78f5', 'dir': 'ComfyUI-Frame-Interpolation', 'license': 'MIT'},
 'ComfyUI-SeedVR2_VideoUpscaler': {'repo': 'https://github.com/numz/ComfyUI-SeedVR2_VideoUpscaler', 'pin': '4490bd1f482e026674543386bb2a4d176da245b9', 'dir': 'ComfyUI-SeedVR2_VideoUpscaler', 'license': 'Apache-2.0'},
 'ComfyUI-Drama3': {'repo': 'https://github.com/PedroMarinhoDev/ComfyUI-Drama3', 'pin': '66c4fb9cd3c0151e1e2ccd207847cb8335e87ab4', 'dir': 'ComfyUI-Drama3', 'license': 'GPL-3.0 (Fish-derived parts: Fish Audio Community License; ASR parts: Apache-2.0)'},
 'ComfyUI_BiRefNet_ll': {'repo': 'https://github.com/lldacing/ComfyUI_BiRefNet_ll', 'pin': '5443a2aa16cfbd98bb2f7dcc8bdcb70439e08529', 'dir': 'ComfyUI_BiRefNet_ll', 'license': 'MIT'},
 'ComfyUI-Chatterbox': {'repo': 'https://github.com/wildminder/ComfyUI-Chatterbox', 'pin': '4597af8f59d4460d441e13533eae24b092e40952', 'dir': 'ComfyUI-Chatterbox', 'license': 'Apache-2.0 (pack); Chatterbox weights MIT'},
 'ComfyUI-MMAudio': {'repo': 'https://github.com/kijai/ComfyUI-MMAudio', 'pin': '8eaeb72edc3aaf2059b57f2d96a1f6f689f19ae2', 'dir': 'ComfyUI-MMAudio', 'license': 'MIT (code); MMAudio weights CC BY-NC 4.0',
   # local fixes applied after checkout by install-custom-nodes.sh (diffs in patches/, credited there)
   'patches': ['patches/ComfyUI-MMAudio/01-mps-vae.patch', 'patches/ComfyUI-MMAudio/02-frame-sampling.patch']},
 'ComfyUI-PuLID-Flux': {'repo': 'https://github.com/balazik/ComfyUI-PuLID-Flux', 'pin': 'a80912fc3435c358607bf4b43a58dbcbebdb09ff', 'dir': 'ComfyUI-PuLID-Flux', 'license': 'Apache-2.0 (pack); PuLID weights Apache-2.0; insightface antelopev2 non-commercial research; runs on FLUX.1-dev (non-commercial)'},
 'ComfyUI_InfiniteYou': {'repo': 'https://github.com/bytedance/ComfyUI_InfiniteYou', 'pin': '1c979397c5c80f5ac83a2473a2f7d4503104110f', 'dir': 'ComfyUI_InfiniteYou', 'license': 'Apache-2.0 (pack); InfiniteYou weights CC BY-NC 4.0; insightface non-commercial; FLUX.1-dev (non-commercial)'},
 'ComfyUI-F5-TTS': {'repo': 'https://github.com/niknah/ComfyUI-F5-TTS', 'pin': 'a28b6d5ff9185a3383f6e8e9036f786015fc6651', 'dir': 'ComfyUI-F5-TTS', 'license': 'MIT (pack; submodule SWivid/F5-TTS @2f866649 MIT code, weights CC BY-NC 4.0)'},
 # Qwen3 TTS 1.7B (2026-10-27): only sox + tiktoken are installed (`pip` below, read by install-custom-nodes.sh instead of requirements.txt, which pins
 # transformers<5 and onnxruntime-openvino, no macOS wheel). Confirmed working on transformers 5.16.1 (upstream issue #101 / PR #103).
 'ComfyUI-Qwen-TTS': {'repo': 'https://github.com/flybirdxx/ComfyUI-Qwen-TTS', 'pin': '374c2e05dc705231258237a16258d2f8fae8e32a', 'dir': 'ComfyUI-Qwen-TTS', 'license': 'Apache-2.0 (pack); Qwen3-TTS weights Apache-2.0',
   'pip': ['sox', 'tiktoken'], 'note': 'Install only sox and tiktoken: its requirements.txt pins transformers<5 and onnxruntime-openvino (no macOS wheel). Model folder: models/qwen-tts/Qwen3-TTS-12Hz-1.7B-CustomVoice (docs/LOCAL-MODELS-AND-HARDWARE.md).'},
}
# Optional packs: metadata only. Not used by any shipped workflow, never cloned here or by nodes:install (pin null = no commit known yet).
OPTIONAL = {
 'ComfyUI-GGUF': {'repo': 'https://github.com/city96/ComfyUI-GGUF', 'pin': None, 'dir': 'ComfyUI-GGUF', 'license': 'Apache-2.0', 'optional': True,
   'classes': ['UnetLoaderGGUF'], 'note': 'Optional. Enables the lighter GGUF variants of large local models (the app checks for UnetLoaderGGUF). Not installed by nodes:install; add it in ComfyUI Manager.'},
 # Camera & Lens (2026-10-22): a community prompt-styler node the user may install themselves. Linked only: no code or preset list is shipped,
 # no shipped workflow uses it. No licence stated by the author (all rights reserved by default): the user decides.
 'film_prompt_styler': {'repo': 'https://github.com/Mexes1978/film_prompt_styler', 'pin': None, 'dir': 'film_prompt_styler', 'license': 'none stated (all rights reserved by default)', 'optional': True,
   'classes': ['FilmPromptStyler'], 'note': 'Optional, community (Mexes1978). Film stock, lens, lighting and era presets as a ComfyUI node. Not installed by nodes:install and not used by our workflows; install it from the author\'s repo if you want it, after checking the terms with the author.'},
}
EXPLICIT = {'RIFE VFI': 'ComfyUI-Frame-Interpolation', 'LoadRembgByBiRefNetModel': 'ComfyUI_BiRefNet_ll', 'RembgByBiRefNetAdvanced': 'ComfyUI_BiRefNet_ll',
            'SeedVR2LoadDiTModel': 'ComfyUI-SeedVR2_VideoUpscaler', 'SeedVR2LoadVAEModel': 'ComfyUI-SeedVR2_VideoUpscaler', 'SeedVR2VideoUpscaler': 'ComfyUI-SeedVR2_VideoUpscaler'}

# ARM64 Linux (NVIDIA DGX Spark) notes per pack (hardware plan item 7, 2026-10-31), written to custom-nodes.json "aarch64"; install.sh prints them there.
AARCH64 = {
 "ComfyUI (core)": "DGX Spark (aarch64): install PyTorch from the cu130 wheel index (NVIDIA DGX Spark ComfyUI playbook); fp8 and nvfp4 run (sm_121). Not run here on a Spark yet.",
 "ComfyUI-KJNodes": "Python on top of PyTorch, no compiled wheels of its own: expected to work on aarch64 (UNVERIFIED on a Spark).",
 "comfyui_controlnet_aux": "DWPose uses onnxruntime: onnxruntime-gpu has no aarch64 wheel, so install.sh adds the CPU onnxruntime and DWPose runs on the processor (NVIDIA DGX Spark ComfyUI troubleshooting page).",
 "ComfyUI-segment-anything-2": "PyTorch only: expected to work on aarch64 (UNVERIFIED on a Spark).",
 "ComfyUI-Frame-Interpolation": "RIFE is pure PyTorch and works on aarch64; the cupy-based models need a cupy build for aarch64 CUDA (UNVERIFIED).",
 "ComfyUI-SeedVR2_VideoUpscaler": "Not tested on aarch64 (UNVERIFIED); the native SeedVR2 graph uses core ComfyUI nodes instead.",
 "ComfyUI-Drama3": "fp8 / w4a8 experts need CUDA kernels; whether they build on aarch64 is UNVERIFIED.",
 "ComfyUI_BiRefNet_ll": "PyTorch only: expected to work on aarch64 (UNVERIFIED on a Spark).",
 "ComfyUI-Chatterbox": "PyTorch audio stack: expected to work on aarch64 (UNVERIFIED on a Spark).",
 "ComfyUI-MMAudio": "PyTorch only: expected to work on aarch64 (UNVERIFIED on a Spark).",
 "ComfyUI-PuLID-Flux": "insightface + onnxruntime: insightface builds from source on aarch64 and onnxruntime is the CPU one (no onnxruntime-gpu wheel) (UNVERIFIED).",
 "ComfyUI_InfiniteYou": "insightface + onnxruntime: insightface builds from source on aarch64 and onnxruntime is the CPU one (no onnxruntime-gpu wheel) (UNVERIFIED).",
 "ComfyUI-F5-TTS": "PyTorch audio stack: expected to work on aarch64 (UNVERIFIED on a Spark).",
 "ComfyUI-Qwen-TTS": "Same as on a Mac: only sox and tiktoken are installed (its requirements pin onnxruntime-openvino); expected to work on aarch64 (UNVERIFIED).",
 "ComfyUI-GGUF": "Python + the gguf package: works on aarch64 (UNVERIFIED on a Spark). Prefer the bf16 / fp8 files there: 128 GB fits them."
}

def sh(*a, cwd=None): return subprocess.run(a, cwd=cwd, check=True, capture_output=True, text=True).stdout
def checkout(name, p):
    d = os.path.join(CACHE, re.sub(r'\W', '_', name))
    if not os.path.isdir(os.path.join(d, '.git')):
        os.makedirs(d, exist_ok=True); sh('git', 'init', '-q', cwd=d); sh('git', 'remote', 'add', 'origin', p['repo'], cwd=d)
    head = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=d, capture_output=True, text=True).stdout.strip()
    if head != p['pin']:
        for i in range(3):
            if subprocess.run(['git', 'fetch', '-q', '--depth', '1', 'origin', p['pin']], cwd=d).returncode == 0: break
        else: raise SystemExit(f'cannot fetch {name}@{p["pin"]}')
        sh('git', 'checkout', '-q', 'FETCH_HEAD', cwd=d)
    return d

def main():
    oi = json.load(open(OBJ)) if os.path.exists(OBJ) else {}
    use = collections.defaultdict(set)
    for f in glob.glob(os.path.join(ROOT, 'workflows', '*-api.json')) + glob.glob(os.path.join(ROOT, 'workflows', '*', '*.json')) + glob.glob(os.path.join(ROOT, 'plugins', '*', 'workflow.json')):
        d = json.load(open(f))
        if 'nodes' in d: continue
        for n in d.values():
            if isinstance(n, dict) and 'class_type' in n: use[n['class_type']].add(os.path.relpath(f, ROOT))
    trees = {k: checkout(k, p) for k, p in PACKS.items()}
    rows = []
    for cls in sorted(use):
        mod = oi.get(cls, {}).get('python_module', '')
        pack = EXPLICIT.get(cls) or next((k for k, p in PACKS.items() if p['dir'] and mod == 'custom_nodes.' + p['dir']), None) or ('ComfyUI (core)' if mod.startswith(('nodes', 'comfy_extras', 'comfy_api_nodes')) else None)
        found = []
        if pack:
            pat = r'["\']' + re.escape(cls) + r'["\']|class\s+' + re.escape(cls) + r'\b'
            r = subprocess.run(['rg', '-l', '-t', 'py', pat, trees[pack]], capture_output=True, text=True)
            found = [os.path.relpath(x, trees[pack]) for x in r.stdout.split()]
        rows.append({'class': cls, 'pack': pack, 'python_module': mod or None, 'in_validator_object_info': cls in oi, 'found_in_pin': bool(found), 'files': found[:3], 'workflows': sorted(use[cls])})
    packs = {k: {**p, 'classes': [r['class'] for r in rows if r['pack'] == k]} for k, p in PACKS.items()}
    packs.update({k: dict(v) for k, v in OPTIONAL.items()})
    for k, n in AARCH64.items():
        if k in packs: packs[k]['aarch64'] = n
    json.dump({'generated_by': 'npm run nodes:pins', 'packs': packs, 'classes': rows}, open(OUT, 'w'), indent=1)
    bad = [r['class'] for r in rows if not r['found_in_pin']]
    print(f"{len(rows)} classes, {sum(1 for r in rows if r['pack'] != 'ComfyUI (core)')} custom; not found in pin: {bad}")
main()
