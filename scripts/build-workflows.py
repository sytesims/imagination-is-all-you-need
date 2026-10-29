#!/usr/bin/env python3
"""Build OpenHiggsfield's API-format ComfyUI graphs for the 6 non-swap tools from official open-weights
Comfy templates (Comfy-Org/workflow_templates, MIT; copies in workflows/templates/), using ui2api.py.
Also writes workflows/node-maps/<tool>.json (input nodes + fields the server sets).

Usage: python3 scripts/build-workflows.py <object_info.json>
  object_info.json = GET /object_info from a ComfyUI with KJNodes, comfyui_controlnet_aux,
  ComfyUI-segment-anything-2 and ComfyUI-SeedVR2_VideoUpscaler installed.
Object Swap is built separately (scripts/build-object-swap.py); Motion Transfer is derived from its ext-N graphs."""
import copy, json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__)); WF = os.path.normpath(os.path.join(HERE, "..", "workflows"))
TPL = os.path.join(WF, "templates"); MAPS = os.path.join(WF, "node-maps")
oi_path = sys.argv[1]; oi = json.load(open(oi_path))
W, H = 832, 480  # Wan 480p landscape; multiples of 16
NEG = "blurry, low quality, distorted, static, watermark, subtitles, extra limbs, deformed"

def convert(template):
    out = f"/tmp/oj-{template}.api.json"
    subprocess.run([sys.executable, os.path.join(HERE, "ui2api.py"), os.path.join(TPL, template + ".json"), oi_path, out], check=True, stdout=subprocess.DEVNULL)
    return fill_defaults(json.load(open(out)))

def fill_defaults(g):
    """Required widget inputs a template predates (e.g. newer frame_rate on LTXVEmptyLatentAudio) get the node default."""
    for k, n in g.items():
        for name, spec in oi[n["class_type"]]["input"].get("required", {}).items():
            if name in n["inputs"]: continue
            opts = spec[1] if len(spec) > 1 and isinstance(spec[1], dict) else {}
            if "default" in opts: n["inputs"][name] = opts["default"]; print(f"   default {k}.{name} = {opts['default']}")
    return g

def prune(g, keep=()):
    """Drop nodes nothing reads from (except output nodes / keep)."""
    while True:
        used = {v[0] for n in g.values() for v in n["inputs"].values() if isinstance(v, list) and len(v) == 2 and isinstance(v[0], str)}
        dead = [k for k in g if k not in used and k not in keep and not oi[g[k]["class_type"]].get("output_node")]
        if not dead: return g
        for k in dead: del g[k]

def only_save(g, save_id, tool):
    for k in [k for k, n in g.items() if n["class_type"] in ("SaveVideo", "SaveAnimatedWEBP", "PreviewImage", "MaskPreview") and k != save_id]: del g[k]
    g[save_id]["inputs"]["filename_prefix"] = f"openhiggsfield/{tool}"
    return prune(g)

def insert_lora(g, src, nid, lora, strength=1.0, title="OpenHiggsfield · camera LoRA"):
    """Insert LoraLoaderModelOnly after model output `src` (node id) and re-point every consumer of [src,0] to it."""
    for k, n in g.items():
        for f, v in n["inputs"].items():
            if v == [src, 0] and n["class_type"] not in ("VAEDecode",) and f == "model": n["inputs"][f] = [nid, 0]
    g[nid] = {"inputs": {"lora_name": lora, "strength_model": strength, "model": [src, 0]}, "class_type": "LoraLoaderModelOnly", "_meta": {"title": title}}
    return g

LTX_CAMERA_LORAS = {k: f"ltx-2-19b-lora-camera-control-{k}.safetensors" for k in ("dolly-in", "dolly-out", "dolly-left", "dolly-right", "jib-up", "jib-down", "static")}

def write(tool, g, node_map, name=None):
    for n in g.values(): n["_meta"]["title"] = n["_meta"].get("title") or n["class_type"]
    p = os.path.join(WF, name or f"{tool}-api.json"); json.dump(g, open(p, "w"), indent=2, ensure_ascii=False)
    os.makedirs(MAPS, exist_ok=True)
    json.dump({"workflowFile": name or f"{tool}-api.json", **node_map}, open(os.path.join(MAPS, f"{tool}.json"), "w"), indent=2, ensure_ascii=False)
    print(f"{tool}: {len(g)} nodes -> {os.path.relpath(p, WF)}")

# ---- motion-transfer: Wan 2.2 Animate "Move" mode = object-swap graph with background_video + character_mask disconnected
os.makedirs(os.path.join(WF, "motion-transfer"), exist_ok=True)
for n in range(7):
    g = json.load(open(os.path.join(WF, "object-swap", f"ext-{n}.json")))
    for node in g.values():
        if node["class_type"] == "WanAnimateToVideo":
            node["inputs"].pop("background_video", None); node["inputs"].pop("character_mask", None)
    g["21"]["inputs"]["text"] = "The character performs the same motion as in the video"
    g["277"]["inputs"]["filename_prefix"] = "openhiggsfield/motion-transfer"
    g = prune(g)
    json.dump(g, open(os.path.join(WF, "motion-transfer", f"ext-{n}.json"), "w"), indent=2, ensure_ascii=False)
    if n == 1: mt = g
write("motion-transfer", mt, {
    "template": "video_wan2_2_14B_animate (Move mode: background_video + character_mask disconnected)",
    "inputs": {"image": {"node": "10", "field": "image", "role": "new character / look reference"},
               "video": {"node": "145", "field": "file", "role": "driving video, pre-converted to 16 fps"},
               "prompt": {"node": "21", "field": "text"}},
    "output": {"node": "277"},
    "extra": {"width": {"node": "159", "field": "value", "default": W}, "height": {"node": "160", "field": "value", "default": H},
              "seed": {"nodes": ["232:63", "extN:91"], "field": "seed"}, "fps": {"value": 16},
              "lengthVariants": {"ext-0": 4.8, "ext-1": 9.3, "ext-2": 13.8, "ext-3": 18.3, "ext-4": 22.8, "ext-5": 27.3, "ext-6": 31.8, "dir": "motion-transfer/"}}})

# ---- restyle: Wan 2.1 VACE 14B video-to-video; structure from Canny of the source, look from the style ref + prompt
g = convert("video_wan_vace_14B_v2v")
g["200"] = {"inputs": {"low_threshold": 0.3, "high_threshold": 0.7, "image": ["144", 0]}, "class_type": "Canny", "_meta": {"title": "OpenHiggsfield · structure (Canny)"}}
g["49"]["inputs"].update(width=W, height=H, length=81, control_video=["200", 0])
g["110"]["inputs"]["clip_name"] = "umt5_xxl_fp8_e4m3fn_scaled.safetensors"  # share the encoder with the other Wan graphs
# CausVid LoRA (tianweiy/CausVid, CC BY-NC 4.0) dropped -> lightx2v Wan2.1 T2V 4-step distill LoRA (Apache-2.0, lightx2v/Wan2.1-Distill-Loras)
g["107"]["inputs"].update(lora_name="wan2.1_t2v_14b_lora_rank64_lightx2v_4step.safetensors", strength_model=1.0, strength_clip=1.0)
g["3"]["inputs"].update(steps=4, cfg=1, sampler_name="lcm", scheduler="simple")
g["6"]["inputs"]["text"] = "watercolor painting style"
g["68"]["inputs"]["audio"] = ["144", 1]
g = only_save(g, "114", "restyle")
write("restyle", g, {
    "template": "video_wan_vace_14B_v2v",
    "inputs": {"video": {"node": "145", "field": "file", "role": "source clip (16 fps, ≤81 frames ≈ 5 s per pass)"},
               "image": {"node": "134", "field": "image", "role": "style reference (first custom style ref, or a rendered style swatch for a preset)"},
               "prompt": {"node": "6", "field": "text", "role": "style preset prompt + user prompt"}},
    "output": {"node": "114"},
    "extra": {"width": {"node": "49", "field": "width", "default": W}, "height": {"node": "49", "field": "height", "default": H},
              "length": {"node": "49", "field": "length", "default": 81, "note": "frames at 16 fps; 4n+1"},
              "seed": {"node": "3", "field": "seed"}, "structure": {"node": "200", "fields": ["low_threshold", "high_threshold"]},
              "chunking": {"chunkFrames": 81, "overlapFrames": 16, "fps": 16, "note": "server splits long clips (comfy/restyle.ts) and crossfades seams with ffmpeg xfade"},
              "styleSwatches": "server/samples/styles/styles.json (id -> swatch png + prompt template); no swatch and no custom ref = prompt-only (node 134 disconnected)"}})

# ---- camera: Wan 2.2 Fun Camera 14B image-to-video with camera presets
g = convert("video_wan2_2_14B_fun_camera")
g["108"]["inputs"].update(width=W, height=H, length=81, camera_pose="Zoom In")
g["107"]["inputs"]["text"] = "cinematic camera move, smooth motion"; g["99"]["inputs"]["text"] = NEG
g = only_save(g, "106", "camera")
cam_map = {
    "template": "video_wan2_2_14B_fun_camera",
    "inputs": {"image": {"node": "97", "field": "image", "role": "keyframe"},
               "prompt": {"node": "107", "field": "text"}},
    "output": {"node": "106"},
    "extra": {"cameraPose": {"node": "108", "field": "camera_pose",
                             "options": oi["WanCameraEmbedding"]["input"]["required"]["camera_pose"][1]["options"]},
              "speed": {"node": "108", "field": "speed"},
              "width": {"node": "108", "field": "width", "default": W}, "height": {"node": "108", "field": "height", "default": H},
              "length": {"node": "108", "field": "length", "default": 81, "note": "frames at 16 fps; 4n+1"},
              "seed": {"node": "102", "field": "noise_seed"}}}
write("camera", g, cam_map, "camera-moves-api.json")

# ---- camera (LTX presets): LTX-2 19B image-to-video + camera-control LoRA
lg = convert("video_ltx2_i2v")
lg = insert_lora(lg, "92:1", "300", LTX_CAMERA_LORAS["dolly-in"])
lg["92:3"]["inputs"]["text"] = "cinematic camera move, smooth motion"
lg["92:51"]["inputs"]["frame_rate"] = 24
lg = only_save(lg, "75", "camera")
write("camera-ltx", lg, {
    "template": "video_ltx2_i2v + LTX-2 camera-control LoRA (node 300)",
    "inputs": {"image": {"node": "98", "field": "image"}, "prompt": {"node": "92:3", "field": "text"}},
    "output": {"node": "75"},
    "extra": {"cameraLora": {"node": "300", "field": "lora_name", "options": LTX_CAMERA_LORAS},
              "frames": {"node": "92:62", "field": "value", "default": 121, "note": "8n+1 at 24 fps"},
              "width": {"node": "102", "field": "resize_type.width", "default": 1280}, "height": {"node": "102", "field": "resize_type.height", "default": 720},
              "seed": {"nodes": ["92:11", "92:67"], "field": "noise_seed"}}}, "camera-ltx-api.json")

# ---- reshoot: same Fun Camera graph per angle segment; start image = first frame of the angle's time range
r = copy.deepcopy(g); r["106"]["inputs"]["filename_prefix"] = "openhiggsfield/reshoot"
write("reshoot", r, {**cam_map, "template": "video_wan2_2_14B_fun_camera (one run per angle)",
      "inputs": {"image": {"node": "97", "field": "image", "role": "first frame of the angle's time range (ffmpeg)"},
                 "prompt": {"node": "107", "field": "text", "role": "scene description + angle"}},
      "notes": "Run once per angle; length = range × 16 fps (4n+1, ≤81). Server concatenates segments and remuxes original audio."},
      "reshoot-funcamera-api.json")

# ---- reshoot (default): LTX-2 19B pose IC-LoRA guide from the source range + camera-control LoRA (true camera move over the same motion)
g = convert("video_ltx2_pose_to_video")
g = insert_lora(g, "143:134", "300", LTX_CAMERA_LORAS["dolly-left"])
g["143:124"]["inputs"]["text"] = "the same scene and action, the camera moves to a new angle"
g = only_save(g, "175", "reshoot")
write("reshoot", g, {
    "template": "video_ltx2_pose_to_video + LTX-2 camera-control LoRA (node 300)",
    "inputs": {"video": {"node": "185", "field": "file", "role": "the angle's time range, converted to 24 fps"},
               "image": {"node": "160", "field": "image", "role": "first frame of the range (start image)"},
               "prompt": {"node": "143:124", "field": "text"}},
    "output": {"node": "175"},
    "extra": {"cameraLora": {"node": "300", "field": "lora_name", "options": LTX_CAMERA_LORAS},
              "cameraStrength": {"node": "300", "field": "strength_model", "default": 1.0},
              "width": {"node": "166", "field": "value", "default": 1280, "note": "multiple of 32"}, "height": {"node": "167", "field": "value", "default": 720},
              "frames": {"node": "168", "field": "value", "default": 121, "note": "8n+1 at 24 fps"}, "fps": {"nodes": ["143:145", "143:148"], "default": 24},
              "seed": {"nodes": ["143:126", "143:187"], "field": "noise_seed"}},
    "fallback": "reshoot-funcamera-api.json (Wan 2.2 Fun Camera, Apache-2.0)",
    "notes": "Run once per angle range; server concatenates segments and remuxes the original audio (LTX also generates audio; discarded)."})

# ---- photo-fx: Wan 2.2 14B image-to-video (4-step LightX2V LoRAs on)
g = convert("video_wan2_2_14B_i2v")
g["129:98"]["inputs"].update(width=W, height=H)
g["129:131"]["inputs"]["value"] = True
g["129:89"]["inputs"]["text"] = NEG; g["129:93"]["inputs"]["text"] = "the subject slowly floats upward"
g = only_save(g, "108", "photo-fx")
write("photo-fx", g, {
    "template": "video_wan2_2_14B_i2v",
    "inputs": {"image": {"node": "97", "field": "image"}, "prompt": {"node": "129:93", "field": "text", "role": "effect prompt(s) + user prompt"}},
    "output": {"node": "108"},
    "extra": {"width": {"node": "129:98", "field": "width", "default": W}, "height": {"node": "129:98", "field": "height", "default": H},
              "duration": {"node": "129:161", "field": "value", "default": 5}, "fps": {"node": "129:162", "field": "value", "default": 16},
              "fourStep": {"node": "129:131", "field": "value", "default": True}, "seed": {"node": "129:86", "field": "noise_seed"}}})

# ---- upscale: SeedVR2 video upscaler
g = convert("utility_seedvr2_video_upscale")
g["22"]["inputs"]["length"] = 4096  # whole clip (template previews 96 frames)
g.pop("20", None)
for k, n in g.items():  # template pre-downscales to 1280x720 via node 20; feed frames straight in
    for f, v in n["inputs"].items():
        if v == ["20", 0]: n["inputs"][f] = ["22", 0]
g["15:5"]["inputs"]["model"] = "seedvr2_ema_3b_fp8_e4m3fn.safetensors"
g = only_save(g, "17", "upscale")
write("upscale", g, {
    "template": "utility_seedvr2_video_upscale",
    "inputs": {"video": {"node": "18", "field": "file"}},
    "output": {"node": "17"},
    "extra": {"resolution": {"node": "15:4", "field": "resolution", "default": 1080, "note": "short side in px"},
              "dit": {"node": "15:5", "field": "model", "options": "3b fp8 default; 7b fp16 / 7b_sharp for Creative"},
              "seed": {"node": "15:4", "field": "seed"}, "batchSize": {"node": "15:4", "field": "batch_size", "note": "4n+1 frames"}},
    "variants": {"precise": "upscale-api.json (SeedVR2 3B)", "creative": "upscale-creative-api.json (SeedVR2 7B)", "smooth60": "upscale-60fps-api.json (SeedVR2 3B + RIFE x2)"}})
c = copy.deepcopy(g); c["15:5"]["inputs"]["model"] = "seedvr2_ema_7b_fp8_e4m3fn_mixed_block35_fp16.safetensors"; c["17"]["inputs"]["filename_prefix"] = "openhiggsfield/upscale-creative"
json.dump(c, open(os.path.join(WF, "upscale-creative-api.json"), "w"), indent=2); print("upscale: creative (7B) -> upscale-creative-api.json")
f = copy.deepcopy(g)
f["400"] = {"inputs": {"ckpt_name": "rife49.pth", "clear_cache_after_n_frames": 10, "multiplier": 2, "fast_mode": True, "ensemble": True, "scale_factor": 1.0,
            "dtype": "float32", "torch_compile": False, "batch_size": 1, "frames": ["15:4", 0]}, "class_type": "RIFE VFI", "_meta": {"title": "OpenHiggsfield · RIFE frame interpolation"}}
f["16"]["inputs"].update(images=["400", 0], fps=60.0)
f["17"]["inputs"]["filename_prefix"] = "openhiggsfield/upscale-60fps"
json.dump(f, open(os.path.join(WF, "upscale-60fps-api.json"), "w"), indent=2); print("upscale: 60 fps (RIFE) -> upscale-60fps-api.json")
