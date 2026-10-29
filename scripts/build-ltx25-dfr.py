#!/usr/bin/env python3
"""LTX-2.5 DFR (Diffusion Fidelity Rendering) image to video: the official Comfy template video_ltx2_5_dfr_i2v
(Comfy-Org/workflow_templates, MIT; https://github.com/Comfy-Org/workflow_templates/blob/main/templates/video_ltx2_5_dfr_i2v.json)
as an API graph for our plan (server/src/comfy/ltx25Dfr.ts).

Usage: python3 scripts/build-ltx25-dfr.py [video_ltx2_5_dfr_i2v.json] [object_info.json]
  the template defaults to workflows/templates/video_ltx2_5_dfr_i2v.json, the official file bundled unchanged (commit 0cf483d1, MIT).
  object_info defaults to server/test/fixtures/object-info-ltx25-dfr.json (Comfy Cloud's object_info of 2026-10-26 for the template's classes,
  plus the three generated-keyframe nodes from ComfyUI core comfy_extras/nodes_lt_keyframes.py, which that copy predates).
Steps: scripts/ui2api.py flattens the "Image to Video (LTX-2.5 DFR)" subgraph (template node ids kept, as 5953:<id>), then:
  - the prompt enhancer (TextGenerateLTX2Prompt + its small Gemma 4 file) is left out, as the template's default (off): the prompt goes straight
    into the positive CLIPTextEncode;
  - the output size is the plan's (ResizeImageMaskNode 5953:5904 width / height) instead of the ResolutionSelector, which is removed;
  - LTXVEmptyLatentAudio batch_size 1 (its frame_rate is linked, so the converter shifted the widget values);
  - the three RandomNoise nodes take the plan's seed (the template feeds one promoted seed to all three);
  - SaveVideo writes openhiggsfield/ltx25-dfr.
Writes workflows/ltx25-dfr-i2v-api.json (local) and workflows/cloud/ltx25-dfr-i2v-api.json (Comfy Cloud): the same graph, the template's own files.
"""
import json, os, subprocess, sys, tempfile
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
ui = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'workflows/templates/video_ltx2_5_dfr_i2v.json'); oi = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'server/test/fixtures/object-info-ltx25-dfr.json')
with tempfile.TemporaryDirectory() as d:
    raw = os.path.join(d, 'raw.json')
    subprocess.run([sys.executable, '-I', os.path.join(ROOT, 'scripts/ui2api.py'), ui, oi, raw], check=True)
    g = json.load(open(raw))
P = '5953:'
g[P + '5771']['inputs']['text'] = ''
g[P + '5792']['inputs']['batch_size'] = 1
g[P + '5904']['inputs'].update({'resize_type.width': 1280, 'resize_type.height': 704})
g.pop('5954', None)
for s in ('5808', '5843', '5878'): g[P + s]['inputs']['noise_seed'] = 0
g['2004']['inputs']['image'] = 'office_garden_169_outpaint.png'
g['4852']['inputs'] = {'video': g['4852']['inputs']['video'], 'filename_prefix': 'openhiggsfield/ltx25-dfr', 'format': 'auto', 'format.codec': 'auto'}
for k, n in g.items():
    n['_meta'] = {'title': n['_meta']['title']}
    for f, v in n['inputs'].items():
        if isinstance(v, list) and len(v) == 2 and isinstance(v[0], str) and v[0] not in g: sys.exit(f'{k}.{f} links to missing {v[0]}')
key = lambda x: [int(p) for p in x.split(':')]
out = {k: g[k] for k in sorted(g, key=key)}
for f in ('workflows/ltx25-dfr-i2v-api.json', 'workflows/cloud/ltx25-dfr-i2v-api.json'):
    json.dump(out, open(os.path.join(ROOT, f), 'w'), indent=2); open(os.path.join(ROOT, f), 'a').write('\n')
    print(f'wrote {len(out)} nodes to {f}')
