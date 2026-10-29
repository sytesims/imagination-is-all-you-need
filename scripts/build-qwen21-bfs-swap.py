#!/usr/bin/env python3
"""Derive the Face Swap and Person Swap graphs for Qwen Image 2.1 from our official-template edit graph
(workflows/create-image-qwen21-edit-api.json, Comfy-Org image_qwen_image_2_1_image_edit, MIT) plus the community BFS LoRAs
by Alissonerdx (https://huggingface.co/Alissonerdx/BFS-Best-Face-Swap). Core ComfyUI nodes only.

Both follow the creator's Qwen Image 2.1 guides (docs/qwen-image-2.1.md and docs/qwen-image-2.1-body.md in that repo):
  - Image 1 / <image1> = the target (scene) image, Image 2 / <image2> = the reference head / person. Keep this order.
  - LoRA strength 1.0, on the Qwen Image 2.1 base model (LoraLoaderModelOnly between the UNET loader and the Qwen 2.1 cache).
  - The guide's prompt, verbatim (head_swap: ... / body_swap: ...); the server appends the user's touch-ups after it.
  - Body swap only: scene scaled to about 2 MP and reference to about 0.59 MP (ImageScaleToTotalPixels, aspect kept), both into
    TextEncodeQwenImage21 with resolution 0, scene first; the sampler latent comes from the encoder's latent output (already so in
    the template). Head swap keeps the template's resolution (1024: references at about 1 MP).
  - Sampler as in the official edit template (25 steps, cfg 1, euler / simple); the guides set no other values.
The template's optional Qwen 3.5 prompt enhancer is removed (its rewrite would replace the LoRA's trigger prompt).

1. create-image-qwen21-faceswap-api.json   + bfs_head_v1.1_qwen_2.1.safetensors       (Face Swap, app-face-swap)
2. create-image-qwen21-personswap-api.json + bfs_body_swap_v1.0_qwen_2.1.safetensors  (Person Swap, app-person-swap)
Usage: python3 scripts/build-qwen21-bfs-swap.py   (no ComfyUI needed)"""
import copy, json, pathlib
W = pathlib.Path(__file__).resolve().parent.parent / 'workflows'
BASE = 'create-image-qwen21-edit-api.json'
g0 = json.loads((W / BASE).read_text())
nm0 = json.loads((W / 'node-maps/create-image-qwen21-edit.json').read_text())
ENC = next(k for k, n in g0.items() if n['class_type'] == 'TextEncodeQwenImage21')
UNET = next(k for k, n in g0.items() if n['class_type'] == 'UNETLoader')
CACHE = next(k for k, n in g0.items() if n['class_type'] == 'QwenImage21Cache')
SAVE = next(k for k, n in g0.items() if n['class_type'].startswith('SaveImage'))
ENHANCER = [k for k, n in g0.items() if n['class_type'] in ('TextGenerate', 'BatchImagesNode', 'PreviewAny', 'PrimitiveStringMultiline', 'ComfySwitchNode')
            and k != g0[next(x for x, m in g0.items() if m['class_type'] == 'KSampler')]['inputs']['latent_image'][0]]
ENHANCER += [k for k, n in g0.items() if n['class_type'] == 'CLIPLoader' and 'pe_i2i' in n['inputs']['clip_name']]
SRC = 'https://huggingface.co/Alissonerdx/BFS-Best-Face-Swap'
HEAD_PROMPT = ('head_swap: start with <image1> as the base image, keeping its lighting, environment, and background. remove the head from <image1> '
               'completely and replace it with the head from <image2>, strictly preserving the hair, eye color, nose structure from <image2>. copy the '
               'direction of the eye, head rotation, micro expressions from <image1>, high quality, sharp details, 4k')
BODY_PROMPT = ('body_swap: start with <image1> as the base image, keeping its lighting, environment, and background. replace the body from <image1> '
               'with the body from <image2>, strictly preserving the clothing, body shape and proportions from <image2>. copy the pose, direction of '
               'the eye, head rotation, micro expressions from <image1>')

def base(lora, prompt, prefix):
    g = copy.deepcopy(g0)
    for k in ENHANCER: g.pop(k, None)
    g[ENC]['inputs']['prompt'] = prompt
    g['490'] = {'class_type': 'LoraLoaderModelOnly', 'inputs': {'lora_name': lora, 'strength_model': 1.0, 'model': [UNET, 0]},
                '_meta': {'title': f'BFS LoRA ({lora}, Alissonerdx)'}}
    g[CACHE]['inputs']['model'] = ['490', 0]
    g['470']['_meta']['title'] = 'Image 1 (target / scene)'
    g['475']['_meta']['title'] = 'Image 2 (reference head / person)'
    g[SAVE]['inputs']['filename_prefix'] = prefix
    return g

def write(name, g, lora, prompt, extra=None):
    (W / name).write_text(json.dumps(g, indent=2, ensure_ascii=False))
    nm = {'workflowFile': name, 'template': nm0['template'], 'model': f'Qwen Image 2.1 edit + {lora} (BFS by Alissonerdx)',
          'inputs': {'prompt': {'node': ENC, 'field': 'prompt'}, 'image': {'node': '470', 'field': 'image'}},
          'refs': nm0['refs'], 'seed': nm0['seed'], 'output': {'node': SAVE},
          'lora': {'node': '490', 'file': lora, 'strength': 1.0, 'source': SRC}, 'promptTemplate': prompt, **(extra or {})}
    (W / 'node-maps' / name.replace('-api.json', '.json')).write_text(json.dumps(nm, indent=2, ensure_ascii=False))
    print(f'wrote {name}: {len(g)} nodes')

# ---- 1. Face Swap: head LoRA, template resolution ----
LH = 'bfs_head_v1.1_qwen_2.1.safetensors'
write('create-image-qwen21-faceswap-api.json', base(LH, HEAD_PROMPT, 'openhiggsfield/face-swap'), LH, HEAD_PROMPT)

# ---- 2. Person Swap: body LoRA, scene ~2 MP, reference ~0.59 MP, encoder resolution 0 ----
LB = 'bfs_body_swap_v1.0_qwen_2.1.safetensors'
g = base(LB, BODY_PROMPT, 'openhiggsfield/person-swap')
g['491'] = {'class_type': 'ImageScaleToTotalPixels', 'inputs': {'image': ['470', 0], 'upscale_method': 'lanczos', 'megapixels': 2.0, 'resolution_steps': 1},
            '_meta': {'title': 'Scene to about 2 MP'}}
g['492'] = {'class_type': 'ImageScaleToTotalPixels', 'inputs': {'image': ['475', 0], 'upscale_method': 'lanczos', 'megapixels': 0.59, 'resolution_steps': 1},
            '_meta': {'title': 'Reference to about 0.59 MP'}}
g[ENC]['inputs']['images.image_1'] = ['491', 0]
g[ENC]['inputs']['images.image_2'] = ['492', 0]
g[ENC]['inputs']['resolution'] = 0
write('create-image-qwen21-personswap-api.json', g, LB, BODY_PROMPT, {'scale': {'scene': {'node': '491', 'megapixels': 2.0}, 'reference': {'node': '492', 'megapixels': 0.59}}})
