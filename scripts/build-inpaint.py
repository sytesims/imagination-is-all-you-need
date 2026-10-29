#!/usr/bin/env python3
"""Derive create-image-qwen-edit2509-inpaint-api.json from the Qwen-Image-Edit-2509 graph (Comfy-Org template, MIT):
adds a mask image (LoadImage -> ImageToMask red channel, white = repaint) and SetLatentNoiseMask on the encoded latent,
so only the masked area is resampled. No new weights (Qwen-Image-Edit-2509, Apache-2.0)."""
import json, os
d = os.path.join(os.path.dirname(__file__), "..", "workflows")
g = json.load(open(os.path.join(d, "create-image-qwen-edit2509-api.json")))
g["900"] = {"class_type": "LoadImage", "inputs": {"image": "mask.png"}, "_meta": {"title": "Mask (white = repaint)"}}
g["901"] = {"class_type": "ImageToMask", "inputs": {"image": ["900", 0], "channel": "red"}}
g["902"] = {"class_type": "ImageScale", "inputs": {"image": ["900", 0], "upscale_method": "nearest-exact", "width": 1024, "height": 1024, "crop": "disabled"}}
g["903"] = {"class_type": "SetLatentNoiseMask", "inputs": {"samples": ["433:88", 0], "mask": ["901", 0]}}
g["433:3"]["inputs"]["latent_image"] = ["903", 0]
del g["902"]
g["469"]["inputs"]["filename_prefix"] = "openhiggsfield/inpaint"
json.dump(g, open(os.path.join(d, "create-image-qwen-edit2509-inpaint-api.json"), "w"), indent=1)
print("wrote create-image-qwen-edit2509-inpaint-api.json")
