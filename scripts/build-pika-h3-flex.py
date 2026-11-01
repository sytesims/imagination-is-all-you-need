#!/usr/bin/env python3
"""Pika H3 Flex (FL2VA adapter): the official Comfy templates video_pika_h3_flex_t2v and video_pika_h3_flex_fl2va
(Comfy-Org/workflow_templates, MIT; https://docs.comfy.org/tutorials/video/pika/pika-h3-flex) as API graphs for our plan
(server/src/comfy/pikaH3Flex.ts).

Usage: python3 scripts/build-pika-h3-flex.py [object_info.json]
  the templates are workflows/templates/video_pika_h3_flex_{t2v,fl2va}.json, the official files bundled unchanged (workflow_templates commit c067929d).
  object_info defaults to server/test/fixtures/object-info-pika-h3-flex-cloud-2026-10-26.json (Comfy Cloud's object_info of 2026-10-26 for the classes
  these graphs use; the Pika LoRA came out on 2026-10-29, so that copy doesn't list it: the run checks for it, comfy/pikaH3Flex.ts).
Steps: scripts/ui2api.py flattens the "Image to Video (Pika H3 Flex)" subgraph (template node ids kept, as 140:<id>). Every sampling setting is the
template's own: LoraLoaderModelOnly pika_h3_flex_fl2va_v1_bf16 at 1.0, KSamplerSelect lcm, ManualSigmas (Pika's 6-step list), BasicGuider (CFG 1),
CreateVideo 24 fps, ComfyMathExpression 17k + 5 frames. Our changes:
  - fl2va: an ImageScaleToTotalPixels (node 154) in front of GetImageSize, so the size follows the picked 768p / 480p instead of the photo's own pixels
    (the template sizes the clip from the raw first frame); the frames still go to MiniMaxH3ImageToVideo unscaled, which resizes them itself;
  - RandomNoise takes the plan's seed (0 here), the LoadImage nodes hold placeholder names (the plan sets the uploads);
  - SaveVideo writes openhiggsfield/pika-h3-flex.
Writes workflows/pika-h3-flex-{t2v,fl2va}-api.json (your own ComfyUI: the template's own files) and workflows/cloud/pika-h3-flex-{t2v,fl2va}-api.json
(Comfy Cloud: the same graph with the fp16 video VAE, because the template's int8 ConvRot VAE was not in Comfy Cloud's library; cloud/h3-*-api.json do the same).
"""
import json, os, subprocess, sys, tempfile
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
oi = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'server/test/fixtures/object-info-pika-h3-flex-cloud-2026-10-26.json')
P = '140:'
CLOUD_VAE = 'minimax_h3_video_vae_fp16.safetensors'

def convert(name):
    with tempfile.TemporaryDirectory() as d:
        raw = os.path.join(d, 'raw.json')
        subprocess.run([sys.executable, '-I', os.path.join(ROOT, 'scripts/ui2api.py'), os.path.join(ROOT, f'workflows/templates/{name}.json'), oi, raw], check=True)
        return json.load(open(raw))

def finish(g):
    g[P + '129']['inputs']['noise_seed'] = 0
    g['92']['inputs']['filename_prefix'] = 'openhiggsfield/pika-h3-flex'
    for k, n in g.items():
        n['_meta'] = {'title': n['_meta']['title']}
        for f, v in n['inputs'].items():
            if isinstance(v, list) and len(v) == 2 and isinstance(v[0], str) and v[0] not in g: sys.exit(f'{k}.{f} links to missing {v[0]}')
    key = lambda x: [int(p) for p in x.split(':')]
    return {k: g[k] for k in sorted(g, key=key)}

t2v = convert('video_pika_h3_flex_t2v')
fl2va = convert('video_pika_h3_flex_fl2va')
fl2va['148']['inputs']['image'] = 'first.png'
fl2va['147']['inputs']['image'] = 'last.png'
fl2va['154'] = {'inputs': {'upscale_method': 'nearest-exact', 'megapixels': 0.98, 'resolution_steps': 32, 'image': ['148', 0]}, 'class_type': 'ImageScaleToTotalPixels', '_meta': {'title': 'Size for 768p / 480p'}}
fl2va['149']['inputs']['image'] = ['154', 0]

for mode, g in (('t2v', finish(t2v)), ('fl2va', finish(fl2va))):
    cloud = json.loads(json.dumps(g)); cloud[P + '119']['inputs']['vae_name'] = CLOUD_VAE
    for f, out in ((f'workflows/pika-h3-flex-{mode}-api.json', g), (f'workflows/cloud/pika-h3-flex-{mode}-api.json', cloud)):
        json.dump(out, open(os.path.join(ROOT, f), 'w'), indent=2, ensure_ascii=False); open(os.path.join(ROOT, f), 'a').write('\n')
        print(f'wrote {len(out)} nodes to {f}')
