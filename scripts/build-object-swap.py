#!/usr/bin/env python3
"""Build runnable API-format Object Swap graphs (Wan 2.2 Animate 14B, Mix mode) from the
official Comfy template. Output: workflows/object-swap/ext-{0..6}.json and workflows/object-swap-api.json.

Each graph = one 77-frame base segment + N "extend" segments (72 new frames each, 5-frame overlap),
all at 16 fps: N=0 ~4.8s, 1 ~9.3s, 2 ~13.8s, 3 ~18.3s, 4 ~22.8s, 5 ~27.3s, 6 ~31.8s.
The final SaveVideo is always node "277" so workflows/node-map.json stays valid.

Usage: python3 scripts/build-object-swap.py <object_info.json>
  (object_info.json = GET /object_info from a ComfyUI with KJNodes, comfyui_controlnet_aux,
   ComfyUI-segment-anything-2 installed)"""
import copy, json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__)); WF = os.path.join(HERE, "..", "workflows")
oi = sys.argv[1]
base_path = "/tmp/oj-wan-animate-converted.json"
subprocess.run([sys.executable, os.path.join(HERE, "ui2api.py"),
                os.path.join(WF, "video_wan2_2_14B_animate-ui.json"), oi, base_path], check=True)
base = json.load(open(base_path))

def build(n_ext):
    g = copy.deepcopy(base)
    g["242:90"]["inputs"]["height"] = ["160", 0]  # template wires width into height on extends; fix for non-square
    g["159"]["inputs"]["value"] = 832; g["160"]["inputs"]["value"] = 480  # Wan 480p landscape default
    g["229"]["inputs"].update(width=832, height=480, coordinates='[{"x":416,"y":240}]',
        points_store='{"positive":[{"x":416,"y":240}],"negative":[{"x":0,"y":0}]}')
    g["21"]["inputs"]["text"] = "The character moves naturally in the scene"
    for k in ("19", "243"): g.pop(k, None)
    ext = {k.split(":", 1)[1]: v for k, v in g.items() if k.startswith("242:")}
    for k in [k for k in g if k.startswith("242:")]: g.pop(k)
    last_video = ["232:15", 0]; prev_imgs = ["232:58", 0]; prev_off = ["232:62", 5]
    for i in range(1, n_ext + 1):
        p = f"ext{i}:"; seg = copy.deepcopy(ext)
        for node in seg.values():
            for key, v in node["inputs"].items():
                if isinstance(v, list) and len(v) == 2 and isinstance(v[0], str) and v[0].startswith("242:"):
                    node["inputs"][key] = [p + v[0][4:], v[1]]
        seg["90"]["inputs"].update(video_frame_offset=prev_off, continue_motion=prev_imgs)
        seg["86"]["inputs"]["image1"] = prev_imgs
        seg["91"]["inputs"]["seed"] = 387378783691198 + i
        for k, v in seg.items(): v["_meta"]["title"] = f"Extend {i} · {v['_meta']['title']}"; g[p + k] = v
        prev_imgs = [p + "86", 0]; prev_off = [p + "90", 5]; last_video = [p + "88", 0]
    g["277"] = {"inputs": {"filename_prefix": "openhiggsfield/object-swap", "format": "auto", "format.codec": "auto",
                           "video": last_video}, "class_type": "SaveVideo", "_meta": {"title": "OpenHiggsfield output"}}
    return g

os.makedirs(os.path.join(WF, "object-swap"), exist_ok=True)
for n in range(0, 7):
    json.dump(build(n), open(os.path.join(WF, "object-swap", f"ext-{n}.json"), "w"), indent=2, ensure_ascii=False)
json.dump(build(1), open(os.path.join(WF, "object-swap-api.json"), "w"), indent=2, ensure_ascii=False)
print("built ext-0..6 and object-swap-api.json (ext-1)")
