#!/usr/bin/env python3
"""OpenSoul (tool `soul`): writes workflows/soul-*-api.json + workflows/node-maps/soul-*.json.
Shared node ids across every graph so server/src/tools/soul/plan.ts can patch them uniformly:
  10/11/12 LoRA chain (realism, style A, style B; bypassed when unused) · 20 positive · 21 negative · 30 latent · 31 sampler · 32 decode
  40 colour-ref LoadImage → 41 ColorTransfer (dropped when off) · 50/51 Real-ESRGAN upscale (dropped when off) · 9 SaveImage
  60/61/62 reference photos (character engines). Run: python3 scripts/build-soul-workflows.py"""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); WF = os.path.join(ROOT, 'workflows')
L = lambda n, i=0: [n, i]

def lora_chain(g, model_src, realism):
    g['10'] = {'class_type': 'LoraLoaderModelOnly', 'inputs': {'model': model_src, 'lora_name': realism, 'strength_model': 0.5}, '_meta': {'title': 'Realism LoRA'}}
    g['11'] = {'class_type': 'LoraLoaderModelOnly', 'inputs': {'model': L('10'), 'lora_name': realism, 'strength_model': 0.0}, '_meta': {'title': 'Style LoRA A'}}
    g['12'] = {'class_type': 'LoraLoaderModelOnly', 'inputs': {'model': L('11'), 'lora_name': realism, 'strength_model': 0.0}, '_meta': {'title': 'Style LoRA B'}}
    return L('12')

def tail(g, image_src, prefix='openhiggsfield/soul'):
    g['40'] = {'class_type': 'LoadImage', 'inputs': {'image': 'colour-ref.png'}, '_meta': {'title': 'Colour reference / HEX swatch'}}
    g['41'] = {'class_type': 'ColorTransfer', 'inputs': {'image_target': image_src, 'image_ref': L('40'), 'method': 'reinhard_lab', 'source_stats': 'per_frame', 'strength': 0.5}, '_meta': {'title': 'Colour match'}}
    g['50'] = {'class_type': 'UpscaleModelLoader', 'inputs': {'model_name': 'RealESRGAN_x2plus.pth'}}
    g['51'] = {'class_type': 'ImageUpscaleWithModel', 'inputs': {'upscale_model': L('50'), 'image': L('41')}}
    g['9'] = {'class_type': 'SaveImage', 'inputs': {'images': L('51'), 'filename_prefix': prefix}}

def base(kind):
    g = {}
    if kind in ('zit',):
        g['1'] = {'class_type': 'UNETLoader', 'inputs': {'unet_name': 'z_image_turbo_bf16.safetensors', 'weight_dtype': 'default'}}
        g['2'] = {'class_type': 'CLIPLoader', 'inputs': {'clip_name': 'qwen_3_4b.safetensors', 'type': 'lumina2', 'device': 'default'}}
        g['3'] = {'class_type': 'VAELoader', 'inputs': {'vae_name': 'ae.safetensors'}}
        m = lora_chain(g, L('1'), 'Z-Image-Turbo-Realism-LoRA.safetensors')
        g['13'] = {'class_type': 'ModelSamplingAuraFlow', 'inputs': {'shift': 3, 'model': m}}
        g['20'] = {'class_type': 'CLIPTextEncode', 'inputs': {'text': '', 'clip': L('2')}}
        g['21'] = {'class_type': 'ConditioningZeroOut', 'inputs': {'conditioning': L('20')}}
        sm, pos, neg, steps, cfg, sampler = L('13'), L('20'), L('21'), 8, 1, 'res_multistep'
    elif kind in ('flux1dev', 'pulid', 'infiniteyou', 'aceplus'):
        unet = 'flux1-fill-dev.safetensors' if kind == 'aceplus' else 'flux1-dev-fp8.safetensors'
        g['1'] = {'class_type': 'UNETLoader', 'inputs': {'unet_name': unet, 'weight_dtype': 'default'}}
        g['2'] = {'class_type': 'DualCLIPLoader', 'inputs': {'clip_name1': 'clip_l.safetensors', 'clip_name2': 't5xxl_fp8_e4m3fn.safetensors', 'type': 'flux', 'device': 'default'}}
        g['3'] = {'class_type': 'VAELoader', 'inputs': {'vae_name': 'ae.safetensors'}}
        src = L('1')
        if kind == 'aceplus':
            g['14'] = {'class_type': 'LoraLoaderModelOnly', 'inputs': {'model': src, 'lora_name': 'comfyui_portrait_lora64.safetensors', 'strength_model': 1.0}, '_meta': {'title': 'ACE++ portrait/subject LoRA'}}
            src = L('14')
        m = lora_chain(g, src, 'fluxRealSkin-V2.safetensors')
        g['20'] = {'class_type': 'CLIPTextEncode', 'inputs': {'text': '', 'clip': L('2')}}
        g['22'] = {'class_type': 'FluxGuidance', 'inputs': {'conditioning': L('20'), 'guidance': 50 if kind == 'aceplus' else 3.5}}
        g['21'] = {'class_type': 'ConditioningZeroOut', 'inputs': {'conditioning': L('20')}}
        sm, pos, neg, steps, cfg, sampler = m, L('22'), L('21'), 20 if kind != 'aceplus' else 28, 1, 'euler'
        if kind == 'pulid':
            g['70'] = {'class_type': 'PulidFluxModelLoader', 'inputs': {'pulid_file': 'pulid_flux_v0.9.1.safetensors'}}
            g['71'] = {'class_type': 'PulidFluxEvaClipLoader', 'inputs': {}}
            g['72'] = {'class_type': 'PulidFluxInsightFaceLoader', 'inputs': {'provider': 'CUDA'}}
            g['60'] = {'class_type': 'LoadImage', 'inputs': {'image': 'ref-1.png'}, '_meta': {'title': 'Reference photo'}}
            g['73'] = {'class_type': 'ApplyPulidFlux', 'inputs': {'model': m, 'pulid_flux': L('70'), 'eva_clip': L('71'), 'face_analysis': L('72'), 'image': L('60'), 'weight': 0.9, 'start_at': 0.0, 'end_at': 1.0}}
            sm = L('73')
        if kind == 'infiniteyou':
            g['60'] = {'class_type': 'LoadImage', 'inputs': {'image': 'ref-1.png'}, '_meta': {'title': 'Reference photo'}}
            g['74'] = {'class_type': 'IDEmbeddingModelLoader', 'inputs': {'image_proj_model_name': 'aes_stage2/image_proj_model.bin', 'image_proj_num_tokens': 8, 'face_analysis_provider': 'CUDA', 'face_analysis_det_size': 'AUTO'}}
            g['75'] = {'class_type': 'ExtractIDEmbedding', 'inputs': {'face_detector': L('74', 0), 'arcface_model': L('74', 1), 'image_proj_model': L('74', 2), 'image': L('60')}}
            g['76'] = {'class_type': 'ExtractFacePoseImage', 'inputs': {'face_detector': L('74', 0), 'image': L('60'), 'width': 1024, 'height': 1024}}
            g['77'] = {'class_type': 'InfuseNetLoader', 'inputs': {'controlnet_name': 'aes_stage2/infusenet_aes_fp8e4m3fn.safetensors'}}
            g['78'] = {'class_type': 'InfuseNetApply', 'inputs': {'positive': L('22'), 'negative': L('21'), 'id_embedding': L('75'), 'control_net': L('77'), 'image': L('76'), 'strength': 1.0, 'start_percent': 0.0, 'end_percent': 1.0, 'vae': L('3')}}
            pos, neg = L('78', 0), L('78', 1)
        if kind == 'aceplus':  # ACE++ in-context: [reference | blank] canvas, repaint the right half
            g['60'] = {'class_type': 'LoadImage', 'inputs': {'image': 'ref-1.png'}, '_meta': {'title': 'Reference photo'}}
            g['80'] = {'class_type': 'ImageScale', 'inputs': {'image': L('60'), 'upscale_method': 'lanczos', 'width': 768, 'height': 1024, 'crop': 'center'}}
            g['81'] = {'class_type': 'EmptyImage', 'inputs': {'width': 768, 'height': 1024, 'batch_size': 1, 'color': 16777215}}
            g['82'] = {'class_type': 'ImageStitch', 'inputs': {'image1': L('80'), 'image2': L('81'), 'direction': 'right', 'match_image_size': True, 'spacing_width': 0, 'spacing_color': 'white'}}
            g['83'] = {'class_type': 'SolidMask', 'inputs': {'value': 0.0, 'width': 1536, 'height': 1024}}
            g['84'] = {'class_type': 'SolidMask', 'inputs': {'value': 1.0, 'width': 768, 'height': 1024}}
            g['85'] = {'class_type': 'MaskComposite', 'inputs': {'destination': L('83'), 'source': L('84'), 'x': 768, 'y': 0, 'operation': 'add'}}
            g['86'] = {'class_type': 'InpaintModelConditioning', 'inputs': {'positive': L('22'), 'negative': L('21'), 'vae': L('3'), 'pixels': L('82'), 'mask': L('85'), 'noise_mask': True}}
            g['87'] = {'class_type': 'DifferentialDiffusion', 'inputs': {'model': m}}
            sm, pos, neg = L('87'), L('86', 0), L('86', 1)
    elif kind in ('qwen', 'qwenedit'):
        unet = 'qwen_image_edit_2511_fp8mixed.safetensors' if kind == 'qwenedit' else 'qwen_image_2512_fp8_e4m3fn.safetensors'
        g['1'] = {'class_type': 'UNETLoader', 'inputs': {'unet_name': unet, 'weight_dtype': 'default'}}
        g['2'] = {'class_type': 'CLIPLoader', 'inputs': {'clip_name': 'qwen_2.5_vl_7b_fp8_scaled.safetensors', 'type': 'qwen_image', 'device': 'default'}}
        g['3'] = {'class_type': 'VAELoader', 'inputs': {'vae_name': 'qwen_image_vae.safetensors'}}
        m = lora_chain(g, L('1'), 'CoolShot_2000s_qwen.safetensors')
        g['13'] = {'class_type': 'ModelSamplingAuraFlow', 'inputs': {'shift': 3.1, 'model': m}}
        if kind == 'qwenedit':
            for k, n in (('60', 1), ('61', 2), ('62', 3)):
                g[k] = {'class_type': 'LoadImage', 'inputs': {'image': f'ref-{n}.png'}, '_meta': {'title': f'Reference photo {n}'}}
            g['15'] = {'class_type': 'CFGNorm', 'inputs': {'model': L('13'), 'strength': 1.0}}
            g['20'] = {'class_type': 'TextEncodeQwenImageEditPlus', 'inputs': {'clip': L('2'), 'prompt': '', 'vae': L('3'), 'image1': L('60'), 'image2': L('61'), 'image3': L('62')}}
            g['21'] = {'class_type': 'TextEncodeQwenImageEditPlus', 'inputs': {'clip': L('2'), 'prompt': '', 'vae': L('3'), 'image1': L('60'), 'image2': L('61'), 'image3': L('62')}}
            sm = L('15')
        else:
            g['20'] = {'class_type': 'CLIPTextEncode', 'inputs': {'text': '', 'clip': L('2')}}
            g['21'] = {'class_type': 'CLIPTextEncode', 'inputs': {'text': 'blurry, lowres, watermark, text', 'clip': L('2')}}
            sm = L('13')
        pos, neg, steps, cfg, sampler = L('20'), L('21'), 20 if kind == 'qwen' else 30, 2.5 if kind == 'qwen' else 4.0, 'euler'
    lat = L('86', 2) if kind == 'aceplus' else L('30')
    if kind != 'aceplus': g['30'] = {'class_type': 'EmptySD3LatentImage', 'inputs': {'width': 1024, 'height': 1024, 'batch_size': 1}}
    g['31'] = {'class_type': 'KSampler', 'inputs': {'seed': 0, 'steps': steps, 'cfg': cfg, 'sampler_name': sampler, 'scheduler': 'simple', 'denoise': 1, 'model': sm, 'positive': pos, 'negative': neg, 'latent_image': lat}}
    g['32'] = {'class_type': 'VAEDecode', 'inputs': {'samples': L('31'), 'vae': L('3')}}
    img = L('32')
    if kind == 'aceplus':
        g['88'] = {'class_type': 'ImageCrop', 'inputs': {'image': L('32'), 'width': 768, 'height': 1024, 'x': 768, 'y': 0}, '_meta': {'title': 'Keep the generated half'}}
        img = L('88')
    tail(g, img)
    return g

GRAPHS = {
  'soul-zit': ('zit', 'Z-Image-Turbo + realism LoRA + style LoRA(s)'),
  'soul-flux1dev': ('flux1dev', 'FLUX.1-dev + FluxRealSkin + style LoRA(s)'),
  'soul-qwen': ('qwen', 'Qwen-Image-2512 + style LoRA(s)'),
  'soul-ref-pulid': ('pulid', 'FLUX.1-dev + PuLID-FLUX v0.9.1 (one face photo)'),
  'soul-ref-infiniteyou': ('infiniteyou', 'FLUX.1-dev + InfiniteYou aes_stage2 (one face photo, max likeness)'),
  'soul-ref-aceplus': ('aceplus', 'FLUX.1-Fill-dev + ACE++ portrait/subject LoRA (in-context)'),
  'soul-ref-qwenedit': ('qwenedit', 'Qwen-Image-Edit-2511 (1–3 reference photos)'),
}
for name, (kind, model) in GRAPHS.items():
    g = base(kind); f = f'{name}-api.json'
    json.dump(g, open(os.path.join(WF, f), 'w'), indent=1)
    refs = [k for k in ('60', '61', '62') if k in g]
    nmap = {'workflowFile': f, 'model': model, 'inputs': {'prompt': {'node': '20', 'field': 'prompt' if kind == 'qwenedit' else 'text'}, 'colourRef': {'node': '40', 'field': 'image'}},
            'loras': {'realism': '10', 'styleA': '11', 'styleB': '12'}, 'refs': [{'node': k, 'field': 'image'} for k in refs],
            'latent': '86' if kind == 'aceplus' else '30', 'colour': '41', 'upscale': {'loader': '50', 'apply': '51'}, 'seed': {'node': '31', 'field': 'seed'}, 'output': {'node': '9'}}
    json.dump(nmap, open(os.path.join(WF, 'node-maps', f'{name}.json'), 'w'), indent=1)
    print('wrote', f)
