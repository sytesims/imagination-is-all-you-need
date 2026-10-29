#!/usr/bin/env python3
"""Validate API-format graphs against a local ComfyUI (default http://127.0.0.1:8190, start-validator.sh).
Validation only: LoadImage/LoadVideo inputs are pointed at files in ComfyUI/input (oj_ref.png / oj_source.mp4),
the graph is POSTed to /prompt, and anything that got queued is interrupted and removed (CPU box, no GPU run).

Reports per graph: accepted or node_errors, split into missing custom nodes and missing model files.
--placeholders DIR: create zero-byte placeholder model files under DIR (ComfyUI/models) for missing models,
then re-validate (lets you confirm the graph is otherwise well-formed).
H3 graphs are also checked statically (scripts/h3_rules.py); --rules-only skips ComfyUI.
Usage: validate-workflows.py graph.json [...] [--rules-only] [--url URL] [--placeholders <ComfyUI>/models] [--json out.json]"""
import json, os, sys, time, urllib.request, urllib.error

args = sys.argv[1:]
def opt(name, default=None):
    if name in args: i = args.index(name); v = args[i + 1]; del args[i:i + 2]; return v
    return default
URL = opt("--url", "http://127.0.0.1:8190"); PH = opt("--placeholders"); OUT = opt("--json")
RULES_ONLY = "--rules-only" in args
if RULES_ONLY: args.remove("--rules-only")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import h3_rules  # static H3 rules (17n+5, x32, area cap, LoRA family)
MODEL_DIRS = {"unet_name": "diffusion_models", "lora_name": "loras", "vae_name": "vae", "clip_name": "text_encoders",
              "ckpt_name": "checkpoints", "model_name": "upscale_models", "control_net_name": "controlnet", "text_encoder": "text_encoders", "clip_name1": "text_encoders", "clip_name2": "text_encoders"}
CLASS_DIRS = {"Drama3Loader": "diffusion_models", "Drama3CodecLoader": "vae", "Qwen3ASRLoader": "asr", "CLIPVisionLoader": "clip_vision", "DownloadAndLoadSAM2Model": "sam2", "SeedVR2LoadDiTModel": "SEEDVR2", "SeedVR2LoadVAEModel": "SEEDVR2",
              "LatentUpscaleModelLoader": "latent_upscale_models", "LTXVAudioVAELoader": "checkpoints", "LoadRembgByBiRefNetModel": "BiRefNet", "MMAudioModelLoader": "mmaudio", "MMAudioFeatureUtilsLoader": "mmaudio"}

def req(path, data=None):
    r = urllib.request.Request(URL + path, data=json.dumps(data).encode() if data is not None else None, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r, timeout=60) as f: return f.status, json.loads(f.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

oi = {} if RULES_ONLY else req("/object_info")[1]

def validate(g):
    g = json.loads(json.dumps(g))
    for n in g.values():
        if n["class_type"] == "LoadImage": n["inputs"]["image"] = "oj_ref.png"
        if n["class_type"] == "LoadVideo": n["inputs"]["file"] = "oj_source.mp4"
        if n["class_type"] == "LoadAudio": n["inputs"]["audio"] = "oj_source.mp4"
    missing_nodes = sorted({n["class_type"] for n in g.values() if n["class_type"] not in oi})
    if missing_nodes: return {"accepted": False, "missing_nodes": missing_nodes, "missing_models": [], "other": []}
    code, body = req("/prompt", {"prompt": g, "client_id": "openhiggsfield-validator"})
    if code == 200 and not body.get("node_errors"):
        req("/interrupt", {}); req("/queue", {"delete": [body.get("prompt_id")]}); time.sleep(0.2); req("/interrupt", {})
        return {"accepted": True, "missing_nodes": [], "missing_models": [], "other": []}
    models, other = [], []
    for nid, ne in (body.get("node_errors") or {}).items():
        ct = ne.get("class_type")
        for e in ne.get("errors", []):
            name = e.get("extra_info", {}).get("input_name"); val = g[nid]["inputs"].get(name)
            if e.get("type") == "value_not_in_list" and (name in MODEL_DIRS or ct in CLASS_DIRS):
                models.append({"node": nid, "class_type": ct, "input": name, "file": val, "dir": CLASS_DIRS.get(ct) or MODEL_DIRS[name]})
            else: other.append({"node": nid, "class_type": ct, "input": name, "type": e.get("type"), "message": e.get("details") or e.get("message")})
    if not body.get("node_errors"): other.append({"type": "prompt", "message": json.dumps(body.get("error"))})
    return {"accepted": False, "missing_nodes": [], "missing_models": models, "other": other}

report = {}
for path in args:
    g = json.load(open(path)); rules = h3_rules.check(g)
    r = {"accepted": True, "missing_nodes": [], "missing_models": [], "other": []} if RULES_ONLY else validate(g)
    if PH and r["missing_models"] and not r["other"]:
        for m in r["missing_models"]:
            d = os.path.join(PH, m["dir"]); os.makedirs(d, exist_ok=True); open(os.path.join(d, m["file"]), "a").close()
        r2 = validate(g); r = {**r2, "missing_models_placeholdered": r["missing_models"]}
    if rules: r = {**r, "accepted": False, "other": r["other"] + [{"type": "h3_rule", "message": m} for m in rules]}
    report[path] = r
    status = "ACCEPTED" if r["accepted"] else "REJECTED"
    print(f"{status:9} {path}")
    for m in r.get("missing_models_placeholdered", []): print(f"   model (placeholdered): {m['dir']}/{m['file']}  [{m['class_type']}.{m['input']}]")
    for m in r["missing_models"]: print(f"   missing model: {m['dir']}/{m['file']}  [{m['class_type']}.{m['input']}]")
    for n in r["missing_nodes"]: print(f"   missing custom node class: {n}")
    for o in r["other"]: print(f"   error: node {o.get('node')} {o.get('class_type')}.{o.get('input')}: {o.get('type')} {str(o.get('message'))[:200]}")
if OUT: json.dump(report, open(OUT, "w"), indent=2)
sys.exit(0 if all(r["accepted"] for r in report.values()) else 1)
