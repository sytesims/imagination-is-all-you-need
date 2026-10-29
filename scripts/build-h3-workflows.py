#!/usr/bin/env python3
"""Build our own MiniMax H3 ComfyUI graphs (API format) for the approved H3 additions (2026-10-17).
Core nodes only (MiniMaxH3ImageToVideo / MiniMaxH3ReferenceToVideo / MiniMaxH3AddGuide + LoraLoaderModelOnly), derived from our
existing workflows/h3-i2v-api.json and h3-r2v-api.json. Nothing is downloaded: model/LoRA files are manifest entries only
(readiness/manifest/build-manifest.py H3 block). Every graph obeys the H3 rules checked by scripts/validate-workflows.py --rules:
frames 17n+5, width/height multiples of 32, area <= 1344x768, LoRA family == base family (fl2va | ref2va), pruned-compatible.
Usage: python3 scripts/build-h3-workflows.py"""
import copy, json, os
W = os.path.join(os.path.dirname(__file__), '..', 'workflows')
load = lambda n: json.load(open(os.path.join(W, n)))
def save(n, g): json.dump(g, open(os.path.join(W, n), 'w'), indent=2); print('wrote', n)
TE = 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors'
VVAE = 'minimax_h3_video_vae_int8_convrot.safetensors'; AVAE = 'minimax_h3_audio_vae_fp32.safetensors'
FL2VA = 'minimax_h3_fl2va_pruned_int8_convrot.safetensors'; REF2VA = 'minimax_h3_ref2va_pruned_int8_convrot.safetensors'
FL2V_TURBO8 = 'minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors'; REF2V_TURBO4 = 'minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors'
# Community LoRAs (manifest entries only; file names are our local names, mapped to the source repo in the manifest)
CAMERA = 'camera_motion_h3_lora_v1_3000_pruned.safetensors'
STYLE = 'minimax_h3_style_transfer_v1.0_r64.safetensors'
VFX = 'minimax_h3_vfx_edit_v1.0_r128.safetensors'
N = lambda c, i, t=None: {'inputs': i, 'class_type': c, '_meta': {'title': t or c}}

def base(model, steps, sampler='res_multistep', scheduler='simple', loras=(), seconds=5.0, w=1344, h=768):
    """Shared H3 skeleton: loaders, LoRA chain, sampler, AV decode, CreateVideo 24 fps, SaveVideo. Conditioning node id = '20'."""
    g = {
        '1': N('UNETLoader', {'unet_name': model, 'weight_dtype': 'default'}, 'Load Diffusion Model'),
        '2': N('CLIPLoader', {'clip_name': TE, 'type': 'minimax', 'device': 'default'}, 'Load CLIP'),
        '3': N('VAELoader', {'vae_name': VVAE}, 'Load Video VAE'), '4': N('VAELoader', {'vae_name': AVAE}, 'Load Audio VAE'),
        '5': N('RandomNoise', {'noise_seed': 42}), '6': N('KSamplerSelect', {'sampler_name': sampler}),
        '7': N('PrimitiveFloat', {'value': seconds}, 'Seconds'),
        '8': N('ComfyMathExpression', {'expression': 'max(5, round(a * 24)) + (5 - (max(5, round(a * 24)) % 17)) % 17', 'values.a': ['7', 0]}, 'Frames (17n+5)'),
        '9': N('PrimitiveInt', {'value': w}, 'Width (x32)'), '10': N('PrimitiveInt', {'value': h}, 'Height (x32)'),
        '11': N('PrimitiveInt', {'value': steps}, 'Steps'),
    }
    m = ['1', 0]
    for k, (name, s) in enumerate(loras):
        nid = str(30 + k); g[nid] = N('LoraLoaderModelOnly', {'lora_name': name, 'strength_model': s, 'model': m}, f'LoRA {k + 1}'); m = [nid, 0]
    g['12'] = N('BasicScheduler', {'scheduler': scheduler, 'steps': ['11', 0], 'denoise': 1, 'model': m})
    g['13'] = N('BasicGuider', {'model': m, 'conditioning': ['20', 0]}, 'Guider (CFG 1)')
    g['14'] = N('SamplerCustomAdvanced', {'noise': ['5', 0], 'guider': ['13', 0], 'sampler': ['6', 0], 'sigmas': ['12', 0], 'latent_image': ['20', 1]})
    g['15'] = N('VAEDecode', {'samples': ['14', 0], 'vae': ['3', 0]}); g['16'] = N('VAEDecodeAudio', {'samples': ['14', 0], 'vae': ['4', 0]})
    g['17'] = N('CreateVideo', {'fps': 24, 'bit_depth': 8, 'images': ['15', 0], 'audio': ['16', 0]})
    g['18'] = N('SaveVideo', {'filename_prefix': 'openhiggsfield/h3', 'format': 'auto', 'format.codec': 'auto', 'video': ['17', 0]})
    return g
def i2v(g, prompt, first=None, last=None):
    g['20'] = N('MiniMaxH3ImageToVideo', {'clip': ['2', 0], 'vae': ['3', 0], 'prompt': prompt, 'width': ['9', 0], 'height': ['10', 0], 'length': ['8', 1], **({'first_frame': first} if first else {}), **({'last_frame': last} if last else {})})
def r2v(g, prompt, images=(), videos=(), video_audios=(), audios=()):
    i = {'clip': ['2', 0], 'vae': ['3', 0], 'audio_vae': ['4', 0], 'prompt': prompt, 'width': ['9', 0], 'height': ['10', 0], 'length': ['8', 1], 'ref_image_size': 'match'}
    for k, x in enumerate(images): i[f'ref_images.ref_image_{k}'] = x
    for k, x in enumerate(videos): i[f'ref_videos.ref_video_{k}'] = x
    for k, x in enumerate(video_audios): i[f'ref_video_audios.ref_video_audio_{k}'] = x
    for k, x in enumerate(audios): i[f'ref_audios.ref_audio_{k}'] = x
    g['20'] = N('MiniMaxH3ReferenceToVideo', i)
def guided(g, frames, audio=None, idx=0):
    """Anchor source frames (+ audio) via MiniMaxH3AddGuide; the guider reads the guided conditioning, latent stays from node 20."""
    g['21'] = N('MiniMaxH3AddGuide', {'positive': ['20', 0], 'latent': ['20', 1], 'frame_idx': idx, 'vae': ['3', 0], 'audio_vae': ['4', 0], 'image': frames, **({'audio': audio} if audio else {})}, 'Guide: source clip')
    g['13']['inputs']['conditioning'] = ['21', 0]
def source_video(g):
    g['40'] = N('LoadVideo', {'file': 'input.mp4'}, 'Source video'); g['41'] = N('GetVideoComponents', {'video': ['40', 0]}); return ['41', 0], ['41', 1]

# 1) Generate Video: first + last frame (FL2VA), Fast = LightX2V 8-step LoRA (Quality = 20 steps, no LoRA)
for fast in (False, True):
    g = base(FL2VA, 8 if fast else 20, loras=[(FL2V_TURBO8, 1.0)] if fast else [])
    g['50'] = N('LoadImage', {'image': 'first.png'}, 'First frame'); g['51'] = N('LoadImage', {'image': 'last.png'}, 'Last frame')
    i2v(g, '', ['50', 0], ['51', 0]); save(f"h3-flf{'-fast' if fast else ''}-api.json", g)
# Text-to-video Fast (8-step LoRA) as its own graph so routing can price/describe it without toggles
g = base(FL2VA, 8, loras=[(FL2V_TURBO8, 1.0)]); i2v(g, ''); save('h3-t2v-fast-api.json', g)
# 2) Voice "Talking photo": portrait + audio -> lipsync (Ref2VA + Ref2V turbo LoRA, ~6 steps per the Local Lab recipe)
g = base(REF2VA, 6, loras=[(REF2V_TURBO4, 1.0)])
g['50'] = N('LoadImage', {'image': 'portrait.png'}, 'Portrait'); g['52'] = N('LoadAudio', {'audio': 'speech.wav'}, 'Speech audio')
r2v(g, 'Image 1 speaks the words of Audio 1 with natural lip sync, subtle head motion and blinks. Keep the face identical.', images=[['50', 0]], audios=[['52', 0]])
save('h3-lipsync-api.json', g)
# 3) Character Swap: built by the Object Swap worker (workflows/object-swap-h3-charswap-api.json); Motion Transfer reuses that graph
#    with a motion prompt (server/src/comfy/objectSwap.ts h3SwapPrompt), so no second copy here.
# 4) Camera Moves: camera_motion_h3 LoRA on FL2VA (trigger "camera motion"); intensity = LoRA strength (Slow 0.6 / Aggressive 1.0)
g = base(FL2VA, 20, loras=[(CAMERA, 1.0)]); g['50'] = N('LoadImage', {'image': 'input.png'}, 'Start frame')
i2v(g, 'camera motion, slow push-in toward the subject', ['50', 0]); save('h3-camera-motion-api.json', g)
# 5a) Extend: continuation on FL2VA. The tail of the source (22 frames = 17*1+5) + its audio are anchored at frame 0; the server
#     concatenates source + new footage (minus the 22-frame overlap) with ffmpeg. +5 s -> 124 new frames, +10 s -> 243.
g = base(FL2VA, 20, seconds=5.0 + 22 / 24); fr, au = source_video(g)
g['42'] = N('ImageFromBatch', {'image': fr, 'batch_index': 0, 'length': 22}, 'Source tail (22 frames)')
g['43'] = N('TrimAudioDuration', {'audio': au, 'start_index': -0.917, 'duration': 0.917}, 'Source tail audio')
i2v(g, ''); guided(g, ['42', 0], ['43', 0], 0); save('h3-extend-api.json', g)
# 5b) Restyle (style_transfer:) and video FX (vfx_edit:) LoRAs on Ref2VA, guided by the source clip. Local only (licence: no hosted API/SaaS).
for name, lora, trig, s in (('h3-style-transfer-api.json', STYLE, 'style_transfer: ', 1.0), ('h3-vfx-edit-api.json', VFX, 'vfx_edit: ', 1.0)):
    g = base(REF2VA, 8, loras=[(lora, s), (REF2V_TURBO4, 1.0)]); fr, au = source_video(g)
    imgs = []
    if 'style' in name: g['50'] = N('LoadImage', {'image': 'style.png'}, 'Style reference'); imgs = [['50', 0]]
    r2v(g, trig + ('restyle Video 1 in the style of Image 1, keep motion and timing' if imgs else 'add the described effect to Video 1, keep everything else'), images=imgs, videos=[fr], video_audios=[au])
    save(name, g)
