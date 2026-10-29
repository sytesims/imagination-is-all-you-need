#!/usr/bin/env python3
"""Derive two graphs from our Qwen-Image-Edit-2509 graph (workflows/create-image-qwen-edit2509-api.json, Comfy-Org template, MIT).
No new custom nodes; core ComfyUI only (LoadImage, TextEncodeQwenImageEditPlus, LoraLoaderModelOnly).

1. create-image-qwen-edit2509-multiref-api.json: up to 3 images. TextEncodeQwenImageEditPlus takes image1..image3 (image2/3 optional);
   the template wires only image1. Image 2 and 3 are new LoadImage nodes 79 / 80 on both encoders. Face Swap: image 1 = target photo,
   image 2 = face. Unused refs are unlinked and dropped per job (server/src/comfy/plans.ts image()). Same weights as the 2509 graph.
2. shots-qwen-edit2509-angles-api.json (Shots, optional route): the 2509 graph plus the multiple-angles LoRA
   dx8152/Qwen-Edit-2509-Multiple-angles (Apache-2.0, https://huggingface.co/dx8152/Qwen-Edit-2509-Multiple-angles), chained after the
   Lightning switch. Local file name Qwen-Edit-2509-Multiple-angles.safetensors (upstream file name is Chinese; readiness manifest maps it).

Both node maps point the prompt at the POSITIVE encoder (the one feeding KSampler.positive). The template's two encoders both carry a
string prompt, and the generic picker in build-workflows-media.py took the negative one; this script also repairs that in
node-maps/create-image-qwen-edit2509.json (the Create Image edit + inpaint graphs share it).
Usage: python3 scripts/build-qwen-edit-multiref.py   (no ComfyUI needed; validate with npm run workflows:validate)"""
import copy, json, pathlib
W = pathlib.Path(__file__).resolve().parent.parent / 'workflows'
BASE = 'create-image-qwen-edit2509-api.json'
g0 = json.loads((W / BASE).read_text())
ks = next(k for k, n in g0.items() if n['class_type'] == 'KSampler')
POS, NEG = g0[ks]['inputs']['positive'][0], g0[ks]['inputs']['negative'][0]
assert g0[POS]['class_type'] == g0[NEG]['class_type'] == 'TextEncodeQwenImageEditPlus'
SAVE = next(k for k, n in g0.items() if n['class_type'].startswith('SaveImage'))
SEED = {'node': ks, 'field': 'seed'}
nm0 = json.loads((W / 'node-maps/create-image-qwen-edit2509.json').read_text())
nm0['inputs']['prompt'] = {'node': POS, 'field': 'prompt'}
(W / 'node-maps/create-image-qwen-edit2509.json').write_text(json.dumps(nm0, indent=2, ensure_ascii=False))

def write(name, g, nm):
    (W / name).write_text(json.dumps(g, indent=2, ensure_ascii=False))
    (W / 'node-maps' / name.replace('-api.json', '.json')).write_text(json.dumps({'workflowFile': name, **nm}, indent=2, ensure_ascii=False))
    print(f'wrote {name}: {len(g)} nodes')

# ---- 1. multi-reference (up to 3 images) ----
g = copy.deepcopy(g0)
g[POS]['inputs']['prompt'] = ''  # the server fills the user's edit instruction
g['78'].setdefault('_meta', {})['title'] = 'Image 1 (target / main image)'
for k, nid in ((2, '79'), (3, '80')):
    g[nid] = {'class_type': 'LoadImage', 'inputs': {'image': f'reference_{k}.png'}, '_meta': {'title': f'Image {k}' + (' (face)' if k == 2 else '')}}
    for enc in (POS, NEG): g[enc]['inputs'][f'image{k}'] = [nid, 0]
g[SAVE]['inputs']['filename_prefix'] = 'openhiggsfield/create-image'
write('create-image-qwen-edit2509-multiref-api.json', g, {
    'template': nm0.get('template'), 'model': 'Qwen-Image-Edit-2509 (Apache-2.0), up to 3 images',
    'inputs': {'prompt': {'node': POS, 'field': 'prompt'}, 'image': {'node': '78', 'field': 'image'}},
    'refs': [{'node': '78', 'field': 'image'}, {'node': '79', 'field': 'image'}, {'node': '80', 'field': 'image'}],
    'seed': SEED, 'output': {'node': SAVE}, 'maxRefs': 3})

# ---- 2. Shots: + multiple-angles LoRA after the Lightning switch ----
g = copy.deepcopy(g0)
g[POS]['inputs']['prompt'] = 'Rotate the camera 45 degrees to the left.'
sw = next(k for k, n in g.items() if n['class_type'] == 'ModelSamplingAuraFlow')  # model chain: UNET -> (Lightning switch) -> AuraFlow -> CFGNorm
g['950'] = {'class_type': 'LoraLoaderModelOnly', 'inputs': {'lora_name': 'Qwen-Edit-2509-Multiple-angles.safetensors', 'strength_model': 1.0, 'model': g[sw]['inputs']['model']},
            '_meta': {'title': 'Multiple-angles LoRA (dx8152, Apache-2.0)'}}
g[sw]['inputs']['model'] = ['950', 0]
g[SAVE]['inputs']['filename_prefix'] = 'openhiggsfield/shots'
write('shots-qwen-edit2509-angles-api.json', g, {
    'template': nm0.get('template'), 'model': 'Qwen-Image-Edit-2509 + Qwen-Edit-2509-Multiple-angles LoRA (both Apache-2.0)',
    'inputs': {'prompt': {'node': POS, 'field': 'prompt'}, 'image': {'node': '78', 'field': 'image'}},
    'refs': [{'node': '78', 'field': 'image'}], 'seed': SEED, 'output': {'node': SAVE},
    'lora': {'node': '950', 'file': 'Qwen-Edit-2509-Multiple-angles.safetensors', 'source': 'https://huggingface.co/dx8152/Qwen-Edit-2509-Multiple-angles'}})
