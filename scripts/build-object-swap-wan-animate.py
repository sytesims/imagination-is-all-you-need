#!/usr/bin/env python3
"""Hand-authored ComfyUI API graph: Object / character swap with Wan 2.2 Animate (Mix mode).

  python3 scripts/build-object-swap-wan-animate.py [--object-info FILE | --url http://127.0.0.1:8190]

Writes (no install, no download, nothing executed):
  workflows/object-swap-wan-animate-api.json          base segment + 1 extend (77 + 72 frames @16 fps, ~9.3 s)
  workflows/object-swap-wan-animate/ext-0..6.json     0..6 extends (4.8 / 9.3 / 13.8 / 18.3 / 22.8 / 27.3 / 31.8 s)
  workflows/object-swap-wan-animate/mask-ext-0..6.json  same lengths, mask-override wiring (user mask video instead of SAM2)
  workflows/node-maps/object-swap-wan-animate.json    placeholder map (same node ids as server/src/comfy/objectSwap.ts)

Every node class, input name and widget value follows the official sources cited in
workflows/object-swap-wan-animate.NOTES.md (ComfyUI core comfy_extras/nodes_wan.py WanAnimateToVideo schema and the
Comfy-Org template video_wan2_2_14B_animate). Node ids are the template's, so the existing tool placeholders
(10, 145, 21, 159/160, 229, 232:63, extN:91, 277) keep working.
With object_info available, every node is checked offline: class exists, required inputs present, no unknown inputs,
combo values allowed (model-file combos reported, not failed), links point at an existing node output of the right type.
"""
import json, os, sys, urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
WF = os.path.join(ROOT, 'workflows')
FPS, SEG, NEW_PER_EXT = 16, 77, 72          # template: 77-frame segments, continue_motion_max_frames 5 -> 72 new frames per extend
NEG = ('色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，'
       '画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走')  # template node 1, verbatim

def node(cls, title, **inputs): return {'inputs': inputs, 'class_type': cls, '_meta': {'title': title}}

def build(n_ext=1, mask_override=False):
    g = {
        # --- models (template ids 20/18/99/60/2/3/4) ---
        '20': node('UNETLoader', 'Load Diffusion Model · Wan 2.2 Animate 14B fp8 (KJ)', unet_name='Wan2_2-Animate-14B_fp8_e4m3fn_scaled_KJ.safetensors', weight_dtype='default'),
        '18': node('LoraLoaderModelOnly', 'Load LoRA · lightx2v 4-step distill', lora_name='lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors', strength_model=1.0, model=['20', 0]),
        '99': node('LoraLoaderModelOnly', 'Load LoRA · Wan Animate relight', lora_name='WanAnimate_relight_lora_fp16.safetensors', strength_model=1.0, model=['18', 0]),
        '60': node('ModelSamplingSD3', 'ModelSamplingSD3', shift=8.0, model=['99', 0]),
        '2': node('CLIPLoader', 'Load CLIP · umt5 xxl fp8', clip_name='umt5_xxl_fp8_e4m3fn_scaled.safetensors', type='wan', device='default'),
        '3': node('VAELoader', 'Load VAE · Wan 2.1', vae_name='wan_2.1_vae.safetensors'),
        '4': node('CLIPVisionLoader', 'Load CLIP Vision · ViT-H', clip_name='clip_vision_h.safetensors'),
        # --- placeholders (server/src/comfy/objectSwap.ts patchGraph) ---
        '10': node('LoadImage', 'OpenHiggsfield · reference image (placeholder)', image='oj_ref.png'),
        '145': node('LoadVideo', 'OpenHiggsfield · source video, 16 fps (placeholder)', file='oj_source.mp4'),
        '21': node('CLIPTextEncode', 'OpenHiggsfield · positive prompt (placeholder)', text='The character moves naturally in the scene', clip=['2', 0]),
        '1': node('CLIPTextEncode', 'Negative prompt (template)', text=NEG, clip=['2', 0]),
        '159': node('PrimitiveInt', 'OpenHiggsfield · width (placeholder, multiple of 16)', value=832),
        '160': node('PrimitiveInt', 'OpenHiggsfield · height (placeholder, multiple of 16)', value=480),
        # --- source prep ---
        '23': node('GetVideoComponents', 'Get Video Components', video=['145', 0]),
        '212': node('ImageScale', 'Upscale Image (to width x height)', upscale_method='lanczos', width=['159', 0], height=['160', 0], crop='center', image=['23', 0]),
        '9': node('CLIPVisionEncode', 'CLIP Vision Encode (reference)', crop='none', clip_vision=['4', 0], image=['10', 0]),
        # --- pose + face control (comfyui_controlnet_aux, as in the template) ---
        '158': node('PixelPerfectResolution', 'Pixel Perfect Resolution', original_image=['23', 0], image_gen_width=['159', 0], image_gen_height=['160', 0], resize_mode='Just Resize'),
        '100': node('DWPreprocessor', 'DWPose · face', image=['212', 0], detect_hand='disable', detect_body='disable', detect_face='enable', resolution=['158', 0],
                    bbox_detector='yolox_l.onnx', pose_estimator='dw-ll_ucoco_384_bs5.torchscript.pt', scale_stick_for_xinsr_cn='disable'),
        '101': node('DWPreprocessor', 'DWPose · body + hands', image=['212', 0], detect_hand='enable', detect_body='enable', detect_face='disable', resolution=['158', 0],
                    bbox_detector='yolox_l.onnx', pose_estimator='dw-ll_ucoco_384_bs5.torchscript.pt', scale_stick_for_xinsr_cn='disable'),
        # --- who/what to replace: SAM2 from a click point (KJNodes PointsEditor + segment-anything-2) ---
        '229': node('PointsEditor', 'OpenHiggsfield · target point (placeholder, pixels in width x height)',
                    points_store=json.dumps({'positive': [{'x': 416, 'y': 240}], 'negative': [{'x': 0, 'y': 0}]}), coordinates=json.dumps([{'x': 416, 'y': 240}]),
                    neg_coordinates=json.dumps([{'x': 0, 'y': 0}]), bbox_store='[{}]', bboxes='[{}]', bbox_format='xyxy', width=832, height=480, normalize=False, bg_image=['212', 0]),
        '108': node('DownloadAndLoadSAM2Model', '(Down)Load SAM2 model', model='sam2_hiera_base_plus.safetensors', segmentor='video', device='cuda', precision='fp16'),
        '107': node('Sam2Segmentation', 'Sam2Segmentation (video)', sam2_model=['108', 0], image=['212', 0], keep_model_loaded=True, coordinates_positive=['229', 0]),
        '274': node('GrowMask', 'Grow Mask', mask=['107', 0], expand=10, tapered_corners=True),
        '276': node('BlockifyMask', 'Blockify Mask', masks=['274', 0], block_size=32),
        '275': node('DrawMaskOnImage', 'Background video (masked area blacked out)', image=['212', 0], mask=['276', 0], color='0, 0, 0'),
    }
    if mask_override:  # user-supplied mask video (white = replace) instead of SAM2; same size/fps as the 16 fps source
        g['oj_mask_video'] = node('LoadVideo', 'OpenHiggsfield · mask video (placeholder, optional)', file='oj_mask.mp4')
        g['oj_mask_frames'] = node('GetVideoComponents', 'Mask video components', video=['oj_mask_video', 0])
        g['oj_mask_scale'] = node('ImageScale', 'Mask to width x height', upscale_method='nearest-exact', width=['159', 0], height=['160', 0], crop='center', image=['oj_mask_frames', 0])
        g['oj_mask'] = node('ImageToMask', 'Mask from red channel', image=['oj_mask_scale', 0], channel='red')
        g['274']['inputs']['mask'] = ['oj_mask', 0]
        for k in ('108', '107'): del g[k]
        g['229']['_meta']['title'] += ' · inert in mask mode (kept so patchGraph works unchanged)'
    common = lambda: dict(positive=['21', 0], negative=['1', 0], vae=['3', 0], width=['159', 0], height=['160', 0], length=SEG, batch_size=1,
                          continue_motion_max_frames=5, clip_vision_output=['9', 0], reference_image=['10', 0], face_video=['100', 0], pose_video=['101', 0],
                          background_video=['275', 0], character_mask=['276', 0])
    # --- base segment (template subgraph 232) ---
    g['232:62'] = node('WanAnimateToVideo', 'WanAnimateToVideo · base segment', **common(), video_frame_offset=0)
    g['232:63'] = node('KSampler', 'OpenHiggsfield · seed (placeholder) · KSampler base', model=['60', 0], seed=1106558644923357, steps=6, cfg=1.0, sampler_name='euler',
                       scheduler='simple', positive=['232:62', 0], negative=['232:62', 1], latent_image=['232:62', 2], denoise=1.0)
    g['232:57'] = node('TrimVideoLatent', 'Trim Video Latent (drop reference latents)', samples=['232:63', 0], trim_amount=['232:62', 3])
    g['232:58'] = node('VAEDecode', 'VAE Decode', samples=['232:57', 0], vae=['3', 0])
    g['232:230'] = node('ImageFromBatch', 'Get Image from Batch (trim_image)', image=['232:58', 0], batch_index=['232:62', 4], length=4096)
    frames, offset = ['232:230', 0], ['232:62', 5]
    # --- extends (template subgraph 975ed319 "Video Extend", ids extN:<template id>) ---
    for i in range(1, n_ext + 1):
        p = f'ext{i}:'
        g[p + '90'] = node('WanAnimateToVideo', f'Extend {i} · WanAnimateToVideo', **common(), video_frame_offset=offset, continue_motion=frames)
        g[p + '91'] = node('KSampler', f'Extend {i} · KSampler (seed = base seed + {i})', model=['60', 0], seed=1106558644923357 + i, steps=6, cfg=1.0, sampler_name='euler',
                           scheduler='simple', positive=[p + '90', 0], negative=[p + '90', 1], latent_image=[p + '90', 2], denoise=1.0)
        g[p + '92'] = node('TrimVideoLatent', f'Extend {i} · Trim Video Latent', samples=[p + '91', 0], trim_amount=[p + '90', 3])
        g[p + '87'] = node('VAEDecode', f'Extend {i} · VAE Decode', samples=[p + '92', 0], vae=['3', 0])
        g[p + '85'] = node('ImageFromBatch', f'Extend {i} · drop continue-motion frames', image=[p + '87', 0], batch_index=[p + '90', 4], length=4096)
        g[p + '86'] = node('ImageBatch', f'Extend {i} · append to previous frames', image1=frames, image2=[p + '85', 0])
        frames, offset = [p + '86', 0], [p + '90', 5]
    # --- output: video only (the 16 fps source has no audio; the server remuxes the original soundtrack with ffmpeg) ---
    g['oj_video'] = node('CreateVideo', 'Create Video (16 fps, no audio)', images=frames, fps=float(FPS))
    g['277'] = node('SaveVideo', 'OpenHiggsfield output', video=['oj_video', 0], filename_prefix='openhiggsfield/object-swap', format='auto', **{'format.codec': 'auto'})
    return g

# ------------------------------------------------------------------ offline checks against /object_info
MODEL_INPUTS = {'unet_name', 'lora_name', 'clip_name', 'vae_name', 'model', 'bbox_detector', 'pose_estimator'}
UPLOAD_INPUTS = {('LoadImage', 'image'), ('LoadVideo', 'file')}
def check(g, oi):
    errs, notes = [], []
    for nid, n in g.items():
        c = oi.get(n['class_type'])
        if not c: errs.append(f'{nid}: unknown class {n["class_type"]}'); continue
        req, opt = c['input'].get('required', {}), c['input'].get('optional', {})
        dyn = {f'{k}.{s}' for k, v in req.items() if v[0] == 'COMFY_DYNAMICCOMBO_V3' for s in ('codec',)}
        for k in req:
            if k not in n['inputs']: errs.append(f'{nid} {n["class_type"]}: missing required input {k}')
        for k, v in n['inputs'].items():
            spec = req.get(k) or opt.get(k)
            if spec is None and k not in dyn: errs.append(f'{nid} {n["class_type"]}: unknown input {k}'); continue
            if spec is None: continue
            if isinstance(v, list):  # link
                src = g.get(v[0])
                if not src: errs.append(f'{nid}.{k}: link to missing node {v[0]}'); continue
                so = oi.get(src['class_type'], {}).get('output', [])
                if v[1] >= len(so): errs.append(f'{nid}.{k}: {v[0]} has no output {v[1]}'); continue
                want = spec[0] if isinstance(spec[0], str) else 'COMBO'
                if want not in ('*', so[v[1]]) and not (want == 'COMBO' or so[v[1]] == '*'): errs.append(f'{nid}.{k}: type {so[v[1]]} -> {want}')
                continue
            t = spec[0]; opts = t if isinstance(t, list) else (spec[1].get('options') if t == 'COMBO' and len(spec) > 1 else None)
            if opts is not None and not isinstance(opts[0] if opts else '', dict) and v not in opts:
                (notes if (k in MODEL_INPUTS or (n['class_type'], k) in UPLOAD_INPUTS) else errs).append(f'{nid} {n["class_type"]}.{k}={v!r} not in this server\'s list')
            if t in ('INT', 'FLOAT') and len(spec) > 1:
                lo, hi = spec[1].get('min'), spec[1].get('max')
                if (lo is not None and v < lo) or (hi is not None and v > hi): errs.append(f'{nid}.{k}={v} outside [{lo},{hi}]')
    outs = [nid for nid, n in g.items() if oi.get(n['class_type'], {}).get('output_node')]
    if outs != ['277']: errs.append(f'output nodes {outs}, expected only 277')
    return errs, notes

def main():
    a = sys.argv[1:]; oi = None
    if '--object-info' in a: oi = json.load(open(a[a.index('--object-info') + 1]))
    else:
        url = a[a.index('--url') + 1] if '--url' in a else 'http://127.0.0.1:8190'
        try: oi = json.load(urllib.request.urlopen(url + '/object_info', timeout=60))
        except Exception as e: print(f'warning: no object_info ({e}); writing without schema checks')
    os.makedirs(os.path.join(WF, 'object-swap-wan-animate'), exist_ok=True)
    out = {'object-swap-wan-animate-api.json': build(1)}
    for n in range(7): out[f'object-swap-wan-animate/ext-{n}.json'] = build(n)
    for n in range(7): out[f'object-swap-wan-animate/mask-ext-{n}.json'] = build(n, mask_override=True)
    bad = 0
    for rel, g in out.items():
        if oi:
            errs, notes = check(g, oi); bad += len(errs)
            print(f'{"OK " if not errs else "ERR"} {rel}: {len(g)} nodes, {len(errs)} errors, {len(notes)} notes')
            for e in errs: print('   error:', e)
            for x in notes: print('   note: ', x)
        json.dump(g, open(os.path.join(WF, rel), 'w'), indent=1, ensure_ascii=False)
    nm = {'workflowFile': 'object-swap-wan-animate-api.json', 'variants': 'object-swap-wan-animate/ext-{0..6}.json (N extends), mask-ext-{0..6}.json (mask override)',
          'notes': 'workflows/object-swap-wan-animate.NOTES.md', 'builder': 'scripts/build-object-swap-wan-animate.py',
          'inputs': {'image': {'node': '10', 'field': 'image', 'class_type': 'LoadImage'}, 'video': {'node': '145', 'field': 'file', 'class_type': 'LoadVideo', 'note': 'pre-converted to 16 fps, width x height, no audio'},
                     'prompt': {'node': '21', 'field': 'text', 'class_type': 'CLIPTextEncode'}},
          'output': {'node': '277', 'class_type': 'SaveVideo'},
          'extra': {'width': {'node': '159', 'field': 'value', 'default': 832, 'also': '229.width'}, 'height': {'node': '160', 'field': 'value', 'default': 480, 'also': '229.height'},
                    'point': {'node': '229', 'fields': ['coordinates', 'points_store'], 'format': 'pixels in width x height, JSON [{x,y}]'}, 'negativePoint': {'node': '229', 'field': 'neg_coordinates'},
                    'seed': {'nodes': ['232:63', 'extN:91'], 'field': 'seed', 'rule': 'extN = seed + N'},
                    'length': {'how': 'pick the variant file', 'secondsPerVariant': [round((SEG + NEW_PER_EXT * n) / FPS, 1) for n in range(7)], 'fps': FPS},
                    'mask': {'files': 'object-swap-wan-animate/mask-ext-{0..6}.json', 'node': 'oj_mask_video', 'field': 'file', 'format': 'video, white = replace, same fps/size as the 16 fps source (red channel read)'},
                    'negativePrompt': {'node': '1', 'field': 'text'}}}
    json.dump(nm, open(os.path.join(WF, 'node-maps', 'object-swap-wan-animate.json'), 'w'), indent=1)
    print('lengths (s @16 fps):', [round((SEG + NEW_PER_EXT * n) / FPS, 1) for n in range(7)])
    sys.exit(1 if bad else 0)

if __name__ == '__main__': main()
