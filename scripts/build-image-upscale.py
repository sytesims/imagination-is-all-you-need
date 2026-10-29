#!/usr/bin/env python3
"""Image upscale API graphs (core nodes only): LoadImage -> [ImageBlur denoise] -> UpscaleModelLoader + ImageUpscaleWithModel
-> [second pass for 8x] -> [ImageSharpen] -> SaveImage. Models: Real-ESRGAN x2plus/x4plus (BSD-3-Clause) default; 4x-UltraSharp (CC BY-NC-SA 4.0) optional.
The server toggles denoise/sharpen by bypassing nodes (strength 0). Face enhance (GFPGAN) needs a custom node pack -> mock only."""
import json, os
d = os.path.join(os.path.dirname(__file__), "..", "workflows")
def graph(scale, model):
    g = {"1": {"class_type": "LoadImage", "inputs": {"image": "input.png"}},
         "2": {"class_type": "ImageBlur", "inputs": {"image": ["1", 0], "blur_radius": 1, "sigma": 0.5}, "_meta": {"title": "Denoise (pre-blur; radius 0 = off)"}},
         "3": {"class_type": "UpscaleModelLoader", "inputs": {"model_name": model}},
         "4": {"class_type": "ImageUpscaleWithModel", "inputs": {"upscale_model": ["3", 0], "image": ["2", 0]}}}
    last = "4"
    if scale == 8:
        g["5"] = {"class_type": "ImageUpscaleWithModel", "inputs": {"upscale_model": ["6", 0], "image": ["4", 0]}}
        g["6"] = {"class_type": "UpscaleModelLoader", "inputs": {"model_name": "RealESRGAN_x2plus.pth"}}; last = "5"
    g["7"] = {"class_type": "ImageSharpen", "inputs": {"image": [last, 0], "sharpen_radius": 1, "sigma": 1.0, "alpha": 0.5}, "_meta": {"title": "Sharpen (alpha 0 = off)"}}
    g["8"] = {"class_type": "SaveImage", "inputs": {"images": ["7", 0], "filename_prefix": "openhiggsfield/image-upscale"}}
    return g
for name, scale, model in [("image-upscale-x2-api.json", 2, "RealESRGAN_x2plus.pth"), ("image-upscale-x4-api.json", 4, "RealESRGAN_x4plus.pth"),
                           ("image-upscale-x8-api.json", 8, "RealESRGAN_x4plus.pth"), ("image-upscale-ultrasharp-x4-api.json", 4, "4x-UltraSharp.pth")]:
    json.dump(graph(scale, model), open(os.path.join(d, name), "w"), indent=1); print("wrote", name)

# ---- 2026-10-22: better upscalers (core nodes only; node "1" = LoadImage, node "8" = SaveImage in every graph, like the ones above) ----
# 4x Nomos2 DAT2 (Phhofm, CC-BY 4.0): plain x4, no pre-blur / sharpen; x2 = the x4 result scaled 0.5 (lanczos).
def nomos2(scale):
    g = {"1": {"class_type": "LoadImage", "inputs": {"image": "input.png"}},
         "3": {"class_type": "UpscaleModelLoader", "inputs": {"model_name": "4xNomos2_hq_dat2.pth"}},
         "4": {"class_type": "ImageUpscaleWithModel", "inputs": {"upscale_model": ["3", 0], "image": ["1", 0]}}}
    last = "4"
    if scale == 2:
        g["5"] = {"class_type": "ImageScaleBy", "inputs": {"image": ["4", 0], "upscale_method": "lanczos", "scale_by": 0.5}, "_meta": {"title": "x4 -> x2 (lanczos 0.5)"}}; last = "5"
    g["8"] = {"class_type": "SaveImage", "inputs": {"images": [last, 0], "filename_prefix": "openhiggsfield/image-upscale"}}
    return g
# SeedVR2 3B fp16, native core nodes: adapted from the official Comfy template utility_seedvr2_3b_int8_upscale_image.json
# (Comfy-Org/workflow_templates, MIT): subgraph flattened, UNETLoader seedvr2_3b_int8_convrot -> seedvr2_3b_fp16 (int8 ConvRot has no fast
# MPS kernel), colour correction lab. The server sets 11."resize_type.multiplier" (2 or 4) and 17.seed.
def seedvr2():
    tiled = {"tile_size": 512, "overlap": 128, "temporal_size": 4096, "temporal_overlap": 8}
    return {"1": {"class_type": "LoadImage", "inputs": {"image": "input.png"}},
            "10": {"class_type": "JoinImageWithAlpha", "inputs": {"image": ["1", 0], "alpha": ["1", 1]}},
            "11": {"class_type": "ResizeImageMaskNode", "inputs": {"input": ["10", 0], "resize_type": "scale by multiplier", "resize_type.multiplier": 4, "scale_method": "lanczos"}, "_meta": {"title": "Scale factor"}},
            "12": {"class_type": "SeedVR2Preprocess", "inputs": {"resized_images": ["11", 0]}},
            "13": {"class_type": "VAELoader", "inputs": {"vae_name": "seedvr2_ema_vae_fp16.safetensors"}},
            "14": {"class_type": "UNETLoader", "inputs": {"unet_name": "seedvr2_3b_fp16.safetensors", "weight_dtype": "default"}},
            "15": {"class_type": "VAEEncodeTiled", "inputs": {"pixels": ["12", 0], "vae": ["13", 0], **tiled}},
            "16": {"class_type": "SeedVR2Conditioning", "inputs": {"model": ["14", 0], "vae_conditioning": ["15", 0]}},
            "17": {"class_type": "KSampler", "inputs": {"model": ["14", 0], "positive": ["16", 0], "negative": ["16", 1], "latent_image": ["15", 0], "seed": 959948902156062, "steps": 1, "cfg": 1, "sampler_name": "euler", "scheduler": "simple", "denoise": 1}},
            "18": {"class_type": "VAEDecodeTiled", "inputs": {"samples": ["17", 0], "vae": ["13", 0], **tiled}},
            "19": {"class_type": "SeedVR2PostProcessing", "inputs": {"images": ["18", 0], "original_resized_images": ["11", 0], "color_correction_method": "lab"}},
            "8": {"class_type": "SaveImage", "inputs": {"images": ["19", 0], "filename_prefix": "openhiggsfield/image-upscale"}}}
# Z-Image-Turbo 2K upscaler: adapted from the official Comfy template utility_z_image_turbo_2k_upscaler.app.json (MIT): subgraph flattened,
# RealESRGAN_x4plus.safetensors -> .pth (the file we ship). Scale to N MP -> Real-ESRGAN x4 -> lanczos 0.5 -> Z-Image-Turbo 5 steps, denoise 0.33.
# Output = 4x the 20.megapixels value; the server sets it so the result is the asked factor (source MP x factor^2 / 4) and 31.seed.
def zimage2k():
    return {"1": {"class_type": "LoadImage", "inputs": {"image": "input.png"}},
            "20": {"class_type": "ImageScaleToTotalPixels", "inputs": {"image": ["1", 0], "upscale_method": "lanczos", "megapixels": 1, "resolution_steps": 1}, "_meta": {"title": "Working size (output = 4x these MP)"}},
            "21": {"class_type": "UpscaleModelLoader", "inputs": {"model_name": "RealESRGAN_x4plus.pth"}},
            "22": {"class_type": "ImageUpscaleWithModel", "inputs": {"upscale_model": ["21", 0], "image": ["20", 0]}},
            "23": {"class_type": "ImageScaleBy", "inputs": {"image": ["22", 0], "upscale_method": "lanczos", "scale_by": 0.5}},
            "24": {"class_type": "UNETLoader", "inputs": {"unet_name": "z_image_turbo_bf16.safetensors", "weight_dtype": "default"}},
            "25": {"class_type": "ModelSamplingAuraFlow", "inputs": {"model": ["24", 0], "shift": 3}},
            "26": {"class_type": "CLIPLoader", "inputs": {"clip_name": "qwen_3_4b.safetensors", "type": "lumina2", "device": "default"}},
            "27": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["26", 0], "text": "masterpiece, 8k"}},
            "28": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["26", 0], "text": ""}},
            "29": {"class_type": "VAELoader", "inputs": {"vae_name": "ae.safetensors"}},
            "30": {"class_type": "VAEEncode", "inputs": {"pixels": ["23", 0], "vae": ["29", 0]}},
            "31": {"class_type": "KSampler", "inputs": {"model": ["25", 0], "positive": ["27", 0], "negative": ["28", 0], "latent_image": ["30", 0], "seed": 824287194145573, "steps": 5, "cfg": 1, "sampler_name": "dpmpp_2m_sde", "scheduler": "beta", "denoise": 0.33}},
            "32": {"class_type": "VAEDecode", "inputs": {"samples": ["31", 0], "vae": ["29", 0]}},
            "8": {"class_type": "SaveImage", "inputs": {"images": ["32", 0], "filename_prefix": "openhiggsfield/image-upscale"}}}
for name, g in [("image-upscale-nomos2-x4-api.json", nomos2(4)), ("image-upscale-nomos2-x2-api.json", nomos2(2)),
                ("image-upscale-seedvr2-3b-api.json", seedvr2()), ("image-upscale-zimage-2k-api.json", zimage2k())]:
    json.dump(g, open(os.path.join(d, name), "w"), indent=1); print("wrote", name)
