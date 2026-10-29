#!/usr/bin/env python3
"""Build API graphs for Create Image (Qwen Image 2.1 / Qwen-Image / Qwen-Image-Edit-2509), MiniMax H3 (local T2V/I2V/R2V + cloud API node),
Audio (ACE-Step 1.5 music, Stable Audio Open SFX) and the 'Add soundtrack' mux, from official Comfy-Org templates (workflows/templates/).
Usage: python3 scripts/build-workflows-media.py <object_info.json>"""
import copy, json, os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__)); WF = os.path.normpath(os.path.join(HERE, "..", "workflows"))
TPL = os.path.join(WF, "templates"); MAPS = os.path.join(WF, "node-maps")
oi_path = sys.argv[1]; oi = json.load(open(oi_path))
PREVIEW = ("PreviewAny", "PreviewImage", "ImageCompare", "MaskPreview", "PreviewAudio")
SAVES = ("SaveImage", "SaveImageAdvanced", "SaveVideo", "SaveAudio", "SaveAudioMP3", "SaveAudioAdvanced", "SaveAudioOpus")

def convert(t):
    out = f"/tmp/ohf-{t}.api.json"
    subprocess.run([sys.executable, os.path.join(HERE, "ui2api.py"), os.path.join(TPL, t + ".json"), oi_path, out], check=True, stdout=subprocess.DEVNULL)
    g = json.load(open(out)); tpl = json.load(open(os.path.join(TPL, t + ".json")))
    # frontend-only PrimitiveNode widgets: inline their value wherever the API graph still points at them
    prim = {str(n["id"]): (n.get("widgets_values") or [None])[0] for n in tpl["nodes"] if n["type"] == "PrimitiveNode"}
    for n in g.values():
        for f, v in list(n["inputs"].items()):
            if isinstance(v, list) and len(v) == 2 and isinstance(v[0], str) and v[0] not in g and v[0] in prim: n["inputs"][f] = prim[v[0]]
    for k, n in g.items():  # required widget inputs a template predates → node default
        for name, spec in oi[n["class_type"]]["input"].get("required", {}).items():
            opts = spec[1] if len(spec) > 1 and isinstance(spec[1], dict) else {}
            if name not in n["inputs"] and "default" in opts: n["inputs"][name] = opts["default"]
    return g

def prune(g):
    while True:
        used = {v[0] for n in g.values() for v in n["inputs"].values() if isinstance(v, list) and len(v) == 2 and isinstance(v[0], str)}
        dead = [k for k in g if k not in used and not oi[g[k]["class_type"]].get("output_node")]
        if not dead: return g
        for k in dead: del g[k]

def finish(g, tool):
    used = {v[0] for n in g.values() for v in n["inputs"].values() if isinstance(v, list) and len(v) == 2 and isinstance(v[0], str)}
    for k in [k for k, n in g.items() if n["class_type"] in PREVIEW and k not in used]: del g[k]
    saves = [k for k, n in g.items() if n["class_type"] in SAVES]
    for k in saves[1:]: del g[k]
    g[saves[0]]["inputs"]["filename_prefix"] = f"openhiggsfield/{tool}"
    return prune(g), saves[0]

def ids(g, cls): return [k for k, n in g.items() if n["class_type"] == cls]
def one(g, cls): x = ids(g, cls); return x[0] if x else None

def write(name, g, nm):
    for n in g.values(): n.setdefault("_meta", {})["title"] = n["_meta"].get("title") or n["class_type"]
    json.dump(g, open(os.path.join(WF, name), "w"), indent=2, ensure_ascii=False)
    os.makedirs(MAPS, exist_ok=True); json.dump({"workflowFile": name, **nm}, open(os.path.join(MAPS, name.replace("-api.json", ".json")), "w"), indent=2, ensure_ascii=False)
    print(f"{name}: {len(g)} nodes")

def prompt_ref(g):
    # The encoder feeding KSampler.positive wins: Qwen edit templates carry a string prompt on BOTH encoders, and the first one found was the negative.
    pos = {n["inputs"]["positive"][0] for n in g.values() if n["class_type"] == "KSampler" and isinstance(n["inputs"].get("positive"), list)}
    for k in pos:
        if k in g and g[k]["class_type"] == "TextEncodeQwenImageEditPlus" and isinstance(g[k]["inputs"].get("prompt"), str): return {"node": k, "field": "prompt"}
    # Qwen Image 2.1 (+ Turbo): the PrimitiveStringMultiline is the prompt enhancer's SYSTEM prompt; the user prompt goes on the encoder.
    for k in ids(g, "TextEncodeQwenImage21"):
        return {"node": k, "field": "prompt", "note": "user prompt goes straight to TextEncodeQwenImage21; the PrimitiveStringMultiline is the prompt-enhancer SYSTEM prompt (do not overwrite). enhance=1 → TextGenerate prompt + switch on"}
    for cls, f in (("PrimitiveStringMultiline", "value"), ("TextEncodeQwenImage21", "prompt"), ("TextEncodeQwenImageEditPlus", "prompt"), ("CLIPTextEncode", "text"), ("TextEncodeAceStepAudio1.5", "tags")):
        for k in ids(g, cls):
            if isinstance(g[k]["inputs"].get(f), str): return {"node": k, "field": f}
    return None
def seed_ref(g):
    for k, n in g.items():
        for f in ("seed", "noise_seed"):
            if isinstance(n["inputs"].get(f), (int, float)): return {"node": k, "field": f}

# ---- Create Image ----
for t, name, model in (("image_qwen_image_2_1_t2i", "create-image-qwen21-t2i-api.json", "Qwen Image 2.1 (Qwen Research License)"),
                       ("image_qwen_image_2_1_image_edit", "create-image-qwen21-edit-api.json", "Qwen Image 2.1 edit (Qwen Research License)"),
                       ("image_qwen_image_2_1_turbo_t2i", "create-image-qwen21-turbo-t2i-api.json", "Qwen Image 2.1 Turbo (Qwen Research License)"),
                       ("image_qwen_image_2_1_turbo_image_edit", "create-image-qwen21-turbo-edit-api.json", "Qwen Image 2.1 Turbo edit (Qwen Research License)"),
                       ("image_qwen_image", "create-image-qwen-t2i-api.json", "Qwen-Image (Apache-2.0)"),
                       ("image_qwen_image_edit_2509", "create-image-qwen-edit2509-api.json", "Qwen-Image-Edit-2509 (Apache-2.0)"),
                       ("image_z_image_turbo", "create-image-zimage-turbo-api.json", "Z-Image-Turbo (Apache-2.0)"),
                       ("image_z_image", "create-image-zimage-api.json", "Z-Image base (Apache-2.0)"),
                       ("image_flux2_klein_text_to_image", "create-image-klein4b-t2i-api.json", "FLUX.2 [klein] 4B (Apache-2.0)"),
                       ("image_flux2_klein_image_edit_4b_distilled", "create-image-klein4b-edit-api.json", "FLUX.2 [klein] 4B edit (Apache-2.0)"),
                       ("image_flux2", "create-image-flux2dev-api.json", "FLUX.2 [dev] (FLUX Non-Commercial License)")):
    g, save = finish(convert(t), "create-image")
    if name.startswith("create-image-klein4b-"):  # 2026-10-22: the bf16 DISTILLED file on every machine (fp8 can't load on Apple MPS; the base file is slow): distilled settings 4 steps, cfg 1
        for n in g.values():
            if n["class_type"] == "UNETLoader": n["inputs"]["unet_name"] = "flux-2-klein-4b.safetensors"
            if n["class_type"] == "Flux2Scheduler": n["inputs"]["steps"] = 4
            if n["class_type"] == "CFGGuider": n["inputs"]["cfg"] = 1
    write(name, g, {"template": t, "model": model, "inputs": {"prompt": prompt_ref(g), **({"image": {"node": ids(g, "LoadImage")[0], "field": "image"}} if ids(g, "LoadImage") else {})},
                    "refs": [{"node": k, "field": "image"} for k in ids(g, "LoadImage")], "seed": seed_ref(g), "output": {"node": save}})

# ---- MiniMax H3 local (joint audio, 768p short edge, 24 fps, 4–15 s) ----
for t, name in (("video_minimax_h3_t2v", "h3-t2v-api.json"), ("video_minimax_h3_i2v", "h3-i2v-api.json"), ("video_minimax_h3_r2v", "h3-r2v-api.json")):
    g, save = finish(convert(t), "h3")
    write(name, g, {"template": t, "license": "MiniMax H3 Community License", "inputs": {"prompt": prompt_ref(g), **({"image": {"node": ids(g, "LoadImage")[0], "field": "image"}} if ids(g, "LoadImage") else {})},
                    "refs": [{"node": k, "field": "image"} for k in ids(g, "LoadImage")], "seed": seed_ref(g), "output": {"node": save}})
# ---- MiniMax H3 via Comfy Cloud (ComfyCloudMiniMaxH3* nodes in ComfyUI 0.41 object_info; mock placeholder in OpenHiggsfield, never called) ----
for kind, cls in (("t2v", "ComfyCloudMiniMaxH3TextToVideoNode"), ("i2v", "ComfyCloudMiniMaxH3ImageToVideoNode")):
    g = {"23": {"class_type": cls, "inputs": {"prompt": "A paper boat drifting down a rain-soaked street, cinematic.", "seed": 42, "aspect_ratio": "16:9", "resolution": "720p", "duration_seconds": 5}},
         "8": {"class_type": "SaveVideo", "inputs": {"filename_prefix": "openhiggsfield/h3-cloud", "format": "auto", "format.codec": "auto", "video": ["23", 0]}}}
    if kind == "i2v": g["10"] = {"class_type": "LoadImage", "inputs": {"image": "first_frame.png"}}; g["23"]["inputs"]["first_frame"] = ["10", 0]
    write(f"h3-cloud-{kind}-api.json", g, {"note": "Comfy Cloud node (needs a Comfy account at run time). OpenHiggsfield only mocks it.", "inputs": {"prompt": {"node": "23", "field": "prompt"}, **({"image": {"node": "10", "field": "image"}} if kind == "i2v" else {})},
                                           "seed": {"node": "23", "field": "seed"}, "output": {"node": "8"}})

# ---- Audio ----
g, save = finish(convert("audio_ace_step_1_5_split"), "audio-music")
enc = one(g, "TextEncodeAceStepAudio1.5"); lat = one(g, "EmptyAceStep1.5LatentAudio")
for k in (enc, lat):  # duration: one plain number field per node (server sets both)
    for f in ("duration", "seconds"):
        if f in g[k]["inputs"] and isinstance(g[k]["inputs"][f], list): g[k]["inputs"][f] = 30
write("audio-music-api.json", g, {"template": "audio_ace_step_1_5_split", "inputs": {"prompt": {"node": enc, "field": "tags"}, "lyrics": {"node": enc, "field": "lyrics"}},
                                  "duration": [{"node": enc, "field": "duration"}, {"node": lat, "field": "seconds"}], "seed": seed_ref(g), "output": {"node": save}})
music = copy.deepcopy(g)
g, save = finish(convert("audio_stable_audio_example"), "audio-sfx")
write("audio-sfx-api.json", g, {"template": "audio_stable_audio_example", "inputs": {"prompt": prompt_ref(g)}, "duration": [{"node": one(g, "EmptyLatentAudio"), "field": "seconds"}],
                                "seed": seed_ref(g), "output": {"node": save}})
sfx = copy.deepcopy(g)

# ---- Add soundtrack: generated audio muxed onto the source video (video frames + fps untouched) ----
def soundtrack(audio_graph, name, src):
    g = copy.deepcopy(audio_graph)
    for k in [k for k, n in g.items() if n["class_type"] in SAVES]: del g[k]
    dec = one(g, "VAEDecodeAudio")
    g["500"] = {"class_type": "LoadVideo", "inputs": {"file": "oj_source.mp4"}, "_meta": {"title": "Source video"}}
    g["501"] = {"class_type": "GetVideoComponents", "inputs": {"video": ["500", 0]}, "_meta": {"title": "Frames + fps"}}
    g["502"] = {"class_type": "CreateVideo", "inputs": {"images": ["501", 0], "fps": ["501", 2], "audio": [dec, 0]}, "_meta": {"title": "Video + new soundtrack"}}
    g["503"] = {"class_type": "SaveVideo", "inputs": {"video": ["502", 0], "filename_prefix": "openhiggsfield/soundtrack", "format": "auto", "format.codec": "auto"}, "_meta": {"title": "Save video"}}
    nm = json.load(open(os.path.join(MAPS, src)))
    write(name, prune(g), {**{k: v for k, v in nm.items() if k != "workflowFile"}, "inputs": {**nm["inputs"], "video": {"node": "500", "field": "file"}}, "output": {"node": "503"},
                           "note": "duration should be set to the clip length (server: probe)"})
soundtrack(music, "soundtrack-music-api.json", "audio-music.json")
soundtrack(sfx, "soundtrack-sfx-api.json", "audio-sfx.json")
