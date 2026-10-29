#!/usr/bin/env python3
"""Build Create Image graphs for FLUX 3 Image Klein (distilled, black-forest-labs/flux-3-image-klein-comfy) from the
official Comfy-Org templates image_flux3_klein_distilled_t2i / _image_edit (workflows/templates/, ComfyUI 0.41 core nodes only).
Sampler per the model card: 16 steps, no guidance (cfg 1), euler / simple. Prompt upsampler branch kept ON by default
(model card: "Do not use the model without a prompt upsampler"). Inpaint is derived from edit: VAEEncode of the
(1 MP) reference + SetLatentNoiseMask, so only the white mask area is resampled.
Licence: FLUX Kommunity License v1.0 (NOT permissive). Usage: python3 scripts/build-flux3-klein.py <object_info.json>"""
import json, os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__)); WF = os.path.normpath(os.path.join(HERE, "..", "workflows"))
TPL = os.path.join(WF, "templates"); MAPS = os.path.join(WF, "node-maps"); oi_path = sys.argv[1]
MODEL = "FLUX 3 Image Klein (FLUX Kommunity License v1.0)"

# 2026-10-27: the int8_convrot prompt upsampler (9.75 GB, same BFL repo) instead of the templates' w4a8 one: w4a8 needs CUDA-only
# low-bit kernels, so it blocked the whole route on a Mac (server/src/hardware/macWeights.ts); int8_convrot dequantizes on MPS.
UPSAMPLER = "qwen3.5_9b_flux3_prompt_upsampler_int8_convrot.safetensors"
def convert(t):
    out = f"/tmp/ohf-{t}.api.json"
    subprocess.run([sys.executable, os.path.join(HERE, "ui2api.py"), os.path.join(TPL, t + ".json"), oi_path, out], check=True, stdout=subprocess.DEVNULL)
    g = json.load(open(out))
    for n in g.values():
        if n["class_type"] == "CLIPLoader" and "prompt_upsampler" in str(n["inputs"].get("clip_name", "")): n["inputs"]["clip_name"] = UPSAMPLER
    return g
def by(g, cls): return [k for k, n in g.items() if n["class_type"] == cls]
# Official file names only (black-forest-labs/flux-3-image-klein-comfy + the Comfy-Org templates): UNET flux3-image-klein-int8-convrot,
# VAE flux2-vae.safetensors (kept as shipped, no rename: Comfy Cloud and fresh HF downloads match files by exact name).
def write(name, g, nm):
    for n in g.values(): n.setdefault("_meta", {}).setdefault("title", n["class_type"])
    json.dump(g, open(os.path.join(WF, name), "w"), indent=2, ensure_ascii=False)
    json.dump({"workflowFile": name, **nm}, open(os.path.join(MAPS, name.replace("-api.json", ".json")), "w"), indent=2, ensure_ascii=False)
    print(f"{name}: {len(g)} nodes")
def sampler(n, seed=42): n["inputs"].update(seed=seed, steps=16, cfg=1, sampler_name="euler", scheduler="simple", denoise=1)

# Layout boxes (2026-10-27): the templates' CreateBoundingBoxes -> Flux3LayoutPrompt pair, put on the prompt path (prompt -> layout prompt -> upsampler
# and raw branch), as the official distilled edit template does. The job's boxes go in as CreateBoundingBoxes `bboxes` (BFL elements as JSON);
# editor_state (a list widget the converter drops) is sent empty in ComfyUI's {"__value__": [...]} wrapper. With no boxes, comfy/flux3Klein.ts
# relinks the prompt past the pair and pruneUnreachable drops it, so the graph is exactly the one without boxes.
def boxes(g, cbb, lp, prompt, consumers, w=1024, h=1024):
    g[cbb] = {"class_type": "CreateBoundingBoxes", "inputs": {"width": w, "height": h, "editor_state": {"__value__": []}}, "_meta": {"title": "Layout boxes"}}
    g[lp] = {"class_type": "Flux3LayoutPrompt", "inputs": {"prompt": [prompt, 0], "element": [cbb, 2]}, "_meta": {"title": "FLUX 3 Image Layout Prompt"}}
    for node, field in consumers: g[node]["inputs"][field] = [lp, 0]
    return {"node": cbb, "field": "bboxes", "layout": lp, "prompt": prompt}

# ---- text-to-image: keep the subgraph's core path; the bbox helper nodes become the layout boxes path ----
t = convert("image_flux3_klein_distilled_t2i")
for k in ("23", "24", "25"): t.pop(k, None)
p = "18:17"; t[p]["inputs"]["value"] = "A close-up photograph of a red fox standing in fresh snow at sunrise."
t["18:16"]["inputs"]["switch"] = True            # True -> upsampled caption (18:11), as the distilled template ships
t["18:13"]["_meta"] = {"title": "Final caption"}
sampler(t["18:7"]); t["9"]["inputs"]["filename_prefix"] = "openhiggsfield/create-image"
t["19"]["inputs"].update(aspect_ratio="1:1 (Square)", megapixels=1, multiple=16)
tb = boxes(t, "23", "25", p, [("18:11", "prompt"), ("18:16", "on_false")])
write("create-image-flux3klein-t2i-api.json", t, {"template": "image_flux3_klein_distilled_t2i", "model": MODEL,
      "inputs": {"prompt": {"node": p, "field": "value"}, "upsample": {"node": "18:16", "field": "switch"}}, "boxes": tb,
      "size": {"node": "18:6", "fields": ["width", "height"], "note": "plain ints override the ResolutionSelector link; multiple of 16, up to native 4K"},
      "seed": {"node": "18:7", "field": "seed"}, "output": {"node": "9"}})

# ---- edit: plain prompt (bbox JSON can be appended as text, docs.bfl.ai/flux_3/flux3_image_bounding_boxes) ----
e = convert("image_flux3_klein_distilled_image_edit")
for k in ("18", "33", "34", "49"): e.pop(k, None)
e["60"] = {"class_type": "PrimitiveStringMultiline", "inputs": {"value": "Change the bag colour to blue, keep everything else unchanged."}, "_meta": {"title": "Edit prompt"}}
e["47"]["inputs"]["prompt"] = ["60", 0]
e["51"]["inputs"].update(switch=False, on_false=["47", 0], on_true=["60", 0])   # False -> upsampled (template default)
sampler(e["7"]); e["9"]["inputs"]["filename_prefix"] = "openhiggsfield/create-image"
eb = boxes(e, "33", "49", "60", [("47", "prompt"), ("51", "on_true")])
write("create-image-flux3klein-edit-api.json", e, {"template": "image_flux3_klein_distilled_image_edit", "model": MODEL,
      "inputs": {"prompt": {"node": "60", "field": "value"}, "image": {"node": "11", "field": "image"}, "raw_prompt": {"node": "51", "field": "switch"}}, "boxes": eb,
      "refs": [{"node": "11", "field": "image"}], "seed": {"node": "7", "field": "seed"}, "output": {"node": "9"}})

# ---- inpaint (derived): mask white = repaint; mask LoadImage is node "900" (plans.ts convention) ----
i = json.loads(json.dumps(e))
i["70"] = {"class_type": "ImageScaleToTotalPixels", "inputs": {"image": ["11", 0], "upscale_method": "lanczos", "megapixels": 1, "resolution_steps": 16}, "_meta": {"title": "Reference @1MP"}}
i["17"]["inputs"]["images.image0"] = ["70", 0]; i["17"]["inputs"]["resolution"] = "keep resolution"; i["17"]["inputs"].pop("resolution.megapixels", None)
i["50"]["inputs"]["images.image0"] = ["70", 0]
i["71"] = {"class_type": "VAEEncode", "inputs": {"pixels": ["70", 0], "vae": ["3", 0]}}
i["900"] = {"class_type": "LoadImage", "inputs": {"image": "mask.png"}, "_meta": {"title": "Mask (white = repaint)"}}
i["73"] = {"class_type": "ImageToMask", "inputs": {"image": ["900", 0], "channel": "red"}}
i["74"] = {"class_type": "SetLatentNoiseMask", "inputs": {"samples": ["71", 0], "mask": ["73", 0]}}
i["7"]["inputs"]["latent_image"] = ["74", 0]; i["9"]["inputs"]["filename_prefix"] = "openhiggsfield/inpaint"
write("create-image-flux3klein-inpaint-api.json", i, {"template": "image_flux3_klein_distilled_image_edit (+mask)", "model": MODEL,
      "inputs": {"prompt": {"node": "60", "field": "value"}, "image": {"node": "11", "field": "image"}, "mask": {"node": "900", "field": "image"}, "raw_prompt": {"node": "51", "field": "switch"}}, "boxes": eb,
      "refs": [{"node": "11", "field": "image"}], "seed": {"node": "7", "field": "seed"}, "output": {"node": "9"}})
